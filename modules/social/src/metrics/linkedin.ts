import { linkedinApiVersion } from '../providers/linkedin-text.js';
import { EMPTY_METRICS, type PostMetrics } from './engagement.js';
import {
  SocialMetricsError,
  fetchWithRetry,
  type AccountMetricsResult,
  type MetricsAccount,
  type PostMetricsResult,
  type SocialMetricsAdapter,
} from './types.js';

// Métricas do LinkedIn. A permissão de publicar (`w_member_social`) NÃO lê
// nada: sem as permissões abaixo, este adaptador não faz chamada nenhuma e
// devolve o aviso do que falta (ver docs/redes-sociais-setup.md).
//
// PERFIL PESSOAL (a conta ligada hoje) — Community Management API:
//   - `r_member_postAnalytics`: GET /rest/memberCreatorPostAnalytics
//       ?q=entity&entity=(share:{urn})&queryType={TIPO}&aggregation=TOTAL
//     um pedido por tipo: IMPRESSION, MEMBERS_REACHED, REACTION, COMMENT, RESHARE.
//   - `r_member_profileAnalytics`: GET /rest/memberFollowersCount?q=me
// PÁGINA DE EMPRESA:
//   - `r_organization_social`: GET /rest/organizationalEntityShareStatistics
//       ?q=organizationalEntity&organizationalEntity={org}&shares=List({urn})
//     (impressões, impressões únicas, cliques, reações, comentários, partilhas)
//   - `rw_organization_admin`: GET /rest/networkSizes/{org}?edgeType=COMPANY_FOLLOWED_BY_MEMBER
//
// O LinkedIn não dá "guardados" por API, nem cliques em post de perfil pessoal.
// Escrito pela documentação oficial; NUNCA correu contra a API real (a conta
// não tem estas permissões) — os testes usam respostas de exemplo.

const REST = 'https://api.linkedin.com/rest';

export const LINKEDIN_MEMBER_POST_SCOPE = 'r_member_postAnalytics';
export const LINKEDIN_MEMBER_PROFILE_SCOPE = 'r_member_profileAnalytics';
export const LINKEDIN_ORG_SOCIAL_SCOPE = 'r_organization_social';
export const LINKEDIN_ORG_ADMIN_SCOPE = 'rw_organization_admin';

const MEMBER_QUERIES: Array<[queryType: string, key: keyof PostMetrics]> = [
  ['IMPRESSION', 'impressions'],
  ['MEMBERS_REACHED', 'reach'],
  ['REACTION', 'reactions'],
  ['COMMENT', 'comments'],
  ['RESHARE', 'shares'],
];

type Json = Record<string, unknown>;
type FetchLike = typeof fetch;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

async function readJson(res: Response): Promise<Json> {
  return ((await res.json().catch(() => ({}))) ?? {}) as Json;
}

function toError(res: Response, body: Json, step: string): SocialMetricsError {
  const detail = typeof body.message === 'string' ? body.message.slice(0, 300) : null;
  if (res.status === 401) {
    return new SocialMetricsError('O acesso ao LinkedIn expirou ou foi revogado — reconecte em /settings/social.', 'auth');
  }
  if (res.status === 403) {
    return new SocialMetricsError(`O LinkedIn recusou ${step} por falta de permissão${detail ? ` (${detail})` : ''}.`, 'permission');
  }
  if (res.status === 429) return new SocialMetricsError('O LinkedIn limitou as chamadas deste app por agora.', 'rate');
  if (res.status === 404) return new SocialMetricsError('O post já não existe no LinkedIn (apagado na rede).', 'gone');
  return new SocialMetricsError(`O LinkedIn recusou ${step} (HTTP ${res.status})${detail ? `: ${detail}` : '.'}`);
}

/** `urn:li:share:1` → `(share:urn%3Ali%3Ashare%3A1)`; `urn:li:ugcPost:1` → `(ugc:...)`. */
export function memberEntityParam(postUrn: string): string {
  const key = postUrn.startsWith('urn:li:ugcPost:') ? 'ugc' : 'share';
  return `(${key}:${encodeURIComponent(postUrn)})`;
}

