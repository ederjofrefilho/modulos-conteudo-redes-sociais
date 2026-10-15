import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@app/db';
import type { Ctx } from '@app/core';
import { publishPost, unpublishPost } from './posts.js';

/**
 * Integração contra o Postgres (ver packages/core/src/events.db.test.ts):
 * publicar/despublicar precisa aparecer na linha do tempo — é o que deixa a
 * IA cruzar "artigo X publicado" com as visitas que vieram depois.
 */
const suffix = `content-events-${Date.now()}`;
let ctx: Ctx;
let userId: string;
let postId: string;
let assetId: string;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `${suffix}@example.test`, name: 'Teste Conteúdo' } });
  userId = user.id;
  ctx = { actor: { id: user.id, email: user.email, name: user.name, role: user.role } };
  assetId = (
    await prisma.contentAsset.create({
      data: {
        url: 'https://example.test/capa.png',
        pathname: `${suffix}/capa.png`,
        width: 1200,
        height: 630,
        alt: 'Capa',
        bytes: 1000,
        mimeType: 'image/png',
        uploadedById: userId,
      },
    })
  ).id;
  postId = (
    await prisma.contentPost.create({
      data: {
        kind: 'ARTICLE',
        slug: suffix,
        title: 'Artigo de teste',
        excerpt: 'Resumo',
        seoDescription: 'Descrição de SEO curta.',
        category: 'Dados',
        accent: 'teal',
        blocks: [{ type: 'richText', html: '<p>Texto</p>' }],
        coverAssetId: assetId,
        authorId: userId,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { actorId: userId } });
  await prisma.event.deleteMany({ where: { payload: { path: ['postId'], equals: postId } } });
  await prisma.contentPost.deleteMany({ where: { id: postId } });
  await prisma.contentAsset.deleteMany({ where: { id: assetId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe('conteúdo grava eventos', () => {
  it('publicar grava content.published (1ª publicação marcada)', async () => {
    await publishPost(postId, ctx);
    const [ev] = await prisma.event.findMany({ where: { type: 'content.published', actorId: userId } });
    expect(ev).toMatchObject({ source: 'crm' });
    expect(ev!.payload).toMatchObject({ postId, slug: suffix, kind: 'ARTICLE', firstPublication: true });
  });

  it('publicação pelo cron (sem ctx) fica com origem "cron"', async () => {
    await publishPost(postId);
    const evs = await prisma.event.findMany({
      where: { type: 'content.published', payload: { path: ['postId'], equals: postId } },
      orderBy: { createdAt: 'asc' },
    });
    expect(evs).toHaveLength(2);
    expect(evs[1]).toMatchObject({ source: 'cron', actorId: null });
    expect(evs[1]!.payload).toMatchObject({ firstPublication: false });
  });

  it('despublicar grava content.unpublished', async () => {
    await unpublishPost(postId, ctx);
    const [ev] = await prisma.event.findMany({ where: { type: 'content.unpublished', actorId: userId } });
    expect(ev!.payload).toMatchObject({ postId, slug: suffix });
  });
});
