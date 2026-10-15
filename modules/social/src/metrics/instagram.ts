import { instagramApiVersion } from '../providers/instagram.js';
import { EMPTY_METRICS, type PostMetrics } from './engagement.js';
import {
  SocialMetricsError,
  fetchWithRetry,
  type AccountMetricsResult,
  type MetricsAccount,
  type PostMetricsResult,
  type SocialMetricsAdapter,
} from './types.js';

// Métricas do Instagram (API com login do Instagram, graph.instagram.com).
//
// Com as permissões de publicação que a conta já tem (`instagram_business_basic`):
//   - GET /{media-id}?fields=like_count,comments_count  → gostos e comentários
//   - GET /me?fields=followers_count,media_count        → seguidores
// Com `instagram_business_manage_insights` (permissão extra, ver
// docs/redes-sociais-setup.md):
//   - GET /{media-id}/insights?metric=views,reach,likes,comments,shares,saved
//     `views` é o que a API chamava `impressions` até 2025 — vai para a nossa
//     coluna de impressões. Alguns tipos de media recusam parte das métricas
//     (erro 100): tentamos o conjunto completo e depois o reduzido.
// O Instagram não dá cliques por post (não há link clicável na legenda).

const GRAPH = 'https://graph.instagram.com';
export const INSTAGRAM_INSIGHTS_SCOPE = 'instagram_business_manage_insights';

const FULL_SET = ['views', 'reach', 'likes', 'comments', 'shares', 'saved'];
const REDUCED_SET = ['reach', 'likes', 'comments', 'shares', 'saved'];

type Json = Record<string, unknown>;
type FetchLike = typeof fetch;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

async function readJson(res: Response): Promise<Json> {
  return ((await res.json().catch(() => ({}))) ?? {}) as Json;
}

function errorOf(body: Json): { message: string | null; code: number | null } {
  const err = body.error as { message?: unknown; code?: unknown } | undefined;
  return {
    message: typeof err?.message === 'string' ? err.message.slice(0, 300) : null,
    code: typeof err?.code === 'number' ? err.code : null,
  };
}

function toError(res: Response, body: Json, step: string): SocialMetricsError {
  const { message, code } = errorOf(body);
  if (code === 190 || res.status === 401) {
    return new SocialMetricsError('O acesso ao Instagram expirou ou foi revogado — reconecte em /settings/social.', 'auth');
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || res.status === 429) {
    return new SocialMetricsError('O Instagram limitou as chamadas desta conta por agora.', 'rate');
  }
  if (code === 10 || code === 200 || res.status === 403) {
    return new SocialMetricsError(
      `O Instagram recusou ${step} por falta de permissão${message ? ` (${message})` : ''}.`,
      'permission',
    );
  }
  if (res.status === 404 || (code === 100 && /does not exist|cannot be loaded/i.test(message ?? ''))) {
    return new SocialMetricsError('O post já não existe no Instagram (apagado na rede).', 'gone');
  }
  return new SocialMetricsError(`O Instagram recusou ${step} (HTTP ${res.status})${message ? `: ${message}` : '.'}`);
}

/** `{data:[{name, values:[{value}]}]}` (ou `total_value.value`) → mapa nome → número. */
export function parseInsights(body: Json): Record<string, number> {
  const out: Record<string, number> = {};
  const data = Array.isArray(body.data) ? (body.data as Json[]) : [];
  for (const item of data) {
    if (typeof item.name !== 'string') continue;
    const values = Array.isArray(item.values) ? (item.values as Json[]) : [];
    const total = item.total_value as Json | undefined;
    const value = num(values[0]?.value) ?? num(total?.value);
    if (value !== null) out[item.name] = value;
  }
  return out;
}

export function createInstagramMetrics(opts: { fetchImpl?: FetchLike; retryDelayMs?: number } = {}): SocialMetricsAdapter {
  const call = (url: string) =>
    fetchWithRetry(opts.fetchImpl ?? globalThis.fetch, url, undefined, { delayMs: opts.retryDelayMs });
  const base = () => `${GRAPH}/${instagramApiVersion()}`;

  async function insights(account: MetricsAccount, mediaId: string, metrics: string[]) {
    const params = new URLSearchParams({ metric: metrics.join(','), access_token: account.accessToken });
    const res = await call(`${base()}/${encodeURIComponent(mediaId)}/insights?${params}`);
    const body = await readJson(res);
    return { res, body };
  }

  return {
    provider: 'INSTAGRAM',

    missingScopes(account) {
      return account.scopes.includes(INSTAGRAM_INSIGHTS_SCOPE) ? [] : [INSTAGRAM_INSIGHTS_SCOPE];
    },

    async fetchPostMetrics(account, post): Promise<PostMetricsResult> {
      const metrics: PostMetrics = { ...EMPTY_METRICS };
      const raw: Json = {};

      // 1) Campos básicos: sempre disponíveis com a permissão de publicação.
      const params = new URLSearchParams({ fields: 'like_count,comments_count,media_type,media_product_type', access_token: account.accessToken });
      const basicRes = await call(`${base()}/${encodeURIComponent(post.externalId)}?${params}`);
      const basic = await readJson(basicRes);
      if (!basicRes.ok) throw toError(basicRes, basic, 'a leitura do post');
      raw.basic = basic;
      metrics.reactions = num(basic.like_count);
      metrics.comments = num(basic.comments_count);

      // 2) Insights: só com a permissão extra.
      if (!account.scopes.includes(INSTAGRAM_INSIGHTS_SCOPE)) {
        return {
          metrics,
          raw,
          note: `Só gostos e comentários: falta a permissão ${INSTAGRAM_INSIGHTS_SCOPE} para alcance, visualizações, partilhas e guardados.`,
        };
      }
      let attempt = await insights(account, post.externalId, FULL_SET);
      if (!attempt.res.ok && errorOf(attempt.body).code === 100) {
        attempt = await insights(account, post.externalId, REDUCED_SET);
      }
      if (!attempt.res.ok) {
        const err = toError(attempt.res, attempt.body, 'as métricas do post');
        if (err.kind === 'permission') return { metrics, raw, note: err.message };
        throw err;
      }
      raw.insights = attempt.body;
      const values = parseInsights(attempt.body);
      metrics.impressions = values.views ?? values.impressions ?? null;
      metrics.reach = values.reach ?? null;
      metrics.reactions = values.likes ?? metrics.reactions;
      metrics.comments = values.comments ?? metrics.comments;
      metrics.shares = values.shares ?? null;
      metrics.saves = values.saved ?? null;
      if (basic.media_type === 'VIDEO' || basic.media_product_type === 'REELS') metrics.videoViews = values.views ?? null;
      return { metrics, raw };
    },

    async fetchAccountMetrics(account): Promise<AccountMetricsResult> {
      const params = new URLSearchParams({ fields: 'followers_count,media_count', access_token: account.accessToken });
      const res = await call(`${base()}/me?${params}`);
      const body = await readJson(res);
      if (!res.ok) throw toError(res, body, 'a leitura da conta');
      return { followers: num(body.followers_count), raw: body };
    },
  };
}