export function createLinkedinMetrics(opts: { fetchImpl?: FetchLike; retryDelayMs?: number } = {}): SocialMetricsAdapter {
  const call = (url: string, account: MetricsAccount) =>
    fetchWithRetry(
      opts.fetchImpl ?? globalThis.fetch,
      url,
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'LinkedIn-Version': linkedinApiVersion(),
          'X-Restli-Protocol-Version': '2.0.0',
        },
      },
      { delayMs: opts.retryDelayMs },
    );

  function missingScopes(account: Pick<MetricsAccount, 'kind' | 'scopes'>): string[] {
    const need =
      account.kind === 'ORGANIZATION'
        ? [LINKEDIN_ORG_SOCIAL_SCOPE, LINKEDIN_ORG_ADMIN_SCOPE]
        : [LINKEDIN_MEMBER_POST_SCOPE, LINKEDIN_MEMBER_PROFILE_SCOPE];
    return need.filter((s) => !account.scopes.includes(s));
  }

  return {
    provider: 'LINKEDIN',
    missingScopes,

    async fetchPostMetrics(account, post): Promise<PostMetricsResult> {
      const metrics: PostMetrics = { ...EMPTY_METRICS };
      const raw: Json = {};

      if (account.kind === 'ORGANIZATION') {
        if (!account.scopes.includes(LINKEDIN_ORG_SOCIAL_SCOPE)) {
          throw new SocialMetricsError(`Falta a permissão ${LINKEDIN_ORG_SOCIAL_SCOPE} para ler as métricas da página.`, 'permission');
        }
        const org = encodeURIComponent(`urn:li:organization:${account.externalId}`);
        const listKey = post.externalId.startsWith('urn:li:ugcPost:') ? 'ugcPosts' : 'shares';
        const url = `${REST}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${org}&${listKey}=List(${encodeURIComponent(post.externalId)})`;
        const res = await call(url, account);
        const body = await readJson(res);
        if (!res.ok) throw toError(res, body, 'as métricas do post');
        raw.shareStatistics = body;
        const first = Array.isArray(body.elements) ? (body.elements[0] as Json | undefined) : undefined;
        const stats = (first?.totalShareStatistics ?? {}) as Json;
        metrics.impressions = num(stats.impressionCount);
        metrics.reach = num(stats.uniqueImpressionsCount);
        metrics.clicks = num(stats.clickCount);
        metrics.reactions = num(stats.likeCount);
        metrics.comments = num(stats.commentCount);
        metrics.shares = num(stats.shareCount);
        return { metrics, raw };
      }

      if (!account.scopes.includes(LINKEDIN_MEMBER_POST_SCOPE)) {
        throw new SocialMetricsError(
          `Falta a permissão ${LINKEDIN_MEMBER_POST_SCOPE}: com a permissão de publicar, o LinkedIn não deixa ler métricas.`,
          'permission',
        );
      }
      const entity = memberEntityParam(post.externalId);
      for (const [queryType, key] of MEMBER_QUERIES) {
        const res = await call(
          `${REST}/memberCreatorPostAnalytics?q=entity&entity=${entity}&queryType=${queryType}&aggregation=TOTAL`,
          account,
        );
        const body = await readJson(res);
        if (!res.ok) throw toError(res, body, 'as métricas do post');
        raw[queryType] = body;
        const first = Array.isArray(body.elements) ? (body.elements[0] as Json | undefined) : undefined;
        // Sem elemento = a rede ainda não tem contagem para este tipo: zero, não "desconhecido".
        metrics[key] = num(first?.count) ?? 0;
      }
      return { metrics, raw };
    },

    async fetchAccountMetrics(account): Promise<AccountMetricsResult> {
      if (account.kind === 'ORGANIZATION') {
        if (!account.scopes.includes(LINKEDIN_ORG_ADMIN_SCOPE)) {
          throw new SocialMetricsError(`Falta a permissão ${LINKEDIN_ORG_ADMIN_SCOPE} para ler os seguidores da página.`, 'permission');
        }
        const org = encodeURIComponent(`urn:li:organization:${account.externalId}`);
        const res = await call(`${REST}/networkSizes/${org}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`, account);
        const body = await readJson(res);
        if (!res.ok) throw toError(res, body, 'a leitura dos seguidores');
        return { followers: num(body.firstDegreeSize), raw: body };
      }
      if (!account.scopes.includes(LINKEDIN_MEMBER_PROFILE_SCOPE)) {
        throw new SocialMetricsError(`Falta a permissão ${LINKEDIN_MEMBER_PROFILE_SCOPE} para ler os seguidores do perfil.`, 'permission');
      }
      const res = await call(`${REST}/memberFollowersCount?q=me`, account);
      const body = await readJson(res);
      if (!res.ok) throw toError(res, body, 'a leitura dos seguidores');
      const first = Array.isArray(body.elements) ? (body.elements[0] as Json | undefined) : undefined;
      return { followers: num(first?.memberFollowersCount), raw: body };
    },
  };
}
