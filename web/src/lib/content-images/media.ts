import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { BRAND_MEDIA_BY_ID, type MediaKind } from '@app/content/image-templates';
import type { images } from '@app/content';

/**
 * Carrega logo e mídia da arte como data URI (o Satori não lê arquivo nem
 * WebP). O catálogo que vem com o CRM mora em `public/conteudo-midia` — o
 * mesmo arquivo serve a miniatura da tela e a arte, e entra no bundle da
 * função pelo `outputFileTracingIncludes` do `next.config.mjs`. Imagem da
 * biblioteca de conteúdo vem do Blob e passa pelo `sharp` (vira PNG, no
 * máximo 1600px), porque pode chegar em WebP ou GIF.
 */

export type LoadedImage = { src: string; width: number; height: number };
export type LoadedMedia = LoadedImage & { kind: MediaKind };

// `next dev`/Vercel rodam com cwd = apps/web; vitest e scripts, na raiz do monorepo.
function mediaDir(): string {
  const candidates = [
    join(process.cwd(), 'public', 'conteudo-midia'),
    join(process.cwd(), 'apps', 'web', 'public', 'conteudo-midia'),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0]!;
}

const cache = new Map<string, Promise<LoadedImage>>();

function loadFile(file: string): Promise<LoadedImage> {
  let hit = cache.get(file);
  if (!hit) {
    hit = (async () => {
      const buf = await readFile(join(mediaDir(), file));
      const meta = await sharp(buf).metadata();
      const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return { src: `data:${mime};base64,${buf.toString('base64')}`, width: meta.width!, height: meta.height! };
    })();
    hit.catch(() => cache.delete(file));
    cache.set(file, hit);
  }
  return hit;
}

/**
 * Logo de letra preta (fundos claros) ou branca (fundo escuro), colorida por
 * padrão ou toda numa cor (`mono`). Nunca recriada em texto.
 */
export function loadLogo(onDark: boolean, mono = false): Promise<LoadedImage> {
  return loadFile(`${onDark ? 'logo-branco' : 'logo-preto'}${mono ? '-mono' : ''}.png`);
}

export async function loadMedia(media: images.ResolvedMedia | undefined): Promise<LoadedMedia | undefined> {
  if (!media) return undefined;
  if (media.source === 'brand') {
    const item = BRAND_MEDIA_BY_ID[media.id]!;
    return { ...(await loadFile(item.file)), kind: item.kind };
  }
  const res = await fetch(media.url);
  if (!res.ok) throw new Error(`Não foi possível baixar a imagem da biblioteca (${res.status})`);
  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()), { animated: false })
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { src: `data:image/png;base64,${data.toString('base64')}`, width: info.width, height: info.height, kind: 'print' };
}
