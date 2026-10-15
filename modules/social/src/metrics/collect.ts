import { prisma, SocialPostStatus, type Prisma } from '@app/db';
import { decryptAccessToken } from '../accounts.js';
import { PROVIDER_LABEL, type SocialProviderName } from '../rules.js';
import { METRIC_KEYS } from './engagement.js';
import { createInstagramMetrics } from './instagram.js';
import { createLinkedinMetrics } from './linkedin.js';
import { SocialMetricsError, type MetricsAccount, type SocialMetricsAdapter } from './types.js';

// Job de recolha (`/api/cron/social-metrics` e o botão "Atualizar métricas").
// Guarda um snapshot datado por post e por conta: o histórico é nosso, não
// depende de a rede o manter.
//
// Cadência por idade do post (a contar da publicação):
//   até 48 h        → de hora a hora (é quando os números mexem)
//   até 30 dias     → uma vez por dia
//   até 180 dias    → uma vez por semana
//   mais de 180     → para (o último snapshot fica como valor final)
// Seguidores da conta: uma vez por dia.
//
// Limites das APIs: no máximo `max` posts por passada, em série; um 429 larga
// essa rede até à próxima passada (sem insistir); falha transitória (5xx,
// rede) é repetida pelo `fetchWithRetry` de cada adaptador. Erros ficam em
// `metricsError` (post e conta) e no log do servidor.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Intervalo mínimo entre recolhas para um post desta idade; null = já não se recolhe. */
export function collectIntervalMs(ageMs: number): number | null {
  if (ageMs < 2 * DAY) return HOUR;
  if (ageMs < 30 * DAY) return 20 * HOUR;
  if (ageMs < 180 * DAY) return 6 * DAY;
  return null;
}

export function isDueForCollect(post: { publishedAt: Date | null; metricsAt: Date | null }, now: Date): boolean {
  if (!post.publishedAt) return false;
  const interval = collectIntervalMs(now.getTime() - post.publishedAt.getTime());
  if (interval === null) return false;
  return !post.metricsAt || now.getTime() - post.metricsAt.getTime() >= interval;
}

const ACCOUNT_INTERVAL_MS = 20 * HOUR;

const defaultAdapters = (): Record<SocialProviderName, SocialMetricsAdapter> => ({
  LINKEDIN: createLinkedinMetrics(),
  INSTAGRAM: createInstagramMetrics(),
});

export function getMetricsAdapter(provider: SocialProviderName): SocialMetricsAdapter {
  return defaultAdapters()[provider];
}

export interface CollectOptions {
  now?: Date;
  /** Teto de posts por passada (o cron tem 60 s). */
  max?: number;
  /** Só estes posts, ignorando a cadência (botão "Atualizar"). */
  postIds?: string[];
  /** Ignora a cadência para todos (botão "Atualizar métricas" do painel). */
  force?: boolean;
  adapters?: Partial<Record<SocialProviderName, SocialMetricsAdapter>>;
}

export interface CollectSummary {
  checked: number;
  collected: number;
  skipped: number;
  failed: number;
  accounts: number;
  errors: Array<{ scope: 'post' | 'account'; id: string; error: string }>;
  rateLimited: SocialProviderName[];
}

function isSimulated(post: { externalId: string | null; providerState: Prisma.JsonValue | null }): boolean {
  if (!post.externalId || post.externalId.startsWith('simulated:')) return true;
  const state = post.providerState;
  return !!state && typeof state === 'object' && !Array.isArray(state) && (state as Record<string, unknown>).simulated === true;
}

function messageOf(err: unknown, provider: SocialProviderName): string {
  if (err instanceof SocialMetricsError) return err.message;
  console.error(`[social-metrics] erro inesperado (${provider}):`, err);
  return `Erro inesperado ao ler métricas do ${PROVIDER_LABEL[provider]}.`;
}

