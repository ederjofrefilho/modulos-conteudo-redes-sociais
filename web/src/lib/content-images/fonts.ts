import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Fontes da arte (TTF ou WOFF estático — o Satori não lê woff2 nem fonte
 * variável), as do design system da marca: IBM Plex Sans 300/400/600 nos
 * títulos, subtítulos e numerais; Inter 400/600 nos rótulos de seção; IBM
 * Plex Mono 400 nos rótulos de dado e no endereço. Ficam em
 * `apps/web/assets/fonts` (licença OFL, ver README lá) e entram no bundle da
 * função pelo `outputFileTracingIncludes` do `next.config.mjs`.
 */
export type ArtFont = {
  name: string;
  data: ArrayBuffer;
  weight: 300 | 400 | 600;
  style: 'normal';
};

const FILES: Array<Omit<ArtFont, 'data'> & { file: string }> = [
  { name: 'IBM Plex Sans', file: 'IBMPlexSans-Light.ttf', weight: 300, style: 'normal' },
  { name: 'IBM Plex Sans', file: 'IBMPlexSans-Regular.ttf', weight: 400, style: 'normal' },
  { name: 'IBM Plex Sans', file: 'IBMPlexSans-SemiBold.ttf', weight: 600, style: 'normal' },
  { name: 'Inter', file: 'Inter-Regular.woff', weight: 400, style: 'normal' },
  { name: 'Inter', file: 'Inter-SemiBold.woff', weight: 600, style: 'normal' },
  // Rótulo de dado e endereço (brand book de 14/10/2026).
  { name: 'IBM Plex Mono', file: 'IBMPlexMono-Regular.ttf', weight: 400, style: 'normal' },
];

// `next dev`/Vercel rodam com cwd = apps/web; vitest e scripts, na raiz do monorepo.
function fontsDir(): string {
  const candidates = [join(process.cwd(), 'assets', 'fonts'), join(process.cwd(), 'apps', 'web', 'assets', 'fonts')];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0]!;
}

let cached: Promise<ArtFont[]> | null = null;

export function loadArtFonts(): Promise<ArtFont[]> {
  cached ??= (async () => {
    const dir = fontsDir();
    return Promise.all(
      FILES.map(async ({ file, ...meta }) => {
        const buf = await readFile(join(dir, file));
        return { ...meta, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer };
      }),
    );
  })().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}
