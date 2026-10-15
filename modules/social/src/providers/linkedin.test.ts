import { describe, expect, it } from 'vitest';
import {
  createLinkedinProvider,
  exchangeLinkedinCode,
  fetchLinkedinProfile,
  linkedinAuthorizeUrl,
} from './linkedin.js';
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

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

// PNG 1×1 de verdade: o carrossel vira PDF e o pdf-lib lê os bytes da imagem.
const PNG_1PX = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);
const png = (id: string) => ({
  ...image(id),
  url: `https://blob.test/${id}.png`,
  mimeType: 'image/png',
});

const image = (id: string) => ({
  id,
  url: `https://blob.test/${id}.jpg`,
  width: 1200,
  height: 1200,
  mimeType: 'image/jpeg',
  alt: `alt ${id}`,
});

function input(over: Partial<PublishInput> = {}): PublishInput {
  return {
    postId: 'p1',
    account: {
      id: 'a1',
      provider: 'LINKEDIN',
      kind: 'PERSON',
      externalId: 'sub123',
      accessToken: 'tok',
    },
    text: 'Olá #dados',
    media: [],
    linkUrl: null,
    linkPreview: null,
    providerState: null,
    ...over,
  };
}

/**
 * LinkedIn de mentira: imagens viram urn:li:image:<n>, documentos
 * urn:li:document:<n> (status na ordem de `docStatus`, o último se repete),
 * post devolve x-restli-id.
 */
function linkedinApi(opts: { postStatus?: number; postBody?: unknown; docStatus?: string[] } = {}) {
  let n = 0;
  const statuses = [...(opts.docStatus ?? ['AVAILABLE'])];
  return fakeFetch((url) => {
    if (url.startsWith('https://blob.test/'))
      return new Response(url.endsWith('.png') ? PNG_1PX : new Uint8Array([1, 2, 3]));
    if (url.endsWith('/rest/documents?action=initializeUpload')) {
      n += 1;
      return json({
        value: { uploadUrl: `https://upload.test/doc${n}`, document: `urn:li:document:${n}` },
      });
    }
    if (url.includes('/rest/documents/urn')) {
      const status = statuses.length > 1 ? statuses.shift()! : statuses[0]!;
      return json({ status });
    }
    if (url.endsWith('/rest/images?action=initializeUpload')) {
      n += 1;
      return json({ value: { uploadUrl: `https://upload.test/${n}`, image: `urn:li:image:${n}` } });
    }
    if (url.startsWith('https://upload.test/')) return new Response(null, { status: 201 });
    if (url.endsWith('/rest/posts')) {
      return opts.postStatus && opts.postStatus >= 400
        ? json(opts.postBody ?? { message: 'erro' }, opts.postStatus)
        : new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:999' } });
    }
    throw new Error(`URL inesperada: ${url}`);
  });
}

const postBody = (calls: Call[]) =>
  JSON.parse(String(calls.find((c) => c.url.endsWith('/rest/posts'))!.init.body));

