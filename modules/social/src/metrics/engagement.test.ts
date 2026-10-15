import { describe, expect, it } from 'vitest';
import { changePct, engagementRate, interactions, postFormat, readMetrics, sumMetrics, EMPTY_METRICS } from './engagement.js';

describe('fórmula de engagement', () => {
  it('interações = reações + comentários + partilhas + guardados (cliques e vídeo de fora)', () => {
    expect(interactions({ reactions: 10, comments: 2, shares: 1, saves: 3, clicks: 50, videoViews: 99 })).toBe(16);
  });

  it('sem nenhuma interação conhecida é null, não zero', () => {
    expect(interactions({ impressions: 100 })).toBeNull();
    expect(interactions(null)).toBeNull();
  });

  it('taxa sobre impressões; cai para alcance; sem base não há taxa', () => {
    expect(engagementRate({ reactions: 5, impressions: 200, reach: 100 })).toEqual({ rate: 2.5, basis: 'impressions' });
    expect(engagementRate({ reactions: 5, reach: 100 })).toEqual({ rate: 5, basis: 'reach' });
    expect(engagementRate({ reactions: 5 })).toBeNull();
    expect(engagementRate({ reactions: 5, impressions: 0 })).toBeNull();
  });

  it('sumMetrics mantém null quando ninguém tem a métrica', () => {
    const total = sumMetrics([{ ...EMPTY_METRICS, reactions: 1 }, { ...EMPTY_METRICS, reactions: 2, saves: 4 }, null]);
    expect(total.reactions).toBe(3);
    expect(total.saves).toBe(4);
    expect(total.impressions).toBeNull();
  });

  it('readMetrics ignora lixo', () => {
    expect(readMetrics({ reactions: 3, comments: 'x', shares: -1 })).toMatchObject({ reactions: 3, comments: null, shares: null });
    expect(readMetrics({})).toBeNull();
    expect(readMetrics(null)).toBeNull();
  });

  it('formato e variação', () => {
    expect(postFormat({ mediaAssetIds: ['a', 'b'], linkUrl: null })).toBe('CAROUSEL');
    expect(postFormat({ mediaAssetIds: ['a'], linkUrl: 'https://x' })).toBe('IMAGE');
    expect(postFormat({ mediaAssetIds: [], linkUrl: 'https://x' })).toBe('LINK');
    expect(postFormat({ mediaAssetIds: [], linkUrl: null })).toBe('TEXT');
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(150, 0)).toBeNull();
  });
});
