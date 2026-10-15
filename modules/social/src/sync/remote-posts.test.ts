import { describe, expect, it } from 'vitest';
import { instagramToRemote, linkedinToRemote, listInstagramPosts } from './remote-posts.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Instagram → publicação no CRM', () => {
  it('carrossel com todos os itens; vídeo usa a capa como miniatura', () => {
    const r = instagramToRemote({
      id: '9',
      caption: 'Legenda',
      permalink: 'https://instagram.com/p/9',
      timestamp: '2026-10-01T12:00:00+0000',
      media_type: 'CAROUSEL_ALBUM',
      children: {
        data: [
          { id: 'a', media_type: 'IMAGE', media_url: 'https://cdn/a.jpg' },
          { id: 'b', media_type: 'VIDEO', media_url: 'https://cdn/b.mp4', thumbnail_url: 'https://cdn/b.jpg' },
        ],
      },
    })!;
    expect(r.type).toBe('CAROUSEL');
    expect(r.items).toEqual([
      { kind: 'image', url: 'https://cdn/a.jpg', thumbUrl: null, source: 'https://cdn/a.jpg' },
      { kind: 'video', url: 'https://cdn/b.mp4', thumbUrl: null, source: 'https://cdn/b.jpg' },
    ]);
  });

  it('reel, vídeo e story', () => {
    const base = { id: '1', timestamp: '2026-10-01T12:00:00+0000', media_url: 'https://cdn/v.mp4', thumbnail_url: 'https://cdn/v.jpg' };
    expect(instagramToRemote({ ...base, media_type: 'VIDEO', media_product_type: 'REELS' })!.type).toBe('REEL');
    expect(instagramToRemote({ ...base, media_type: 'VIDEO', media_product_type: 'FEED' })!.type).toBe('VIDEO');
    const story = instagramToRemote({ ...base, media_type: 'IMAGE' }, true)!;
    expect(story.type).toBe('STORY');
    expect(story.expiresAt?.toISOString()).toBe('2026-10-02T12:00:00.000Z');
  });

  it('lista o feed até ao limite de datas e junta as stories', async () => {
    const since = new Date('2026-05-01T00:00:00Z');
    const fetchImpl = (async (url: string) =>
      url.includes('/stories')
        ? json({ data: [{ id: 's1', media_type: 'IMAGE', media_url: 'https://cdn/s.jpg', timestamp: '2026-10-14T08:00:00+0000' }] })
        : json({
            data: [
              { id: '1', media_type: 'IMAGE', media_url: 'https://cdn/1.jpg', timestamp: '2026-10-01T12:00:00+0000' },
              { id: '2', media_type: 'IMAGE', timestamp: '2026-01-01T12:00:00+0000' },
            ],
            paging: { next: 'https://graph.instagram.com/next' },
          })) as unknown as typeof fetch;
    const posts = await listInstagramPosts({ externalId: '17841' }, 'tok', since, fetchImpl);
    expect(posts.map((p) => `${p.externalId}:${p.type}`)).toEqual(['1:IMAGE', 's1:STORY']);
  });
});

describe('LinkedIn (Página) → publicação no CRM', () => {
  it('documento, imagens múltiplas e link, com as URLs resolvidas', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes('/rest/documents/')) return json({ downloadUrl: 'https://li/doc.pdf', title: 'Caso' });
      if (url.includes('/rest/images/')) return json({ downloadUrl: `https://li/${decodeURIComponent(url).split(':').pop()}.jpg` });
      return json({}, 404);
    }) as unknown as typeof fetch;
    const at = Date.parse('2026-10-02T10:00:00Z');
    const doc = await linkedinToRemote(
      { id: 'urn:li:share:1', commentary: 'Doc', lifecycleState: 'PUBLISHED', publishedAt: at, content: { media: { id: 'urn:li:document:7', title: 'Caso' } } },
      'tok',
      fetchImpl,
    );
    expect(doc).toMatchObject({ type: 'DOCUMENT', items: [{ kind: 'document', url: 'https://li/doc.pdf', source: null }] });

    const multi = await linkedinToRemote(
      { id: 'urn:li:share:2', publishedAt: at, content: { multiImage: { images: [{ id: 'urn:li:image:a' }, { id: 'urn:li:image:b' }] } } },
      'tok',
      fetchImpl,
    );
    expect(multi?.type).toBe('CAROUSEL');
    expect(multi?.items.map((i) => i.source)).toEqual(['https://li/a.jpg', 'https://li/b.jpg']);

    const link = await linkedinToRemote(
      { id: 'urn:li:share:3', publishedAt: at, content: { article: { source: 'https://example.com/x', title: 'Artigo' } } },
      'tok',
      fetchImpl,
    );
    expect(link).toMatchObject({ type: 'ARTICLE', linkUrl: 'https://example.com/x', linkTitle: 'Artigo', items: [] });
    expect(link?.url).toBe('https://www.linkedin.com/feed/update/urn:li:share:3/');
  });

  it('ignora rascunhos', async () => {
    expect(await linkedinToRemote({ id: 'urn:li:share:9', lifecycleState: 'DRAFT', createdAt: 1 }, 'tok')).toBeNull();
  });
});
