import { describe, expect, it } from 'vitest';
import { createLinkedinProvider } from './linkedin.js';
import { SocialPublishError, type PublishInput } from './types.js';

// Vídeo no LinkedIn (Videos API): envio em partes com ETag, finalize, espera
// AVAILABLE. Nenhum teste chama a rede.
type Call = { url: string; init: RequestInit };

const VIDEO_BYTES = new Uint8Array(10).map((_, i) => i);
const video = {
  id: 'v1',
  url: 'https://blob.test/v1.mp4',
  width: 1920,
  height: 1080,
  mimeType: 'video/mp4',
  alt: 'anúncio',
  bytes: VIDEO_BYTES.byteLength,
  durationMs: 24_000,
};

function input(over: Partial<PublishInput> = {}): PublishInput {
  return {
    postId: 'p1',
    account: { id: 'a1', provider: 'LINKEDIN', kind: 'PERSON', externalId: 'sub123', accessToken: 'tok' },
    text: 'Três planilhas. Uma resposta.',
    media: [video],
    linkUrl: null,
    providerState: null,
    ...over,
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function api(statuses: string[] = ['AVAILABLE']) {
  const calls: Call[] = [];
  const queue = [...statuses];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === video.url) return new Response(VIDEO_BYTES);
    if (url.includes('/videos?action=initializeUpload'))
      return json({
        value: {
          video: 'urn:li:video:9',
          uploadToken: 'tk',
          uploadInstructions: [
            { uploadUrl: 'https://upload.test/1', firstByte: 0, lastByte: 5 },
            { uploadUrl: 'https://upload.test/2', firstByte: 6, lastByte: 9 },
          ],
        },
      });
    if (url.startsWith('https://upload.test/')) return new Response(null, { status: 200, headers: { etag: `etag-${url.at(-1)}` } });
    if (url.includes('/videos?action=finalizeUpload')) return new Response(null, { status: 200 });
    if (url.includes('/videos/')) return json({ status: queue.length > 1 ? queue.shift() : queue[0] });
    if (url.endsWith('/rest/posts')) return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:1' } });
    return new Response('?', { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

describe('LinkedIn: vídeo', () => {
  it('envia em partes, finaliza com os ETags na ordem e publica o urn do vídeo com título', async () => {
    const { impl, calls } = api(['PROCESSING', 'AVAILABLE']);
    const res = await createLinkedinProvider(impl, { pollDelayMs: 0 }).publish(input());
    expect(res.externalId).toBe('urn:li:share:1');

    const init = JSON.parse(String(calls.find((c) => c.url.includes('initializeUpload'))!.init.body));
    expect(init.initializeUploadRequest).toMatchObject({ owner: 'urn:li:person:sub123', fileSizeBytes: 10 });

    const parts = calls.filter((c) => c.url.startsWith('https://upload.test/'));
    expect(parts.map((p) => (p.init.body as Uint8Array).byteLength)).toEqual([6, 4]);

    const fin = JSON.parse(String(calls.find((c) => c.url.includes('finalizeUpload'))!.init.body));
    expect(fin.finalizeUploadRequest).toEqual({ video: 'urn:li:video:9', uploadToken: 'tk', uploadedPartIds: ['etag-1', 'etag-2'] });

    const post = JSON.parse(String(calls.find((c) => c.url.endsWith('/rest/posts'))!.init.body));
    expect(post.content).toEqual({ media: { id: 'urn:li:video:9', title: 'Três planilhas. Uma resposta.' } });
    expect(res.providerState).toMatchObject({ linkedinVideo: { key: 'v1', urn: 'urn:li:video:9' } });
  });

  it('ainda processando: volta para a fila (retryLater) guardando o urn, e a próxima tentativa não reenvia', async () => {
    const first = api(['PROCESSING']);
    const err = await createLinkedinProvider(first.impl, { pollDelayMs: 0, pollAttempts: 2 })
      .publish(input())
      .catch((e) => e);
    expect(err).toBeInstanceOf(SocialPublishError);
    expect(err.opts.retryLater).toBe(true);
    expect(err.opts.providerState).toMatchObject({ linkedinVideo: { key: 'v1', urn: 'urn:li:video:9' } });

    const second = api(['AVAILABLE']);
    await createLinkedinProvider(second.impl, { pollDelayMs: 0 }).publish(input({ providerState: err.opts.providerState }));
    expect(second.calls.some((c) => c.url.includes('initializeUpload'))).toBe(false);
    expect(second.calls.some((c) => c.url === video.url)).toBe(false);
  });

  it('processamento falhou: erro de verdade, sem retryLater, e esquece o urn para reenviar', async () => {
    const { impl } = api(['PROCESSING_FAILED']);
    const err = await createLinkedinProvider(impl, { pollDelayMs: 0 }).publish(input()).catch((e) => e);
    expect(err.opts.retryLater).toBeFalsy();
    expect(err.opts.providerState?.linkedinVideo).toBeUndefined();
  });
});
