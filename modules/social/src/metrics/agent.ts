import { prisma, SocialPostStatus, type SocialAccountKind, type SocialProvider } from '@app/db';
import type { Ctx } from '@app/core';
import { metricsAccountIds } from '../access.js';
import { NotFoundError } from '@app/core';
import { INSTAGRAM_INSIGHTS_SCOPE } from './instagram.js';
import { LINKEDIN_MEMBER_POST_SCOPE, LINKEDIN_ORG_SOCIAL_SCOPE } from './linkedin.js';
import { engagementRate, interactions, readMetrics, sumMetrics, type PostMetrics } from './engagement.js';

// Leitura das métricas sociais para o agente (tool MCP). Mesmos números do
// painel /social/desempenho (último snapshot de cada post e histórico em
// SocialPostMetric), mais o que o painel mostra só como aviso: PORQUE é que
// uma conta não tem métricas e o que fazer — sempre em texto, nunca um erro
// genérico nem zeros fingidos.

export type MetricsAvailability = 'full' | 'partial' | 'unavailable';

export interface AccountMetricsStatus {
  accountId: string;
  provider: SocialProvider;
  kind: SocialAccountKind;
  displayName: string;
  availability: MetricsAvailability;
  /** O que falta e como resolver, quando não é `full`. */
  message: string | null;
  lastCollectedAt: string | null;
  lastError: string | null;
}

/** Diagnóstico de uma conta, puro: com base no tipo, permissões e estado. */
export function metricsAvailability(a: { provider: SocialProvider; kind: SocialAccountKind; scopes: string[]; isActive: boolean; hasToken: boolean }): { availability: MetricsAvailability; message: string | null } {
  if (!a.isActive || !a.hasToken) {
    return { availability: 'unavailable', message: 'Conta desligada ou com o acesso expirado: reconecte em /settings/social para voltar a ler métricas.' };
  }
  if (a.provider === 'LINKEDIN') {
    if (a.kind === 'PERSON' && !a.scopes.includes(LINKEDIN_MEMBER_POST_SCOPE)) {
      return {
        availability: 'unavailable',
        message:
          'Métricas indisponíveis para perfil pessoal: a API do LinkedIn só dá métricas de posts da Página da empresa. Para ler métricas, conecte a Página em /settings/social ("Conectar Página do LinkedIn").',
      };
    }
    if (a.kind === 'ORGANIZATION' && !a.scopes.includes(LINKEDIN_ORG_SOCIAL_SCOPE)) {
      return { availability: 'unavailable', message: `A Página foi ligada sem a permissão ${LINKEDIN_ORG_SOCIAL_SCOPE}: reconecte a Página em /settings/social.` };
    }
    return { availability: 'full', message: null };
  }
  if (!a.scopes.includes(INSTAGRAM_INSIGHTS_SCOPE)) {
    return {
      availability: 'partial',
      message: `O token do Instagram não tem a permissão de insights (${INSTAGRAM_INSIGHTS_SCOPE}): só há gostos e comentários. Reconecte o Instagram em /settings/social e aceite a permissão de insights para ter alcance, impressões, partilhas e guardados.`,
    };
  }
  return { availability: 'full', message: null };
}

export interface AgentMetricsQuery {
  postId?: string;
  /** Dias AAAA-MM-DD (data de publicação), inclusive. */
  from?: string;
  to?: string;
  provider?: SocialProvider;
  accountId?: string;
  /** Inclui os snapshots datados de cada post (evolução). */
  includeHistory?: boolean;
  take?: number;
}

