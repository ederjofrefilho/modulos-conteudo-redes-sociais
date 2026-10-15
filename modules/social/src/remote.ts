// A publicação como está na rede (`SocialPost.remote`), gravada pela
// sincronização (sync.ts). Puro — o navegador importa por `@app/social/remote`
// para desenhar a miniatura e a prévia. As URLs do Instagram expiram: `thumbUrl`
// é sempre uma cópia no Blob do CRM; `url` é a original (vídeo para tocar ou
// imagem em tamanho cheio) e pode deixar de abrir — a prévia cai na cópia.

export type RemoteType = 'TEXT' | 'IMAGE' | 'CAROUSEL' | 'VIDEO' | 'REEL' | 'STORY' | 'DOCUMENT' | 'ARTICLE';

export const REMOTE_TYPE_LABEL: Record<RemoteType, string> = {
  TEXT: 'Texto',
  IMAGE: 'Imagem',
  CAROUSEL: 'Carrossel',
  VIDEO: 'Vídeo',
  REEL: 'Reel',
  STORY: 'Story',
  DOCUMENT: 'Documento',
  ARTICLE: 'Link',
};

export interface RemoteMediaItem {
  kind: 'image' | 'video' | 'document';
  /** Original na rede (pode expirar). */
  url: string | null;
  /** Cópia no CRM (Blob), para a prévia não partir. */
  thumbUrl: string | null;
  width?: number | null;
  height?: number | null;
  title?: string | null;
}

export interface RemoteContent {
  type: RemoteType;
  items: RemoteMediaItem[];
  linkUrl?: string | null;
  linkTitle?: string | null;
  /** Story: some da rede depois disto. */
  expiresAt?: string | null;
  syncedAt: string;
}

const TYPES = new Set<string>(Object.keys(REMOTE_TYPE_LABEL));

export function readRemote(value: unknown): RemoteContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.type !== 'string' || !TYPES.has(v.type)) return null;
  const items = Array.isArray(v.items)
    ? (v.items as Record<string, unknown>[])
        .filter((i) => i && typeof i === 'object')
        .map((i): RemoteMediaItem => ({
          kind: i.kind === 'video' ? 'video' : i.kind === 'document' ? 'document' : 'image',
          url: typeof i.url === 'string' ? i.url : null,
          thumbUrl: typeof i.thumbUrl === 'string' ? i.thumbUrl : null,
          width: typeof i.width === 'number' ? i.width : null,
          height: typeof i.height === 'number' ? i.height : null,
          title: typeof i.title === 'string' ? i.title : null,
        }))
    : [];
  return {
    type: v.type as RemoteType,
    items,
    linkUrl: typeof v.linkUrl === 'string' ? v.linkUrl : null,
    linkTitle: typeof v.linkTitle === 'string' ? v.linkTitle : null,
    expiresAt: typeof v.expiresAt === 'string' ? v.expiresAt : null,
    syncedAt: typeof v.syncedAt === 'string' ? v.syncedAt : new Date(0).toISOString(),
  };
}

/** Miniatura para lista/calendário: a cópia do CRM; sem cópia, a original de uma imagem. */
export function remoteThumb(remote: RemoteContent | null): string | null {
  if (!remote) return null;
  for (const item of remote.items) {
    if (item.thumbUrl) return item.thumbUrl;
  }
  const image = remote.items.find((i) => i.kind === 'image' && i.url);
  return image?.url ?? null;
}

/** Formato do painel (FORMAT_LABEL) a partir do tipo na rede. */
export function remoteFormat(type: RemoteType): 'TEXT' | 'IMAGE' | 'CAROUSEL' | 'LINK' | 'VIDEO' {
  switch (type) {
    case 'IMAGE':
    case 'STORY':
      return 'IMAGE';
    case 'CAROUSEL':
    case 'DOCUMENT':
      return 'CAROUSEL';
    case 'VIDEO':
    case 'REEL':
      return 'VIDEO';
    case 'ARTICLE':
      return 'LINK';
    default:
      return 'TEXT';
  }
}

export interface RemotePreviewMedia {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
  mimeType: string;
}

/**
 * Itens da rede no formato da prévia (`SocialPreview`): imagem pela cópia do
 * CRM (a original pode ter expirado); vídeo pela original para tocar, ou a
 * capa como imagem se já não houver URL. Documento sem capa fica de fora (a
 * prévia mostra só o texto e o link para a rede).
 */
export function remotePreviewMedia(remote: RemoteContent | null, provider: 'LINKEDIN' | 'INSTAGRAM'): RemotePreviewMedia[] {
  if (!remote) return [];
  const [w, h] = provider === 'INSTAGRAM' ? (remote.type === 'REEL' || remote.type === 'STORY' ? [1080, 1920] : [1080, 1350]) : [1200, 1200];
  const out: RemotePreviewMedia[] = [];
  remote.items.forEach((item, i) => {
    const size = { width: item.width ?? w, height: item.height ?? h };
    const alt = item.title ?? `Item ${i + 1} da publicação`;
    if (item.kind === 'video' && item.url && remote.items.length === 1) {
      out.push({ id: `r${i}`, url: item.url, ...size, alt, mimeType: 'video/mp4' });
    } else if (item.thumbUrl || (item.kind === 'image' && item.url)) {
      out.push({ id: `r${i}`, url: (item.thumbUrl ?? item.url)!, ...size, alt, mimeType: 'image/jpeg' });
    }
  });
  return out;
}