export async function collectSocialMetrics(opts: CollectOptions = {}): Promise<CollectSummary> {
  const now = opts.now ?? new Date();
  const max = opts.max ?? 25;
  const adapters = { ...defaultAdapters(), ...opts.adapters } as Record<SocialProviderName, SocialMetricsAdapter>;
  const summary: CollectSummary = { checked: 0, collected: 0, skipped: 0, failed: 0, accounts: 0, errors: [], rateLimited: [] };
  const blocked = new Set<SocialProviderName>();

  const accounts = await prisma.socialAccount.findMany({ where: { isActive: true, tokenEnc: { not: null } } });
  const byId = new Map<string, MetricsAccount>();
  for (const a of accounts) {
    const accessToken = decryptAccessToken(a);
    if (!accessToken) continue;
    byId.set(a.id, { id: a.id, provider: a.provider, kind: a.kind, externalId: a.externalId, scopes: a.scopes, accessToken });
  }

  // --- Seguidores (uma vez por dia por conta) ---
  if (!opts.postIds) {
    for (const a of accounts) {
      const account = byId.get(a.id);
      if (!account || blocked.has(a.provider)) continue;
      if (!opts.force && a.metricsAt && now.getTime() - a.metricsAt.getTime() < ACCOUNT_INTERVAL_MS) continue;
      try {
        const result = await adapters[a.provider].fetchAccountMetrics(account);
        if (result.followers !== null) {
          await prisma.socialAccountMetric.create({
            data: { socialAccountId: a.id, capturedAt: now, followers: result.followers, raw: result.raw as Prisma.InputJsonValue },
          });
          summary.accounts++;
        }
        await prisma.socialAccount.update({ where: { id: a.id }, data: { metricsAt: now, metricsError: result.note ?? null } });
      } catch (err) {
        const error = messageOf(err, a.provider);
        if (err instanceof SocialMetricsError && err.kind === 'rate') blocked.add(a.provider);
        if (!(err instanceof SocialMetricsError && err.kind === 'permission')) summary.errors.push({ scope: 'account', id: a.id, error });
        await prisma.socialAccount.update({ where: { id: a.id }, data: { metricsAt: now, metricsError: error } });
      }
    }
  }

  // --- Posts publicados ---
  const candidates = await prisma.socialPost.findMany({
    where: {
      status: SocialPostStatus.PUBLISHED,
      externalId: { not: null },
      ...(opts.postIds ? { id: { in: opts.postIds } } : { publishedAt: { gte: new Date(now.getTime() - 180 * DAY) } }),
    },
    orderBy: [{ metricsAt: { sort: 'asc', nulls: 'first' } }],
    select: { id: true, externalId: true, providerState: true, publishedAt: true, metricsAt: true, socialAccountId: true, socialAccount: { select: { provider: true } } },
    take: 500,
  });
  const due = candidates
    .filter((p) => !isSimulated(p))
    .filter((p) => opts.force || opts.postIds || isDueForCollect(p, now))
    .slice(0, max);

  for (const post of due) {
    const provider = post.socialAccount.provider;
    summary.checked++;
    const account = byId.get(post.socialAccountId);
    if (!account || blocked.has(provider)) {
      summary.skipped++;
      continue;
    }
    try {
      const result = await adapters[provider].fetchPostMetrics(account, { externalId: post.externalId! });
      const hasAny = METRIC_KEYS.some((k) => result.metrics[k] !== null);
      if (hasAny) {
        await prisma.socialPostMetric.create({
          data: { socialPostId: post.id, capturedAt: now, ...result.metrics, raw: result.raw as Prisma.InputJsonValue },
        });
        summary.collected++;
      } else summary.skipped++;
      await prisma.socialPost.update({
        where: { id: post.id },
        data: { ...(hasAny ? { metrics: result.metrics as Prisma.InputJsonValue } : {}), metricsAt: now, metricsError: result.note ?? null },
      });
    } catch (err) {
      const error = messageOf(err, provider);
      const kind = err instanceof SocialMetricsError ? err.kind : 'other';
      if (kind === 'rate') {
        blocked.add(provider);
        summary.skipped++;
        continue; // não gasta a vez do post: a próxima passada tenta de novo
      }
      if (kind === 'auth') blocked.add(provider);
      // Falta de permissão não é falha do job: é o estado conhecido da conta.
      if (kind === 'permission') summary.skipped++;
      else {
        summary.failed++;
        summary.errors.push({ scope: 'post', id: post.id, error });
        console.error(`[social-metrics] post ${post.id}: ${error}`);
      }
      await prisma.socialPost.update({ where: { id: post.id }, data: { metricsAt: now, metricsError: error } });
    }
  }
  summary.rateLimited = [...blocked];
  return summary;
}

/** O que cada conta ligada consegue medir hoje e o que falta (tela de desempenho e /settings/social). */
export async function getMetricsCapabilities() {
  const accounts = await prisma.socialAccount.findMany({
    orderBy: [{ provider: 'asc' }, { displayName: 'asc' }],
    select: { id: true, provider: true, kind: true, displayName: true, scopes: true, isActive: true, metricsAt: true, metricsError: true },
  });
  const adapters = defaultAdapters();
  return accounts.map((a) => ({
    ...a,
    missingScopes: adapters[a.provider].missingScopes({ kind: a.kind, scopes: a.scopes }),
  }));
}
