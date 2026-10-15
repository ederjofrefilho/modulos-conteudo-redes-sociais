/**
 * Que arquivos a biblioteca de conteúdo aceita. PURO (sem Prisma), no subpath
 * `@app/content/media`: o seletor do navegador, a rota de token do Blob e o
 * serviço usam a mesma lista.
 *
 * Vídeo entrou em 14/10/2026 (brand book da marca, decisão de produto): todo vídeo
 * é feito fora do CRM e só enviado para cá para ser publicado. Por isso não há
 * conversão nem edição; o CRM guarda o MP4 como veio e confere o que as redes
 * exigem (`@app/social/rules`).
 */

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/**
 * MP4 é o formato que LinkedIn e Instagram aceitam os dois. MOV entrou em
 * 15/10/2026: é o que a galeria do iPhone entrega; o Instagram publica, o
 * LinkedIn não (as regras de `@app/social/rules` avisam no composer).
 */
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;

export const ASSET_MIME_TYPES = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES] as const;

/**
 * Teto de vídeo do CRM, abaixo do das redes (Instagram 300 MB, LinkedIn
 * 500 MB): para publicar no LinkedIn a função baixa o arquivo e o reenvia em
 * partes dentro dos 60 s do cron. Um anúncio de 30 s em 1080p fica muito
 * abaixo disto (o de referência tem 23 MB).
 */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export type AssetKind = 'image' | 'video';

export function assetKind(mimeType: string): AssetKind {
  return mimeType.startsWith('video/') ? 'video' : 'image';
}

export function isVideoMime(mimeType: string): boolean {
  return assetKind(mimeType) === 'video';
}

/** "1:05" a partir de milissegundos. */
export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) return '';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
