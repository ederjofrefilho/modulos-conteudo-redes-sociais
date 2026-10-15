import { prisma, SocialPostStatus, type Prisma, type SocialProvider } from '@app/db';
import { readRemote, remoteFormat, remotePreviewMedia, remoteThumb } from '../remote.js';
import { NotFoundError } from '@app/core';
import {
  REPORT_TIMEZONE,
  bestSlots,
  dailyGains,
  dayKey,
  dayRange,
  groupStats,
  heatmap,
  type HeatCell,
  type Snapshot,
} from './analyze.js';
import {
  changePct,
  engagementRate,
  interactions,
  postFormat,
  readMetrics,
  sumMetrics,
  type PostFormat,
  type PostMetrics,
} from './engagement.js';

// Leitura do painel de desempenho (/social/desempenho). Duas lentes, de propósito:
//  - KPIs, rankings, formato e tema: os posts PUBLICADOS no período, com os
//    totais mais recentes de cada um (um post conta inteiro no período em que
//    saiu). O período anterior é a janela do mesmo tamanho imediatamente antes.
//  - Evolução: ganho por dia de TODOS os posts, a partir dos snapshots.
// Seguidores vêm dos snapshots da conta.

export interface ReportFilters {
  /** Dias "YYYY-MM-DD" no fuso de trabalho, inclusive. */
  from: string;
  to: string;
  provider?: SocialProvider;
  format?: PostFormat;
  topic?: string;
  /** Só estas contas (as que o ator pode medir). */
  accountIds?: string[];
}

const POST_SELECT = {
  id: true,
  text: true,
  topic: true,
  linkUrl: true,
  mediaAssetIds: true,
  publishedAt: true,
  externalUrl: true,
  metrics: true,
  metricsAt: true,
  metricsError: true,
  providerState: true,
  remote: true,
  origin: true,
  socialAccount: { select: { id: true, provider: true, displayName: true, avatarUrl: true } },
  createdBy: { select: { name: true, email: true } },
} as const;

type PostRow = Prisma.SocialPostGetPayload<{ select: typeof POST_SELECT }>;

export interface ReportPost {
  id: string;
  text: string;
  topic: string | null;
  provider: SocialProvider;
  accountName: string;
  format: PostFormat;
  publishedAt: string;
  externalUrl: string | null;
  thumbUrl: string | null;
  accountId: string;
  accountAvatarUrl: string | null;
  origin: string;
  metrics: PostMetrics | null;
  interactions: number | null;
  rate: number | null;
  rateBasis: 'impressions' | 'reach' | null;
  metricsAt: string | null;
  metricsError: string | null;
  simulated: boolean;
  visits: number;
  leads: number;
  meetings: number;
}