const round = (v: number | null, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Com `ctx`, só as contas cujas métricas o ator pode ver (ADMIN, dono, ou acesso com métricas). */
export async function getSocialMetrics(q: AgentMetricsQuery, ctx?: Ctx) {
  const allowed = ctx ? await metricsAccountIds(ctx) : null;
  const accounts = await prisma.socialAccount.findMany({
    where: {
      ...(q.provider ? { provider: q.provider } : {}),
      ...(q.accountId ? { id: q.accountId } : {}),
      ...(allowed ? { AND: [{ id: { in: allowed } }] } : {}),
    },
    select: { id: true, provider: true, kind: true, displayName: true, scopes: true, isActive: true, tokenEnc: true, metricsAt: true, metricsError: true, importPosts: true, importedAt: true, importError: true },
  });
  const status: (AccountMetricsStatus & { importPosts: boolean; importedAt: string | null; importError: string | null })[] = accounts.map((a) => {
    const av = metricsAvailability({ provider: a.provider, kind: a.kind, scopes: a.scopes, isActive: a.isActive, hasToken: !!a.tokenEnc });
    return {
      accountId: a.id,
      provider: a.provider,
      kind: a.kind,
      displayName: a.displayName,
      ...av,
      lastCollectedAt: a.metricsAt?.toISOString() ?? null,
      lastError: a.metricsError,
      importPosts: a.importPosts,
      importedAt: a.importedAt?.toISOString() ?? null,
      importError: a.importError,
    };
  });
  const statusOf = new Map(status.map((s) => [s.accountId, s]));

  if (q.postId) {
    const exists = await prisma.socialPost.findUnique({ where: { id: q.postId }, select: { id: true } });
    if (!exists) throw new NotFoundError('Post de rede social', q.postId);
  }
  const posts = await prisma.socialPost.findMany({
    where: {
      status: SocialPostStatus.PUBLISHED,
      ...(q.postId ? { id: q.postId } : {}),
      ...(q.accountId ? { socialAccountId: q.accountId } : {}),
      ...(allowed ? { AND: [{ socialAccountId: { in: allowed } }] } : {}),
      ...(q.provider ? { socialAccount: { provider: q.provider } } : {}),
      ...(q.from || q.to
        ? { publishedAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00-03:00`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999-03:00`) } : {}) } }
        : {}),
    },
    orderBy: { publishedAt: 'desc' },
    take: q.take ?? 100,
    select: {
      id: true,
      text: true,
      origin: true,
      topic: true,
      linkUrl: true,
      publishedAt: true,
      externalId: true,
      externalUrl: true,
      metrics: true,
      metricsAt: true,
      metricsError: true,
      socialAccountId: true,
      socialAccount: { select: { provider: true, displayName: true } },
      ...(q.includeHistory ? { metricSnapshots: { orderBy: { capturedAt: 'asc' as const }, take: 200 } } : {}),
    },
  });

  const rows = posts.map((p) => {
    const metrics = readMetrics(p.metrics);
    const er = engagementRate(metrics);
    const account = statusOf.get(p.socialAccountId);
    const snaps = (p as { metricSnapshots?: (PostMetrics & { capturedAt: Date })[] }).metricSnapshots;
    return {
      id: p.id,
      provider: p.socialAccount.provider,
      account: p.socialAccount.displayName,
      origin: p.origin,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      url: p.externalUrl,
      text: p.text.length > 280 ? `${p.text.slice(0, 280)}…` : p.text,
      topic: p.topic,
      linkUrl: p.linkUrl,
      metrics,
      interactions: interactions(metrics),
      engagementRatePct: er ? round(er.rate) : null,
      engagementBasis: er?.basis ?? null,
      metricsAt: p.metricsAt?.toISOString() ?? null,
      // Porque não há números (ou só parte): aviso da conta, senão o erro da última recolha.
      unavailableReason: !metrics ? (account?.message ?? p.metricsError ?? 'Ainda não houve recolha de métricas deste post.') : account?.availability === 'partial' ? account.message : null,
      ...(snaps
        ? {
            history: snaps.map((s) => ({
              capturedAt: s.capturedAt.toISOString(),
              impressions: s.impressions, reach: s.reach, reactions: s.reactions, comments: s.comments, shares: s.shares, saves: s.saves, clicks: s.clicks, videoViews: s.videoViews,
            })),
          }
        : {}),
    };
  });

  const byProvider = new Map<string, PostMetrics[]>();
  for (const r of rows) if (r.metrics) byProvider.set(r.provider, [...(byProvider.get(r.provider) ?? []), r.metrics]);
  const totals = [...byProvider.entries()].map(([provider, list]) => {
    const sum = sumMetrics(list);
    const er = engagementRate(sum);
    return { provider, posts: list.length, metrics: sum, interactions: interactions(sum), engagementRatePct: er ? round(er.rate) : null };
  });

  return {
    note: 'Totais acumulados na rede no último snapshot de cada post. null = a rede não dá esse número (ou falta permissão), nunca zero. Taxa = interações (reações + comentários + partilhas + guardados) ÷ impressões (ou alcance) × 100.',
    accounts: status,
    period: q.from || q.to ? { from: q.from ?? null, to: q.to ?? null } : null,
    totals,
    posts: rows,
  };
}
