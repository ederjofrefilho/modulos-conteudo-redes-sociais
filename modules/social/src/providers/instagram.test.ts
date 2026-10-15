import { describe, expect, it } from 'vitest';
import {
  createInstagramProvider,
  exchangeInstagramCode,
  fetchInstagramProfile,
  instagramAuthorizeUrl,
  refreshInstagramToken,
} from './instagram.js';
import { SocialPublishError, type PublishInput } from './types.js';

// Nenhum teste chama a rede: um `fetch` falso registra as chamadas e responde
// por URL, na ordem em que o adaptador as faz.
type Call = { url: string; init: RequestInit };
function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const image = (id: string) => ({
  id,
  url: `https://blob.test/${id}.jpg`,
  width: 1080,
  height: 1350,
  mimeType: 'image/jpeg',
  alt: `alt ${id}`,
});

function input(over: Partial<PublishInput> = {}): PublishInput {
  return {
    postId: 'p1',
    account: {
      id: 'a1',
      provider: 'INSTAGRAM',
      kind: 'ORGANIZATION',
      externalId: '17841',
      accessToken: 'tok',
    },
    text: 'Legenda #dados',
    media: [image('m1')],
    linkUrl: null,
    linkPreview: null,
    providerState: null,
    ...over,
  };
}

const form = (c: Call) => new URLSearchParams(String(c.init.body));

/** Instagram de mentira: containers c1, c2…; status configurável; publish devolve 999. */
function instagramApi(
  opts: {
    statuses?: string[];
    quota?: { used: number; total: number };
    publishStatus?: number;
    publishBody?: unknown;
  } = {},
) {
  let n = 0;
  const statuses = [...(opts.statuses ?? ['FINISHED'])];
  return fakeFetch((url, init) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/content_publishing_limit')) {
      const q = opts.quota ?? { used: 0, total: 100 };
      return json({
        data: [{ quota_usage: q.used, config: { quota_total: q.total, quota_duration: 86400 } }],
      });
    }
    if (u.pathname.endsWith('/17841/media') && init.method === 'POST') {
      n += 1;
      return json({ id: `c${n}` });
    }
    if (u.pathname.endsWith('/17841/media_publish')) {
      return opts.publishStatus
        ? json(opts.publishBody ?? {}, opts.publishStatus)
        : json({ id: '999' });
    }
    if (u.searchParams.get('fields') === 'status_code') {
      return json({ status_code: statuses.length > 1 ? statuses.shift() : statuses[0] });
    }
    if (u.pathname.endsWith('/999') && u.searchParams.get('fields') === 'permalink') {
      return json({ permalink: 'https://www.instagram.com/p/ABC/' });
    }
    throw new Error(`URL inesperada: ${url}`);
  });
}

const provider = (impl: typeof fetch, pollAttempts = 3) =>
  createInstagramProvider({ fetchImpl: impl, pollDelayMs: 0, pollAttempts });

