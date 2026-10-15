import { describe, expect, it } from 'vitest';
import { createInstagramMetrics, parseInsights } from './instagram.js';
import { createLinkedinMetrics, memberEntityParam } from './linkedin.js';
import { SocialMetricsError, type MetricsAccount } from './types.js';

type Handler = (url: URL, init?: RequestInit) => { status?: number; body: unknown };

function fakeFetch(handler: Handler) {
  const calls: URL[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { impl, calls };
}

const ig = (scopes: string[]): MetricsAccount => ({
  id: 'a1', provider: 'INSTAGRAM', kind: 'ORGANIZATION', externalId: '178', scopes, accessToken: 'tok',
});
const li = (kind: 'PERSON' | 'ORGANIZATION', scopes: string[]): MetricsAccount => ({
  id: 'a2', provider: 'LINKEDIN', kind, externalId: 'abc', scopes, accessToken: 'tok',
});

describe('Instagram', () => {
  it('sem a permissão de insights lê só gostos e comentários, com aviso', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: { like_count: 12, comments_count: 3, media_type: 'IMAGE' } }));
    const adapter = createInstagramMetrics({ fetchImpl: impl });
    const account = ig(['instagram_business_basic', 'instagram_business_content_publish']);
    const result = await adapter.fetchPostMetrics(account, { externalId: '900' });
    expect(result.metrics).toMatchObject({ reactions: 12, comments: 3, impressions: null, reach: null, saves: null });
    expect(result.note).toContain('instagram_business_manage_insights');
    expect(calls).toHaveLength(1);
    expect(adapter.missingScopes(account)).toEqual(['instagram_business_manage_insights']);
  });

  it('com insights: views vira impressões; conjunto reduzido quando a media recusa uma métrica', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (!url.pathname.endsWith('/insights')) return { body: { like_count: 1, comments_count: 1, media_type: 'CAROUSEL_ALBUM' } };
      if (url.searchParams.get('metric')!.includes('views')) return { status: 400, body: { error: { code: 100, message: 'metric views not supported' } } };
      return {
        body: {
          data: [
            { name: 'reach', values: [{ value: 400 }] },
            { name: 'likes', values: [{ value: 30 }] },
            { name: 'comments', values: [{ value: 4 }] },
            { name: 'shares', total_value: { value: 2 } },
            { name: 'saved', values: [{ value: 7 }] },
          ],
        },
      };
    });
    const adapter = createInstagramMetrics({ fetchImpl: impl });
    const result = await adapter.fetchPostMetrics(ig(['instagram_business_manage_insights']), { externalId: '900' });
    expect(result.metrics).toMatchObject({ impressions: null, reach: 400, reactions: 30, comments: 4, shares: 2, saves: 7, clicks: null });
    expect(calls).toHaveLength(3);
    expect(result.note).toBeUndefined();
  });

  it('views presente preenche impressões', () => {
    expect(parseInsights({ data: [{ name: 'views', values: [{ value: 900 }] }] })).toEqual({ views: 900 });
  });

  it('limite de chamadas vira erro "rate"; token morto vira "auth"', async () => {
    const rate = createInstagramMetrics({ fetchImpl: fakeFetch(() => ({ status: 400, body: { error: { code: 4, message: 'limit' } } })).impl });
    await expect(rate.fetchAccountMetrics(ig([]))).rejects.toMatchObject({ kind: 'rate' });
    const auth = createInstagramMetrics({ fetchImpl: fakeFetch(() => ({ status: 400, body: { error: { code: 190 } } })).impl });
    await expect(auth.fetchPostMetrics(ig([]), { externalId: '1' })).rejects.toMatchObject({ kind: 'auth' });
  });

  it('seguidores da conta', async () => {
    const adapter = createInstagramMetrics({ fetchImpl: fakeFetch(() => ({ body: { followers_count: 1520, media_count: 40 } })).impl });
    expect((await adapter.fetchAccountMetrics(ig([]))).followers).toBe(1520);
  });

  it('5xx é repetido e depois passa', async () => {
    let n = 0;
    const { impl } = fakeFetch(() => (++n < 3 ? { status: 502, body: {} } : { body: { followers_count: 5 } }));
    const adapter = createInstagramMetrics({ fetchImpl: impl, retryDelayMs: 0 });
    expect((await adapter.fetchAccountMetrics(ig([]))).followers).toBe(5);
    expect(n).toBe(3);
  });
});

describe('LinkedIn', () => {
  it('perfil só com permissão de publicar: não chama a API e diz o que falta', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: {} }));
    const adapter = createLinkedinMetrics({ fetchImpl: impl });
    const account = li('PERSON', ['openid', 'profile', 'w_member_social']);
    await expect(adapter.fetchPostMetrics(account, { externalId: 'urn:li:share:1' })).rejects.toBeInstanceOf(SocialMetricsError);
    await expect(adapter.fetchAccountMetrics(account)).rejects.toMatchObject({ kind: 'permission' });
    expect(calls).toHaveLength(0);
    expect(adapter.missingScopes(account)).toEqual(['r_member_postAnalytics', 'r_member_profileAnalytics']);
  });

  it('perfil com r_member_postAnalytics: um pedido por tipo', async () => {
    const counts: Record<string, number> = { IMPRESSION: 1000, MEMBERS_REACHED: 700, REACTION: 40, COMMENT: 5, RESHARE: 2 };
    const { impl, calls } = fakeFetch((url) => ({ body: { elements: [{ count: counts[url.searchParams.get('queryType')!] }] } }));
    const adapter = createLinkedinMetrics({ fetchImpl: impl });
    const result = await adapter.fetchPostMetrics(li('PERSON', ['r_member_postAnalytics']), { externalId: 'urn:li:share:77' });
    expect(result.metrics).toMatchObject({ impressions: 1000, reach: 700, reactions: 40, comments: 5, shares: 2, saves: null, clicks: null });
    expect(calls).toHaveLength(5);
    expect(calls[0]!.search).toContain('entity=(share:urn%3Ali%3Ashare%3A77)');
  });

  it('entidade ugcPost usa a chave ugc', () => {
    expect(memberEntityParam('urn:li:ugcPost:9')).toBe('(ugc:urn%3Ali%3AugcPost%3A9)');
  });

  it('página: estatísticas e seguidores', async () => {
    const { impl } = fakeFetch((url) =>
      url.pathname.includes('networkSizes')
        ? { body: { firstDegreeSize: 321 } }
        : { body: { elements: [{ totalShareStatistics: { impressionCount: 500, uniqueImpressionsCount: 300, clickCount: 20, likeCount: 10, commentCount: 1, shareCount: 3 } }] } },
    );
    const adapter = createLinkedinMetrics({ fetchImpl: impl });
    const account = li('ORGANIZATION', ['r_organization_social', 'rw_organization_admin']);
    const result = await adapter.fetchPostMetrics(account, { externalId: 'urn:li:share:1' });
    expect(result.metrics).toMatchObject({ impressions: 500, reach: 300, clicks: 20, reactions: 10, comments: 1, shares: 3 });
    expect((await adapter.fetchAccountMetrics(account)).followers).toBe(321);
  });

  it('429 vira erro "rate"', async () => {
    const adapter = createLinkedinMetrics({ fetchImpl: fakeFetch(() => ({ status: 429, body: {} })).impl });
    await expect(adapter.fetchPostMetrics(li('PERSON', ['r_member_postAnalytics']), { externalId: 'urn:li:share:1' })).rejects.toMatchObject({ kind: 'rate' });
  });
});
