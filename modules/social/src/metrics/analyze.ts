import {
  EMPTY_METRICS,
  METRIC_KEYS,
  engagementRate,
  interactions,
  sumMetrics,
  type MetricKey,
  type PostMetrics,
} from './engagement.js';

// Agregações do painel de desempenho — puras (testadas em analyze.test.ts).
// Dia e hora são sempre lidos no fuso de trabalho (America/Sao_Paulo), nunca
// no do servidor (a Vercel corre em UTC).

export const REPORT_TIMEZONE = 'America/Sao_Paulo';

const partsFmt = new Map<string, Intl.DateTimeFormat>();
function zoned(date: Date, timeZone: string) {
  let fmt = partsFmt.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
    partsFmt.set(timeZone, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday!);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday };
}

/** "YYYY-MM-DD" no fuso de trabalho. */
export function dayKey(date: Date, timeZone = REPORT_TIMEZONE): string {
  return zoned(date, timeZone).day;
}

/** Todos os dias (chaves) de `from` a `to`, inclusive. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end && out.length < 800) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export interface Snapshot extends PostMetrics {
  socialPostId: string;
  capturedAt: Date;
}

export type DailyGains = Record<string, PostMetrics>;

/**
 * Ganho por dia a partir dos snapshots (que guardam TOTAIS acumulados): a
 * diferença entre recolhas seguidas do mesmo post vai para o dia da recolha.
 * O primeiro snapshot de um post conta inteiro no seu dia. Uma descida (a rede
 * corrigiu um número) conta como zero, nunca como ganho negativo.
 */
export function dailyGains(snapshots: Snapshot[], timeZone = REPORT_TIMEZONE): DailyGains {
  const byPost = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    const list = byPost.get(s.socialPostId) ?? [];
    list.push(s);
    byPost.set(s.socialPostId, list);
  }
  const out: DailyGains = {};
  for (const list of byPost.values()) {
    list.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    const last: Partial<Record<MetricKey, number>> = {};
    for (const snap of list) {
      const day = dayKey(snap.capturedAt, timeZone);
      const bucket = (out[day] ??= { ...EMPTY_METRICS });
      for (const key of METRIC_KEYS) {
        const value = snap[key];
        if (typeof value !== 'number') continue;
        const gain = Math.max(0, value - (last[key] ?? 0));
        bucket[key] = (bucket[key] ?? 0) + gain;
        last[key] = Math.max(value, last[key] ?? 0);
      }
    }
  }
  return out;
}

export interface AnalyzedPost {
  id: string;
  publishedAt: Date;
  metrics: PostMetrics | null;
}

export interface GroupStats {
  key: string;
  posts: number;
  measured: number;
  metrics: PostMetrics;
  interactions: number | null;
  /** Taxa de engagement do grupo: interações somadas ÷ impressões somadas (não a média das taxas). */
  rate: number | null;
}

export function groupStats<T extends AnalyzedPost>(posts: T[], keyOf: (post: T) => string | null): GroupStats[] {
  const groups = new Map<string, T[]>();
  for (const post of posts) {
    const key = keyOf(post);
    if (key === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), post]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const metrics = sumMetrics(list.map((p) => p.metrics));
      return {
        key,
        posts: list.length,
        measured: list.filter((p) => p.metrics).length,
        metrics,
        interactions: interactions(metrics),
        rate: engagementRate(metrics)?.rate ?? null,
      };
    })
    .sort((a, b) => b.posts - a.posts || a.key.localeCompare(b.key));
}

export interface HeatCell {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  hour: number;
  posts: number;
  interactions: number;
  rate: number | null;
}

/** Dia da semana × hora da PUBLICAÇÃO, só com posts que têm métricas. */
export function heatmap(posts: AnalyzedPost[], timeZone = REPORT_TIMEZONE): HeatCell[] {
  const cells = new Map<string, AnalyzedPost[]>();
  for (const post of posts) {
    if (!post.metrics || interactions(post.metrics) === null) continue;
    const { weekday, hour } = zoned(post.publishedAt, timeZone);
    const key = `${weekday}:${hour}`;
    cells.set(key, [...(cells.get(key) ?? []), post]);
  }
  return [...cells.entries()].map(([key, list]) => {
    const [weekday, hour] = key.split(':').map(Number) as [number, number];
    const metrics = sumMetrics(list.map((p) => p.metrics));
    return { weekday, hour, posts: list.length, interactions: interactions(metrics) ?? 0, rate: engagementRate(metrics)?.rate ?? null };
  });
}

export const MIN_POSTS_FOR_SUGGESTION = 5;

/**
 * Melhores horários para sugerir no composer. Só sugere com pelo menos
 * `MIN_POSTS_FOR_SUGGESTION` posts medidos (menos do que isso é ruído).
 * Ordena pela taxa de engagement; sem taxa (rede sem impressões), pelas
 * interações médias por post. Empate: o horário com mais posts.
 */
export function bestSlots(cells: HeatCell[], limit = 3): HeatCell[] {
  const total = cells.reduce((sum, c) => sum + c.posts, 0);
  if (total < MIN_POSTS_FOR_SUGGESTION) return [];
  const score = (c: HeatCell) => (c.rate !== null ? c.rate : c.interactions / c.posts / 1000);
  return [...cells].sort((a, b) => score(b) - score(a) || b.posts - a.posts).slice(0, limit);
}

/** Próxima ocorrência futura de um horário (dia da semana + hora, no fuso de trabalho). */
export function nextOccurrence(slot: { weekday: number; hour: number }, now: Date, timeZone = REPORT_TIMEZONE): Date {
  // Procura hora a hora nos próximos 8 dias: simples e imune a mudanças de fuso.
  const start = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
  for (let i = 1; i <= 8 * 24; i++) {
    const candidate = new Date(start.getTime() + i * 3_600_000);
    const z = zoned(candidate, timeZone);
    if (z.weekday === slot.weekday && z.hour === slot.hour) return candidate;
  }
  return start;
}