describe('adaptador do Instagram — publicar', () => {
  it('imagem única: container com legenda e alt, espera FINISHED, publica e busca o permalink', async () => {
    const api = instagramApi({ statuses: ['IN_PROGRESS', 'FINISHED'] });
    const result = await provider(api.impl).publish(input());

    const create = api.calls.find((c) => c.url.endsWith('/17841/media'))!;
    const f = form(create);
    expect(f.get('image_url')).toBe('https://blob.test/m1.jpg');
    expect(f.get('caption')).toBe('Legenda #dados');
    expect(f.get('alt_text')).toBe('alt m1');
    expect(f.get('access_token')).toBe('tok');
    expect(f.get('is_carousel_item')).toBeNull();
    expect(form(api.calls.find((c) => c.url.endsWith('/media_publish'))!).get('creation_id')).toBe(
      'c1',
    );
    expect(result).toEqual({
      externalId: '999',
      externalUrl: 'https://www.instagram.com/p/ABC/',
      providerState: { instagram: { container: 'c1', children: undefined } },
    });
  });

  it('carrossel: um container filho por imagem, depois o CAROUSEL com children na ordem', async () => {
    const api = instagramApi();
    await provider(api.impl).publish(input({ media: [image('m1'), image('m2'), image('m3')] }));
    const creates = api.calls.filter((c) => c.url.endsWith('/17841/media')).map(form);
    expect(creates).toHaveLength(4);
    expect(
      creates.slice(0, 3).every((f) => f.get('is_carousel_item') === 'true' && !f.get('caption')),
    ).toBe(true);
    expect(creates[3]!.get('media_type')).toBe('CAROUSEL');
    expect(creates[3]!.get('children')).toBe('c1,c2,c3');
    expect(creates[3]!.get('caption')).toBe('Legenda #dados');
    expect(form(api.calls.find((c) => c.url.endsWith('/media_publish'))!).get('creation_id')).toBe(
      'c4',
    );
  });

  it('ainda processando: falha guardando o container, e a nova tentativa reaproveita sem criar outro', async () => {
    const slow = instagramApi({ statuses: ['IN_PROGRESS'] });
    const err = await provider(slow.impl)
      .publish(input())
      .catch((e) => e);
    expect(err).toBeInstanceOf(SocialPublishError);
    expect(err.message).toMatch(/processando/);
    const state = err.opts.providerState;
    expect(state).toEqual({ instagram: { container: 'c1', children: undefined } });

    const retry = instagramApi();
    const result = await provider(retry.impl).publish(input({ providerState: state }));
    expect(retry.calls.some((c) => c.url.endsWith('/17841/media'))).toBe(false);
    expect(
      form(retry.calls.find((c) => c.url.endsWith('/media_publish'))!).get('creation_id'),
    ).toBe('c1');
    expect(result.externalId).toBe('999');
  });

  it('carrossel interrompido: retentar reaproveita os filhos já criados', async () => {
    const api = instagramApi();
    await provider(api.impl).publish(
      input({
        media: [image('m1'), image('m2')],
        providerState: { instagram: { children: { m1: 'old1' } } },
      }),
    );
    const creates = api.calls.filter((c) => c.url.endsWith('/17841/media')).map(form);
    expect(creates).toHaveLength(2); // só m2 + o CAROUSEL
    expect(creates[1]!.get('children')).toBe('old1,c1');
  });

  it('container de tentativa anterior expirado: descarta e cria outro', async () => {
    const api = instagramApi({ statuses: ['EXPIRED', 'FINISHED'] });
    await provider(api.impl).publish(
      input({ providerState: { instagram: { container: 'velho' } } }),
    );
    expect(form(api.calls.find((c) => c.url.endsWith('/media_publish'))!).get('creation_id')).toBe(
      'c1',
    );
  });

  it('container de tentativa anterior já publicado: não publica de novo', async () => {
    const api = instagramApi({ statuses: ['PUBLISHED'] });
    const err = await provider(api.impl)
      .publish(input({ providerState: { instagram: { container: 'c9' } } }))
      .catch((e) => e);
    expect(err.message).toMatch(/já foi publicado/);
    expect(api.calls.some((c) => c.url.endsWith('/media_publish'))).toBe(false);
  });

  it('cota de 24 h esgotada: recusa antes de criar container', async () => {
    const api = instagramApi({ quota: { used: 100, total: 100 } });
    const err = await provider(api.impl)
      .publish(input())
      .catch((e) => e);
    expect(err.message).toMatch(/100 publicações/);
    expect(api.calls.some((c) => c.url.endsWith('/17841/media'))).toBe(false);
  });

  it('processamento com ERROR: falha e limpa o container para a próxima tentativa criar outro', async () => {
    const api = instagramApi({ statuses: ['ERROR'] });
    const err = await provider(api.impl)
      .publish(input())
      .catch((e) => e);
    expect(err.message).toMatch(/não conseguiu processar/);
    expect(err.opts.providerState).toEqual({
      instagram: { container: undefined, children: undefined },
    });
  });

  it('token inválido (código 190): mensagem de reconectar e desativa a conta', async () => {
    const api = instagramApi({
      publishStatus: 400,
      publishBody: { error: { message: 'Error validating access token', code: 190 } },
    });
    const err = await provider(api.impl)
      .publish(input())
      .catch((e) => e);
    expect(err.message).toMatch(/reconecte/);
    expect(err.opts.deactivateAccount).toBe(true);
    expect(err.opts.providerState).toEqual({ instagram: { container: 'c1', children: undefined } });
  });

  it('limite de chamadas (código 4): mensagem de tentar mais tarde, sem desativar', async () => {
    const api = instagramApi({
      publishStatus: 400,
      publishBody: { error: { message: 'limit', code: 4 } },
    });
    const err = await provider(api.impl)
      .publish(input())
      .catch((e) => e);
    expect(err.message).toMatch(/limitou/);
    expect(err.opts.deactivateAccount).toBeUndefined();
  });

  it('sem imagem: recusa sem chamar a rede', async () => {
    const api = instagramApi();
    await expect(provider(api.impl).publish(input({ media: [] }))).rejects.toThrow(
      /ao menos 1 imagem/,
    );
    expect(api.calls).toHaveLength(0);
  });

  it('permalink indisponível não derruba uma publicação que já saiu', async () => {
    const api = fakeFetch((url, init) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/content_publishing_limit')) return json({ data: [] });
      if (u.pathname.endsWith('/media') && init.method === 'POST') return json({ id: 'c1' });
      if (u.searchParams.get('fields') === 'status_code') return json({ status_code: 'FINISHED' });
      if (u.pathname.endsWith('/media_publish')) return json({ id: '999' });
      return json({ error: { message: 'x', code: 100 } }, 400);
    });
    const result = await provider(api.impl).publish(input());
    expect(result.externalId).toBe('999');
    expect(result.externalUrl).toBeNull();
  });
});