describe('adaptador do LinkedIn — publicar', () => {
  it('texto puro: autor pessoal, little text, headers da API e link do post', async () => {
    const api = linkedinApi();
    const result = await createLinkedinProvider(api.impl).publish(input());
    expect(result).toMatchObject({
      externalId: 'urn:li:share:999',
      externalUrl: 'https://www.linkedin.com/feed/update/urn:li:share:999/',
    });
    const post = api.calls.find((c) => c.url.endsWith('/rest/posts'))!;
    const headers = post.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0');
    expect(headers['Linkedin-Version']).toMatch(/^\d{6}$/);
    const body = postBody(api.calls);
    expect(body).toMatchObject({
      author: 'urn:li:person:sub123',
      commentary: 'Olá {hashtag|\\#|dados}',
      visibility: 'PUBLIC',
      lifecycleState: 'PUBLISHED',
    });
    expect(body.content).toBeUndefined();
  });

  it('página da empresa publica como organização', async () => {
    const api = linkedinApi();
    await createLinkedinProvider(api.impl).publish(
      input({ account: { ...input().account, kind: 'ORGANIZATION', externalId: '42' } }),
    );
    expect(postBody(api.calls).author).toBe('urn:li:organization:42');
  });

  it('uma imagem: sobe pelo Images API e vai em content.media com alt', async () => {
    const api = linkedinApi();
    const result = await createLinkedinProvider(api.impl).publish(input({ media: [image('x')] }));
    const put = api.calls.find((c) => c.url.startsWith('https://upload.test/'))!;
    expect(put.init.method).toBe('PUT');
    expect(postBody(api.calls).content).toEqual({
      media: { id: 'urn:li:image:1', altText: 'alt x' },
    });
    expect(result.providerState).toEqual({ linkedinImages: { x: 'urn:li:image:1' } });
  });

  it('várias imagens: um PDF (uma página por imagem) publicado como documento com título', async () => {
    const api = linkedinApi({ docStatus: ['PROCESSING', 'AVAILABLE'] });
    const result = await createLinkedinProvider(api.impl, { pollDelayMs: 0 }).publish(
      input({ media: [png('a'), png('b'), png('c')], documentTitle: 'Caso TTP' }),
    );
    expect(api.calls.some((c) => c.url.includes('/rest/images'))).toBe(false);
    const put = api.calls.find((c) => c.url === 'https://upload.test/doc1')!;
    expect((put.init.headers as Record<string, string>)['Content-Type']).toBe('application/pdf');
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.load(put.init.body as Uint8Array);
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getTitle()).toBe('Caso TTP');
    expect(api.calls.filter((c) => c.url.includes('/rest/documents/urn'))).toHaveLength(2);
    expect(postBody(api.calls).content).toEqual({
      media: { id: 'urn:li:document:1', title: 'Caso TTP' },
    });
    expect(result.providerState).toMatchObject({
      linkedinDocument: { key: 'a,b,c', urn: 'urn:li:document:1' },
    });
  });

  it('sem artigo de origem, o título do documento é a 1ª linha do texto', async () => {
    const api = linkedinApi();
    await createLinkedinProvider(api.impl, { pollDelayMs: 0 }).publish(
      input({
        text: '\nTrês pessoas paravam a rotina. #dados\nresto',
        media: [png('a'), png('b')],
      }),
    );
    expect(postBody(api.calls).content.media.title).toBe('Três pessoas paravam a rotina.');
  });

  it('documento ainda processando: falha guardando o urn, e a nova tentativa não sobe outro PDF', async () => {
    const slow = linkedinApi({ docStatus: ['PROCESSING'] });
    const err = await createLinkedinProvider(slow.impl, { pollDelayMs: 0, pollAttempts: 3 })
      .publish(input({ media: [png('a'), png('b')] }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(SocialPublishError);
    expect(err.message).toContain('processando');
    expect(slow.calls.some((c) => c.url.endsWith('/rest/posts'))).toBe(false);
    const saved = err.opts.providerState;
    expect(saved.linkedinDocument).toEqual({ key: 'a,b', urn: 'urn:li:document:1' });

    const retry = linkedinApi();
    await createLinkedinProvider(retry.impl, { pollDelayMs: 0 }).publish(
      input({ media: [png('a'), png('b')], providerState: saved }),
    );
    expect(retry.calls.some((c) => c.url.includes('initializeUpload'))).toBe(false);
    expect(postBody(retry.calls).content.media.id).toBe('urn:li:document:1');
  });

  it('carrossel editado depois da falha gera PDF novo', async () => {
    const api = linkedinApi();
    await createLinkedinProvider(api.impl, { pollDelayMs: 0 }).publish(
      input({
        media: [png('b'), png('a')],
        providerState: { linkedinDocument: { key: 'a,b', urn: 'urn:li:document:velho' } },
      }),
    );
    expect(postBody(api.calls).content.media.id).toBe('urn:li:document:1');
  });

  it('PDF que o LinkedIn não processou: erro legível e documento descartado', async () => {
    const err = await createLinkedinProvider(
      linkedinApi({ docStatus: ['PROCESSING_FAILED'] }).impl,
      {
        pollDelayMs: 0,
      },
    )
      .publish(input({ media: [png('a'), png('b')] }))
      .catch((e) => e);
    expect(err.message).toContain('não conseguiu processar');
    expect(err.opts.providerState.linkedinDocument).toBeUndefined();
  });

  it('imagem que não é JPEG nem PNG não entra no PDF', async () => {
    const err = await createLinkedinProvider(linkedinApi().impl, { pollDelayMs: 0 })
      .publish(input({ media: [png('a'), { ...png('b'), mimeType: 'image/gif' }] }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(SocialPublishError);
    expect(err.message).toContain('PDF');
  });

  it('nova tentativa reaproveita a imagem já enviada (sem duplicar upload)', async () => {
    const api = linkedinApi();
    await createLinkedinProvider(api.impl).publish(
      input({
        media: [image('a')],
        providerState: { linkedinImages: { a: 'urn:li:image:antiga' } },
      }),
    );
    expect(api.calls.filter((c) => c.url.includes('initializeUpload'))).toHaveLength(0);
    expect(postBody(api.calls).content.media.id).toBe('urn:li:image:antiga');
  });

  it('link vira article com a prévia do artigo de origem', async () => {
    const api = linkedinApi();
    await createLinkedinProvider(api.impl).publish(
      input({
        linkUrl: 'https://example.com/blog/x',
        linkPreview: { title: 'Título', description: 'Resumo', thumbnail: image('capa') },
      }),
    );
    expect(postBody(api.calls).content).toEqual({
      article: {
        source: 'https://example.com/blog/x',
        title: 'Título',
        description: 'Resumo',
        thumbnail: 'urn:li:image:1',
      },
    });
  });

  it('link sem artigo de origem usa o domínio como título', async () => {
    const api = linkedinApi();
    await createLinkedinProvider(api.impl).publish(input({ linkUrl: 'https://example.com/x' }));
    expect(postBody(api.calls).content).toEqual({
      article: { source: 'https://example.com/x', title: 'example.com' },
    });
  });

  it('401: token expirado desativa a conta e guarda as imagens já enviadas', async () => {
    const api = linkedinApi({ postStatus: 401 });
    const err = await createLinkedinProvider(api.impl)
      .publish(input({ media: [image('a')] }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(SocialPublishError);
    expect(err.message).toContain('reconecte');
    expect(err.opts).toMatchObject({
      deactivateAccount: true,
      providerState: { linkedinImages: { a: 'urn:li:image:1' } },
    });
  });

  it('429 e 403 viram mensagens legíveis sem desativar a conta', async () => {
    const limited = await createLinkedinProvider(linkedinApi({ postStatus: 429 }).impl)
      .publish(input())
      .catch((e) => e);
    expect(limited.message).toContain('limitou');
    expect(limited.opts.deactivateAccount).toBeUndefined();
    const denied = await createLinkedinProvider(
      linkedinApi({ postStatus: 403, postBody: { message: 'ACCESS_DENIED' } }).impl,
    )
      .publish(input())
      .catch((e) => e);
    expect(denied.message).toContain('permissão');
    expect(denied.message).toContain('ACCESS_DENIED');
  });

  it('erro de validação devolve a mensagem da API', async () => {
    const err = await createLinkedinProvider(
      linkedinApi({ postStatus: 422, postBody: { message: 'FIELD_LENGTH_TOO_LONG' } }).impl,
    )
      .publish(input())
      .catch((e) => e);
    expect(err.message).toContain('HTTP 422');
    expect(err.message).toContain('FIELD_LENGTH_TOO_LONG');
  });

  it('sem token não chama a rede', async () => {
    const api = linkedinApi();
    const err = await createLinkedinProvider(api.impl)
      .publish(input({ account: { ...input().account, accessToken: null } }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(SocialPublishError);
    expect(api.calls).toHaveLength(0);
  });

  it('falha de rede vira SocialPublishError', async () => {
    const { impl } = fakeFetch(() => {
      throw new Error('ECONNRESET');
    });
    const err = await createLinkedinProvider(impl)
      .publish(input())
      .catch((e) => e);
    expect(err).toBeInstanceOf(SocialPublishError);
    expect(err.message).toContain('ECONNRESET');
  });
});

describe('OAuth do LinkedIn', () => {
  it('URL de autorização com escopos de publicar e state', () => {
    const url = new URL(
      linkedinAuthorizeUrl({
        clientId: 'cid',
        redirectUri: 'https://crm.test/api/social/linkedin/callback',
        state: 's1',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'cid',
      redirect_uri: 'https://crm.test/api/social/linkedin/callback',
      state: 's1',
      scope: 'openid profile w_member_social',
    });
  });

  it('troca o código pelo token com validade e escopos', async () => {
    const { impl, calls } = fakeFetch(() =>
      json({ access_token: 'AT', expires_in: 5184000, scope: 'openid,profile,w_member_social' }),
    );
    const token = await exchangeLinkedinCode(
      {
        clientId: 'cid',
        clientSecret: 'sec',
        code: 'c1',
        redirectUri: 'https://crm.test/cb',
        now: new Date('2026-10-10T00:00:00Z'),
      },
      impl,
    );
    expect(token).toEqual({
      accessToken: 'AT',
      refreshToken: null,
      expiresAt: new Date('2026-12-09T00:00:00Z'),
      scopes: ['openid', 'profile', 'w_member_social'],
    });
    const sent = new URLSearchParams(String(calls[0]!.init.body));
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(sent.get('client_secret')).toBe('sec');
  });

  it('erro na troca do código vira mensagem legível', async () => {
    const { impl } = fakeFetch(() =>
      json({ error: 'invalid_request', error_description: 'redirect_uri não confere' }, 400),
    );
    await expect(
      exchangeLinkedinCode(
        { clientId: 'cid', clientSecret: 'sec', code: 'c1', redirectUri: 'x' },
        impl,
      ),
    ).rejects.toThrow('redirect_uri não confere');
  });

  it('perfil: sub, nome e foto', async () => {
    const { impl } = fakeFetch(() =>
      json({
        sub: 'abc',
        given_name: 'Ana',
        family_name: 'Souza',
        picture: 'https://img.test/p.jpg',
      }),
    );
    expect(await fetchLinkedinProfile('AT', impl)).toEqual({
      sub: 'abc',
      name: 'Ana Souza',
      picture: 'https://img.test/p.jpg',
    });
  });
});
