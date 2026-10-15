import { describe, expect, it } from 'vitest';
import { bestSlots, dailyGains, dayRange, groupStats, heatmap, nextOccurrence, type Snapshot } from './analyze.js';
import { EMPTY_METRICS } from './engagement.js';
import { collectIntervalMs, isDueForCollect } from './collect.js';

const snap = (socialPostId: string, iso: string, m: Partial<Snapshot>): Snapshot => ({
  ...EMPTY_METRICS,
  socialPostId,
  capturedAt: new Date(iso),
  ...m,
});

describe('dailyGains', () => {
  it('distribui a diferença entre recolhas pelo dia da recolha, no fuso de São Paulo', () => {
    const gains = dailyGains([
      snap('a', '2026-10-01T15:00:00Z', { impressions: 100, reactions: 4 }),
      snap('a', '2026-10-02T15:00:00Z', { impressions: 160, reactions: 5 }),
      // 01:00 UTC de dia 3 ainda é dia 2 em São Paulo
      snap('a', '2026-10-03T01:00:00Z', { impressions: 170, reactions: 5 }),
      snap('b', '2026-10-02T12:00:00Z', { impressions: 30 }),
    ]);
    expect(gains['2026-10-01']!.impressions).toBe(100);
    expect(gains['2026-10-02']!.impressions).toBe(60 + 10 + 30);
    expect(gains['2026-10-02']!.reactions).toBe(1);
    expect(gains['2026-10-03']).toBeUndefined();
  });

  it('descida de um total nunca vira ganho negativo', () => {
    const gains = dailyGains([
      snap('a', '2026-10-01T15:00:00Z', { reach: 100 }),
      snap('a', '2026-10-02T15:00:00Z', { reach: 90 }),
      snap('a', '2026-10-03T15:00:00Z', { reach: 110 }),
    ]);
    expect(gains['2026-10-02']!.reach).toBe(0);
    expect(gains['2026-10-03']!.reach).toBe(10);
  });
});

describe('agrupamentos', () => {
  const post = (id: string, iso: string, m: Partial<Snapshot> | null) => ({
    id,
    publishedAt: new Date(iso),
    metrics: m ? { ...EMPTY_METRICS, ...m } : null,
    format: id.startsWith('c') ? 'CAROUSEL' : 'TEXT',
  });

  it('taxa do grupo = interações somadas ÷ impressões somadas', () => {
    const stats = groupStats(
      [post('c1', '2026-10-01T12:00:00Z', { impressions: 100, reactions: 10 }), post('c2', '2026-10-01T12:00:00Z', { impressions: 300, reactions: 10 }), post('t1', '2026-10-01T12:00:00Z', null)],
      (p) => p.format,
    );
    const carousel = stats.find((s) => s.key === 'CAROUSEL')!;
    expect(carousel.posts).toBe(2);
    expect(carousel.rate).toBe(5);
    expect(stats.find((s) => s.key === 'TEXT')!.measured).toBe(0);
  });

  it('heatmap usa a hora de São Paulo e só sugere com amostra mínima', () => {
    // 12:00 UTC de quinta 01/10/2026 = 09:00 em São Paulo
    const few = [post('a', '2026-10-01T12:00:00Z', { impressions: 100, reactions: 10 })];
    const cells = heatmap(few);
    expect(cells).toEqual([{ weekday: 4, hour: 9, posts: 1, interactions: 10, rate: 10 }]);
    expect(bestSlots(cells)).toEqual([]);

    const many = [
      ...Array.from({ length: 4 }, (_, i) => post(`a${i}`, '2026-10-01T12:00:00Z', { impressions: 100, reactions: 10 })),
      post('b', '2026-10-02T21:00:00Z', { impressions: 100, reactions: 30 }),
    ];
    const best = bestSlots(heatmap(many));
    expect(best[0]).toMatchObject({ weekday: 5, hour: 18 });
    expect(best).toHaveLength(2);
  });

  it('nextOccurrence devolve o próximo dia/hora no futuro', () => {
    const now = new Date('2026-10-01T12:30:00Z'); // quinta 09:30 SP
    const next = nextOccurrence({ weekday: 4, hour: 9 }, now);
    expect(next.toISOString()).toBe('2026-10-08T12:00:00.000Z');
    expect(nextOccurrence({ weekday: 5, hour: 18 }, now).toISOString()).toBe('2026-10-02T21:00:00.000Z');
  });

  it('dayRange é inclusivo', () => {
    expect(dayRange('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });
});

describe('cadência de recolha', () => {
  const H = 3_600_000;
  it('hora a hora nas primeiras 48 h, diário até 30 dias, semanal até 180, depois para', () => {
    expect(collectIntervalMs(10 * H)).toBe(H);
    expect(collectIntervalMs(5 * 24 * H)).toBe(20 * H);
    expect(collectIntervalMs(60 * 24 * H)).toBe(6 * 24 * H);
    expect(collectIntervalMs(200 * 24 * H)).toBeNull();
  });

  it('isDueForCollect respeita o intervalo', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    const publishedAt = new Date('2026-10-05T12:00:00Z');
    expect(isDueForCollect({ publishedAt, metricsAt: null }, now)).toBe(true);
    expect(isDueForCollect({ publishedAt, metricsAt: new Date('2026-10-10T02:00:00Z') }, now)).toBe(false);
    expect(isDueForCollect({ publishedAt, metricsAt: new Date('2026-10-09T12:00:00Z') }, now)).toBe(true);
    expect(isDueForCollect({ publishedAt: null, metricsAt: null }, now)).toBe(false);
  });
});