describe('adaptador do Instagram — OAuth', () => {
  it('monta a URL de autorização com os escopos de publicação', () => {
    const url = new URL(
      instagramAuthorizeUrl({ appId: 'app', redirectUri: 'https://crm.test/cb', state: 's' }),
    );
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe(
      'instagram_business_basic,instagram_business_content_publish',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('s');
  });

  it('troca o código (resposta dentro de data[]) e depois pelo token longo', async () => {
    const api = fakeFetch((url) => {
      if (url === 'https://api.instagram.com/oauth/access_token')
        return json({
          data: [
            {
              access_token: 'curto',
              user_id: 123,
              permissions: 'instagram_business_basic,instagram_business_content_publish',
            },
          ],
        });
      if (url.startsWith('https://graph.instagram.com/access_token?'))
        return json({ access_token: 'longo', token_type: 'bearer', expires_in: 5184000 });
      throw new Error(url);
    });
    const now = new Date('2026-10-10T00:00:00Z');
    const token = await exchangeInstagramCode(
      { appId: 'app', appSecret: 'sec', code: 'abc#_', redirectUri: 'https://crm.test/cb', now },
      api.impl,
    );
    expect(form(api.calls[0]!).get('code')).toBe('abc');
    const long = new URL(api.calls[1]!.url);
    expect(long.searchParams.get('grant_type')).toBe('ig_exchange_token');
    expect(long.searchParams.get('access_token')).toBe('curto');
    expect(token).toEqual({
      accessToken: 'longo',
      expiresAt: new Date('2026-12-09T00:00:00Z'),
      userId: '123',
      permissions: ['instagram_business_basic', 'instagram_business_content_publish'],
    });
  });

  it('aceita a resposta do token curto sem o envelope data[]', async () => {
    const api = fakeFetch((url) =>
      url.includes('oauth/access_token')
        ? json({ access_token: 'curto', user_id: '1', permissions: ['instagram_business_basic'] })
        : json({ access_token: 'longo', expires_in: 10 }),
    );
    const token = await exchangeInstagramCode(
      { appId: 'a', appSecret: 's', code: 'c', redirectUri: 'r' },
      api.impl,
    );
    expect(token.accessToken).toBe('longo');
    expect(token.permissions).toEqual(['instagram_business_basic']);
  });

  it('código recusado vira erro legível', async () => {
    const api = fakeFetch(() =>
      json({ error_type: 'OAuthException', code: 400, error_message: 'Invalid code' }, 400),
    );
    await expect(
      exchangeInstagramCode({ appId: 'a', appSecret: 's', code: 'c', redirectUri: 'r' }, api.impl),
    ).rejects.toThrow('O Instagram não liberou o acesso: Invalid code');
  });

  it('renova o token longo', async () => {
    const api = fakeFetch(() => json({ access_token: 'novo', expires_in: 100 }));
    const now = new Date('2026-10-10T00:00:00Z');
    const token = await refreshInstagramToken('velho', { now }, api.impl);
    const u = new URL(api.calls[0]!.url);
    expect(u.pathname).toBe('/refresh_access_token');
    expect(u.searchParams.get('grant_type')).toBe('ig_refresh_token');
    expect(token).toEqual({ accessToken: 'novo', expiresAt: new Date(now.getTime() + 100_000) });
  });

  it('lê a conta: user_id é o id de publicação', async () => {
    const api = fakeFetch(() =>
      json({
        id: 'app-scoped',
        user_id: '17841',
        username: 'empresa',
        account_type: 'BUSINESS',
        profile_picture_url: 'https://p',
      }),
    );
    expect(await fetchInstagramProfile('tok', api.impl)).toEqual({
      userId: '17841',
      username: 'empresa',
      name: null,
      accountType: 'BUSINESS',
      picture: 'https://p',
    });
  });
});

describe('adaptador do Instagram — vídeo (Reels)', () => {
  const reel = {
    id: 'v1',
    url: 'https://blob.test/v1.mp4',
    width: 1080,
    height: 1920,
    mimeType: 'video/mp4',
    alt: 'anúncio',
    bytes: 23_000_000,
    durationMs: 24_000,
  };

  it('cria um container REELS com video_url e share_to_feed, espera FINISHED e publica', async () => {
    const api = instagramApi({ statuses: ['IN_PROGRESS', 'FINISHED'] });
    const res = await provider(api.impl).publish(input({ media: [reel] }));
    expect(res.externalId).toBe('999');
    const created = api.calls.filter((c) => c.url.endsWith('/17841/media'));
    expect(created).toHaveLength(1);
    const body = form(created[0]!);
    expect(body.get('media_type')).toBe('REELS');
    expect(body.get('video_url')).toBe(reel.url);
    expect(body.get('share_to_feed')).toBe('true');
    expect(body.get('caption')).toBe('Legenda #dados');
    expect(body.has('image_url')).toBe(false);
  });

  it('ainda processando: retryLater com o container guardado; a próxima tentativa publica o mesmo', async () => {
    const first = instagramApi({ statuses: ['IN_PROGRESS'] });
    const err = await provider(first.impl, 2).publish(input({ media: [reel] })).catch((e) => e);
    expect(err).toBeInstanceOf(SocialPublishError);
    expect(err.opts.retryLater).toBe(true);
    expect(err.opts.providerState).toEqual({ instagram: { container: 'c1' } });

    const second = instagramApi({ statuses: ['FINISHED'] });
    await provider(second.impl).publish(input({ media: [reel], providerState: err.opts.providerState }));
    expect(second.calls.some((c) => c.url.endsWith('/17841/media'))).toBe(false);
    expect(form(second.calls.find((c) => c.url.endsWith('/media_publish'))!).get('creation_id')).toBe('c1');
  });

  it('imagem ainda processando continua falha comum (sem retryLater)', async () => {
    const api = instagramApi({ statuses: ['IN_PROGRESS'] });
    const err = await provider(api.impl, 2).publish(input()).catch((e) => e);
    expect(err.opts.retryLater).toBeFalsy();
  });
});

describe('adaptador do Instagram — story', () => {
  const storyVideo = { id: 's1', url: 'https://blob.test/s1.mp4', width: 1080, height: 1920, mimeType: 'video/mp4', alt: 'story', bytes: 5_000_000, durationMs: 15_000 };

  it('imagem: container STORIES com image_url e sem legenda', async () => {
    const api = instagramApi({ statuses: ['FINISHED'] });
    const res = await provider(api.impl).publish(input({ placement: 'story' }));
    expect(res.externalId).toBe('999');
    const body = form(api.calls.find((c) => c.url.endsWith('/17841/media'))!);
    expect(body.get('media_type')).toBe('STORIES');
    expect(body.has('image_url')).toBe(true);
    expect(body.has('caption')).toBe(false);
  });

  it('vídeo: container STORIES com video_url; processando volta à fila sem duplicar', async () => {
    const api = instagramApi({ statuses: ['IN_PROGRESS'] });
    const err = await provider(api.impl, 2).publish(input({ placement: 'story', media: [storyVideo] })).catch((e) => e);
    expect(err.opts.retryLater).toBe(true);
    const body = form(api.calls.find((c) => c.url.endsWith('/17841/media'))!);
    expect(body.get('media_type')).toBe('STORIES');
    expect(body.get('video_url')).toBe(storyVideo.url);
    expect(body.has('share_to_feed')).toBe(false);
  });
});
