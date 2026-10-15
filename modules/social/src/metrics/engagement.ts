// Métricas de um post e a fórmula ÚNICA de engagement — puro, sem Prisma,
// importado também pelo navegador (`@app/social/metrics`).
//
//   interações          = reações + comentários + partilhas + guardados
//   taxa de engagement  = interações ÷ impressões × 100
//
// "Impressões" é quantas vezes o post foi mostrado. No Instagram a API chama-lhe
// `views` desde 2025; guardamos nessa mesma coluna. Quando a rede não dá
// impressões mas dá alcance (contas únicas), a taxa usa o alcance e o resultado
// vem marcado com `basis: 'reach'`. Sem nenhum dos dois não há taxa (null) —
// nunca dividimos por seguidores, para a taxa ser comparável entre redes.
// Cliques e visualizações de vídeo NÃO entram nas interações.

export const METRIC_KEYS = [
  'impressions',
  'reach',
  'reactions',
  'comments',
  'shares',
  'saves',
  'clicks',
  'videoViews',
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** Totais acumulados na rede. null = a API não deu (rede não tem, ou falta permissão). */
export type PostMetrics = Record<MetricKey, number | null>;

export const METRIC_LABEL: Record<MetricKey, string> = {
  impressions: 'Impressões',
  reach: 'Alcance',
  reactions: 'Reações',
  comments: 'Comentários',
  shares: 'Partilhas',
  saves: 'Guardados',
  clicks: 'Cliques',
  videoViews: 'Visualizações de vídeo',
};

export const EMPTY_METRICS: PostMetrics = {
  impressions: null,
  reach: null,
  reactions: null,
  comments: null,
  shares: null,
  saves: null,
  clicks: null,
  videoViews: null,
};

/** Lê o Json guardado (SocialPost.metrics) com tolerância: só números finitos ≥ 0. */
export function readMetrics(raw: unknown): PostMetrics | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: PostMetrics = { ...EMPTY_METRICS };
  let any = false;
  for (const key of METRIC_KEYS) {
    const v = src[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      out[key] = Math.round(v);
      any = true;
    }
  }
  return any ? out : null;
}

const INTERACTION_KEYS = ['reactions', 'comments', 'shares', 'saves'] as const;

/** Soma das interações; null quando a rede não deu nenhuma delas. */
export function interactions(m: Partial<PostMetrics> | null | undefined): number | null {
  if (!m) return null;
  let total = 0;
  let any = false;
  for (const key of INTERACTION_KEYS) {
    const v = m[key];
    if (typeof v === 'number') {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

export interface EngagementRate {
  /** Percentagem (0–100+). */
  rate: number;
  basis: 'impressions' | 'reach';
}

export function engagementRate(m: Partial<PostMetrics> | null | undefined): EngagementRate | null {
  const total = interactions(m);
  if (total === null || !m) return null;
  if (typeof m.impressions === 'number' && m.impressions > 0) {
    return { rate: (total / m.impressions) * 100, basis: 'impressions' };
  }
  if (typeof m.reach === 'number' && m.reach > 0) return { rate: (total / m.reach) * 100, basis: 'reach' };
  return null;
}

/** Soma métrica a métrica; uma métrica fica null só se nenhum post a tiver. */
export function sumMetrics(list: Array<Partial<PostMetrics> | null | undefined>): PostMetrics {
  const out: PostMetrics = { ...EMPTY_METRICS };
  for (const m of list) {
    if (!m) continue;
    for (const key of METRIC_KEYS) {
      const v = m[key];
      if (typeof v === 'number') out[key] = (out[key] ?? 0) + v;
    }
  }
  return out;
}

export type PostFormat = 'TEXT' | 'IMAGE' | 'CAROUSEL' | 'LINK' | 'VIDEO';

export const FORMAT_LABEL: Record<PostFormat, string> = {
  TEXT: 'Texto',
  IMAGE: 'Imagem',
  CAROUSEL: 'Carrossel',
  LINK: 'Link',
  VIDEO: 'Vídeo',
};

/**
 * Formato pelo que o post leva. `firstIsVideo`: o único arquivo é um vídeo
 * (quem chama sabe o tipo do asset; o post só guarda os ids).
 */
export function postFormat(post: { mediaAssetIds: string[]; linkUrl: string | null }, firstIsVideo = false): PostFormat {
  if (post.mediaAssetIds.length > 1) return 'CAROUSEL';
  if (post.mediaAssetIds.length === 1) return firstIsVideo ? 'VIDEO' : 'IMAGE';
  return post.linkUrl ? 'LINK' : 'TEXT';
}

/** Variação percentual face ao período anterior; null sem base de comparação. */
export function changePct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