/** Início (00:00) e fim (24:00) de um dia no fuso de trabalho, como instantes. */
function dayBounds(day: string): { start: Date; end: Date } {
  // São Paulo não tem horário de verão desde 2019: UTC-3 fixo.
  const start = new Date(`${day}T03:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function isSimulated(row: PostRow): boolean {
  const state = row.providerState;
  return !!state && typeof state === 'object' && !Array.isArray(state) && (state as Record<string, unknown>).simulated === true;
}

async function loadPosts(where: Prisma.SocialPostWhereInput, filters: ReportFilters): Promise<PostRow[]> {
  const rows = await prisma.socialPost.findMany({
    where: {
      status: SocialPostStatus.PUBLISHED,
      publishedAt: { not: null },
      ...(filters.provider ? { socialAccount: { provider: filters.provider } } : {}),
      ...(filters.topic ? { topic: filters.topic } : {}),
      ...(filters.accountIds ? { socialAccountId: { in: filters.accountIds } } : {}),
      ...where,
    },
    select: POST_SELECT,
    orderBy: { publishedAt: 'desc' },
    take: 2000,
  });
  if (!filters.format) return rows;
  const videos = await videoFirstIds(rows);
  return rows.filter((r) => postFormat(r, videos.has(r.mediaAssetIds[0] ?? '')) === filters.format);
}

/** Ids dos posts de um arquivo só que é vídeo (o formato depende do tipo do asset). */
async function videoFirstIds(rows: PostRow[]): Promise<Set<string>> {
  const ids = [...new Set(rows.filter((r) => r.mediaAssetIds.length === 1).map((r) => r.mediaAssetIds[0]!))];
  if (ids.length === 0) return new Set();
  const found = await prisma.contentAsset.findMany({
    where: { id: { in: ids }, mimeType: { startsWith: 'video/' } },
    select: { id: true },
  });
  return new Set(found.map((a) => a.id));
}

interface Attribution {
  visits: number;
  leads: number;
  meetings: number;
}

/**
 * Ligação ao CRM pelo UTM: visitas ao site com `utm_content = id do post`
 * (Event site.page_view), quantas dessas pessoas se identificaram (viraram
 * contato) e quantas reuniões esses contatos marcaram depois da visita.
 */
async function loadAttribution(postIds: string[]): Promise<Map<string, Attribution>> {
  const out = new Map<string, Attribution>();
  if (postIds.length === 0) return out;
  const visits = await prisma.event.findMany({
    where: { type: 'site.page_view', OR: postIds.map((id) => ({ payload: { path: ['utm_content'], equals: id } })) },
    select: { payload: true, visitorId: true, contactId: true, occurredAt: true },
    take: 20_000,
  });
  const byPost = new Map<string, { visits: number; contacts: Map<string, Date> }>();
  for (const v of visits) {
    const postId = (v.payload as Record<string, unknown> | null)?.utm_content;
    if (typeof postId !== 'string') continue;
    const entry = byPost.get(postId) ?? { visits: 0, contacts: new Map<string, Date>() };
    entry.visits++;
    if (v.contactId) {
      const first = entry.contacts.get(v.contactId);
      if (!first || v.occurredAt < first) entry.contacts.set(v.contactId, v.occurredAt);
    }
    byPost.set(postId, entry);
  }
  const contactIds = [...new Set([...byPost.values()].flatMap((e) => [...e.contacts.keys()]))];
  const meetings = contactIds.length
    ? await prisma.event.findMany({
        where: { type: 'meeting.scheduled', contactId: { in: contactIds } },
        select: { contactId: true, occurredAt: true },
      })
    : [];
  for (const [postId, entry] of byPost) {
    let count = 0;
    for (const m of meetings) {
      const first = m.contactId ? entry.contacts.get(m.contactId) : undefined;
      if (first && m.occurredAt >= first) count++;
    }
    out.set(postId, { visits: entry.visits, leads: entry.contacts.size, meetings: count });
  }
  return out;
}

async function toReportPosts(rows: PostRow[]): Promise<ReportPost[]> {
  const thumbIds = [...new Set(rows.map((r) => r.mediaAssetIds[0]).filter((id): id is string => !!id))];
  const [assets, attribution] = await Promise.all([
    thumbIds.length
      ? prisma.contentAsset.findMany({ where: { id: { in: thumbIds } }, select: { id: true, url: true, mimeType: true } })
      : [],
    loadAttribution(rows.map((r) => r.id)),
  ]);
  // Vídeo não tem miniatura em imagem: o painel mostra só o formato.
  const thumbs = new Map(assets.filter((a) => !a.mimeType.startsWith('video/')).map((a) => [a.id, a.url]));
  const videos = new Set(assets.filter((a) => a.mimeType.startsWith('video/')).map((a) => a.id));
  return rows.map((r) => {
    const metrics = readMetrics(r.metrics);
    const rate = engagementRate(metrics);
    const attr = attribution.get(r.id);
    const remote = readRemote(r.remote);
    return {
      id: r.id,
      text: r.text,
      topic: r.topic,
      provider: r.socialAccount.provider,
      accountName: r.socialAccount.displayName,
      format: remote ? remoteFormat(remote.type) : postFormat(r, r.mediaAssetIds.length === 1 && videos.has(r.mediaAssetIds[0]!)),
      publishedAt: r.publishedAt!.toISOString(),
      externalUrl: r.externalUrl,
      thumbUrl: (r.mediaAssetIds[0] ? thumbs.get(r.mediaAssetIds[0]) : null) ?? remoteThumb(remote),
      accountId: r.socialAccount.id,
      accountAvatarUrl: r.socialAccount.avatarUrl,
      origin: r.origin,
      metrics,
      interactions: interactions(metrics),
      rate: rate?.rate ?? null,
      rateBasis: rate?.basis ?? null,
      metricsAt: r.metricsAt?.toISOString() ?? null,
      metricsError: r.metricsError,
      simulated: isSimulated(r),
      visits: attr?.visits ?? 0,
      leads: attr?.leads ?? 0,
      meetings: attr?.meetings ?? 0,
    };
  });
}

/** Seguidores por dia (último valor do dia, somado entre contas) e o ganho no intervalo. */
async function followersSeries(filters: ReportFilters, from: string, to: string) {
  const { start } = dayBounds(from);
  const { end } = dayBounds(to);
  const rows = await prisma.socialAccountMetric.findMany({
    where: {
      followers: { not: null },
      capturedAt: { lt: end },
      ...(filters.provider ? { socialAccount: { provider: filters.provider } } : {}),
      ...(filters.accountIds ? { socialAccountId: { in: filters.accountIds } } : {}),
    },
    orderBy: { capturedAt: 'asc' },
    select: { socialAccountId: true, capturedAt: true, followers: true },
  });
  const days = dayRange(from, to);
  const last = new Map<string, number>(); // conta → último valor conhecido
  const baseline = new Map<string, number>(); // conta → valor à entrada do intervalo
  const byDay = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.capturedAt < start) {
      baseline.set(row.socialAccountId, row.followers!);
      continue;
    }
    if (!baseline.has(row.socialAccountId)) baseline.set(row.socialAccountId, row.followers!);
    const day = dayKey(row.capturedAt);
    const map = byDay.get(day) ?? new Map<string, number>();
    map.set(row.socialAccountId, row.followers!);
    byDay.set(day, map);
  }
  for (const [id, value] of baseline) last.set(id, value);
  const series: Array<{ day: string; followers: number | null }> = [];
  let seen = false;
  for (const day of days) {
    const map = byDay.get(day);
    if (map) {
      for (const [id, value] of map) last.set(id, value);
      seen = true;
    }
    const total = last.size ? [...last.values()].reduce((a, b) => a + b, 0) : null;
    series.push({ day, followers: seen || last.size ? total : null });
  }
  const startTotal = baseline.size ? [...baseline.values()].reduce((a, b) => a + b, 0) : null;
  const endTotal = last.size ? [...last.values()].reduce((a, b) => a + b, 0) : null;
  return {
    series,
    current: endTotal,
    gained: startTotal !== null && endTotal !== null && byDay.size > 0 ? endTotal - startTotal : null,
  };
}

function kpi(current: number | null, previous: number | null) {
  return { value: current, previous, change: changePct(current, previous) };
}

export async function getSocialReport(filters: ReportFilters) {
  const days = dayRange(filters.from, filters.to);
  const span = Math.max(1, days.length);
  const prevTo = shiftDay(filters.from, -1);
  const prevFrom = shiftDay(prevTo, -(span - 1));
  const cur = { start: dayBounds(filters.from).start, end: dayBounds(filters.to).end };
  const prev = { start: dayBounds(prevFrom).start, end: dayBounds(prevTo).end };

  const [curRows, prevRows, allRows, followers, prevFollowers] = await Promise.all([
    loadPosts({ publishedAt: { gte: cur.start, lt: cur.end } }, filters),
    loadPosts({ publishedAt: { gte: prev.start, lt: prev.end } }, filters),
    loadPosts({}, filters),
    followersSeries(filters, filters.from, filters.to),
    followersSeries(filters, prevFrom, prevTo),
  ]);

  const posts = await toReportPosts(curRows);
  const curTotal = sumMetrics(posts.map((p) => p.metrics));
  const prevTotal = sumMetrics(prevRows.map((r) => readMetrics(r.metrics)));

  const snapshots = allRows.length
    ? await prisma.socialPostMetric.findMany({
        where: { socialPostId: { in: allRows.map((r) => r.id) }, capturedAt: { lt: cur.end } },
        orderBy: { capturedAt: 'asc' },
        select: {
          socialPostId: true, capturedAt: true, impressions: true, reach: true, reactions: true,
          comments: true, shares: true, saves: true, clicks: true, videoViews: true,
        },
      })
    : [];
  const gains = dailyGains(snapshots as Snapshot[]);
  const publishedByDay = new Map<string, number>();
  for (const p of posts) {
    const day = dayKey(new Date(p.publishedAt));
    publishedByDay.set(day, (publishedByDay.get(day) ?? 0) + 1);
  }
  const series = days.map((day, i) => ({
    day,
    impressions: gains[day]?.impressions ?? 0,
    reach: gains[day]?.reach ?? 0,
    interactions: interactions(gains[day]) ?? 0,
    clicks: gains[day]?.clicks ?? 0,
    followers: followers.series[i]?.followers ?? null,
    posts: publishedByDay.get(day) ?? 0,
  }));

  const analyzed = posts.map((p) => ({ ...p, publishedAt: new Date(p.publishedAt) }));
  const history = allRows.map((r) => ({ id: r.id, publishedAt: r.publishedAt!, metrics: readMetrics(r.metrics) }));
  const cells: HeatCell[] = heatmap(history);

  return {
    timezone: REPORT_TIMEZONE,
    range: { from: filters.from, to: filters.to, prevFrom, prevTo, days: span },
    kpis: {
      posts: kpi(posts.length, prevRows.length),
      impressions: kpi(curTotal.impressions, prevTotal.impressions),
      reach: kpi(curTotal.reach, prevTotal.reach),
      interactions: kpi(interactions(curTotal), interactions(prevTotal)),
      engagementRate: kpi(engagementRate(curTotal)?.rate ?? null, engagementRate(prevTotal)?.rate ?? null),
      clicks: kpi(curTotal.clicks, prevTotal.clicks),
      newFollowers: kpi(followers.gained, prevFollowers.gained),
    },
    followers: followers.current,
    measuredPosts: posts.filter((p) => p.metrics).length,
    series,
    posts,
    byFormat: groupStats(analyzed, (p) => p.format),
    byTopic: groupStats(analyzed, (p) => p.topic ?? 'Sem tema'),
    heatmap: cells,
    bestSlots: bestSlots(cells),
    historyMeasured: history.filter((h) => h.metrics).length,
  };
}

export type SocialReport = Awaited<ReturnType<typeof getSocialReport>>;

/** Detalhe de um post: tudo o que se sabe e a evolução (um ponto por recolha). */
export async function getSocialPostPerformance(id: string, allowedAccountIds?: string[]) {
  const row = await prisma.socialPost.findUnique({ where: { id }, select: POST_SELECT });
  if (!row || !row.publishedAt) throw new NotFoundError('Post publicado', id);
  if (allowedAccountIds && !allowedAccountIds.includes(row.socialAccount.id)) throw new NotFoundError('Post publicado', id);
  const [post] = await toReportPosts([row]);
  const snapshots = await prisma.socialPostMetric.findMany({
    where: { socialPostId: id },
    orderBy: { capturedAt: 'asc' },
    select: {
      capturedAt: true, impressions: true, reach: true, reactions: true, comments: true,
      shares: true, saves: true, clicks: true, videoViews: true,
    },
  });
  // A publicação como está na rede: imagens da biblioteca (posts do CRM) ou a media sincronizada.
  const assets = row.mediaAssetIds.length
    ? await prisma.contentAsset.findMany({
        where: { id: { in: row.mediaAssetIds } },
        select: { id: true, url: true, width: true, height: true, alt: true, mimeType: true },
      })
    : [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const library = row.mediaAssetIds.map((mid) => byId.get(mid)).filter((a): a is NonNullable<typeof a> => !!a);
  const remote = readRemote(row.remote);
  return {
    post: post!,
    preview: {
      text: row.text,
      linkUrl: row.linkUrl ?? remote?.linkUrl ?? null,
      avatarUrl: row.socialAccount.avatarUrl,
      remoteType: remote?.type ?? null,
      media: library.length ? library : remotePreviewMedia(remote, row.socialAccount.provider),
    },
    snapshots: snapshots.map((s) => ({ ...s, capturedAt: s.capturedAt.toISOString(), interactions: interactions(s) })),
  };
}

/** Melhores horários para o composer (todo o histórico, opcionalmente só de uma rede). */
export async function getBestSlots(provider?: SocialProvider, accountIds?: string[]) {
  const rows = await prisma.socialPost.findMany({
    where: {
      ...(accountIds ? { socialAccountId: { in: accountIds } } : {}),
      status: SocialPostStatus.PUBLISHED,
      publishedAt: { not: null },
      ...(provider ? { socialAccount: { provider } } : {}),
    },
    select: { id: true, publishedAt: true, metrics: true },
    take: 2000,
  });
  return bestSlots(heatmap(rows.map((r) => ({ id: r.id, publishedAt: r.publishedAt!, metrics: readMetrics(r.metrics) }))));
}
