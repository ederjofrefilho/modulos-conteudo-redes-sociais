import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { put } from '@vercel/blob';
import { IMAGE_PALETTE, IMAGE_TEMPLATES } from '@app/content/image-templates';
import type { images } from '@app/content';
import { artFor, isDark } from './art';
import { loadArtFonts } from './fonts';
import { loadLogo, loadMedia } from './media';

/**
 * Adaptadores das imagens do conteúdo (`@app/content` → `images.*`): o que
 * é inevitavelmente de fora — desenhar (`next/og`), converter (`sharp`) e
 * guardar (Vercel Blob, store `content`). Nenhuma regra aqui: validação,
 * formato e registro do asset são do módulo.
 */

type Deps = images.ContentImageDeps;

const renderer: Deps['renderer'] = {
  async render(template, fields, media) {
    const spec = IMAGE_TEMPLATES[template];
    const [logo, loaded] = await Promise.all([loadLogo(isDark(fields), fields.logo === 'mono'), loadMedia(media)]);
    const res = new ImageResponse(artFor(template, { fields, media: loaded, logo }), {
      width: spec.width,
      height: spec.height,
      fonts: await loadArtFonts(),
    });
    return new Uint8Array(await res.arrayBuffer());
  },
};

const codec: Deps['codec'] = {
  async probe(bytes) {
    const meta = await sharp(bytes, { animated: false }).metadata();
    if (!meta.width || !meta.height) throw new Error('Imagem sem dimensões legíveis');
    return { width: meta.width, height: meta.height };
  },
  async toJpeg(bytes, opts = {}) {
    let img = sharp(bytes, { animated: false }).rotate().flatten({ background: IMAGE_PALETTE.sheet });
    if (opts.maxWidth) img = img.resize({ width: opts.maxWidth, withoutEnlargement: true });
    const { data, info } = await img.jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    return { bytes: new Uint8Array(data), width: info.width, height: info.height };
  },
};

/**
 * Mesmo store do upload pela tela (`api/content/assets/upload`): sem `token`
 * explícito — em produção `put` resolve OIDC + `BLOB_STORE_ID` sozinho (ver
 * comentário daquela rota). Em `next dev` local não há Blob: a prévia
 * funciona, salvar explica o que falta.
 */
const storage: Deps['storage'] = {
  async put(pathname, bytes, contentType) {
    // Só BLOB_STORE_ID: `BLOB_READ_WRITE_TOKEN` é do store do desktop, nunca deste.
    if (!process.env.BLOB_STORE_ID) {
      throw new Error(
        'BLOB_STORE_ID não configurado — conecte o store "content" ao projeto (Storage > content > Connect Project). ' +
          'Em desenvolvimento local, só a prévia funciona.',
      );
    }
    const blob = await put(pathname, Buffer.from(bytes), {
      access: 'public',
      contentType,
      addRandomSuffix: true,
    });
    return { url: blob.url, pathname: blob.pathname };
  },
};

export function contentImageDeps(): Deps {
  return { renderer, codec, storage };
}
