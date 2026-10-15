import { prisma, ContentStatus, type ContentKind, type Prisma } from '@app/db';
import { NotFoundError, listParamsSchema, type ListParamsInput, type Paginated } from '@app/core';
import { contentBlocksSchema, imageAssetIdsIn, type ContentBlock } from './blocks.js';

// Leitura para o site: só PUBLISHED, e todo bloco `image`/`gallery` já vem
// com o(s) asset(s) resolvido(s) (url/width/height/alt) — o site não precisa
// de uma segunda chamada pra renderizar com next/image sem layout shift.
// Recursivo: um `image`/`gallery` dentro de `columns`/`accordion` é
// resolvido igual a um do topo — a saída atravessa a fronteira JSON/HTTP
// para o site, que a revalida com o próprio schema, então o tipo aqui é
// deliberadamente `unknown[]` em vez de tentar espelhar em TS a forma exata
// de "ContentBlock com asset embutido".
type ResolvedAsset = { url: string; width: number; height: number; alt: string };

const COVER_SELECT = { select: { id: true, url: true, width: true, height: true, alt: true } } as const;

function resolveOne(block: ContentBlock, byId: Map<string, ResolvedAsset>): unknown {
  if (block.type === 'image') {
    return { ...block, asset: block.assetId ? (byId.get(block.assetId) ?? null) : null };
  }
  if (block.type === 'gallery') {
    return { ...block, assets: block.assetIds.map((id) => byId.get(id) ?? null) };
  }
  if (block.type === 'columns') {
    return {
      ...block,
      columns: block.columns.map((col) => ({ ...col, blocks: col.blocks.map((b) => resolveOne(b, byId)) })),
    };
  }
  if (block.type === 'accordion') {
    return {
      ...block,
      items: block.items.map((item) => ({ ...item, blocks: item.blocks.map((b) => resolveOne(b, byId)) })),
    };
  }
  return block;
}

async function resolveBlocks(raw: unknown): Promise<unknown[]> {
  const blocks = contentBlocksSchema.parse(raw);
  const assetIds = imageAssetIdsIn(blocks);
  if (assetIds.length === 0) return blocks;

  const assets = await prisma.contentAsset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, url: true, width: true, height: true, alt: true },
  });
  const byId = new Map(assets.map((a) => [a.id, a]));

  return blocks.map((block) => resolveOne(block, byId));
}

export async function listPublishedPosts(params: ListParamsInput & { kind?: ContentKind } = {}) {
  const { q, skip, take } = listParamsSchema.parse(params);
  const where: Prisma.ContentPostWhereInput = {
    status: ContentStatus.PUBLISHED,
    ...(params.kind ? { kind: params.kind } : {}),
    ...(q
      ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { excerpt: { contains: q, mode: 'insensitive' } }] }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.contentPost.findMany({ where, orderBy: { publishedAt: 'desc' }, skip, take, include: { coverAsset: COVER_SELECT } }),
    prisma.contentPost.count({ where }),
  ]);

  const items = await Promise.all(rows.map((row) => resolvePost(row)));
  return { items, total, skip, take } satisfies Paginated<Awaited<ReturnType<typeof resolvePost>>>;
}

export async function getPublishedPostBySlug(slug: string) {
  const row = await prisma.contentPost.findUnique({ where: { slug }, include: { coverAsset: COVER_SELECT } });
  if (!row || row.status !== ContentStatus.PUBLISHED) throw new NotFoundError('Post', slug);
  return resolvePost(row);
}

/**
 * Mesma resolução de `getPublishedPostBySlug` (blocos com asset embutido),
 * mas por id e SEM o filtro de status — é o que a prévia por iframe precisa:
 * ver como um rascunho vai ficar antes de publicar. Nunca exposta sem
 * autenticação (ver `apps/web/src/app/api/content/preview/[id]/route.ts`,
 * que valida um token HMAC de curta duração antes de chamar isto).
 */
export async function getPreviewPost(id: string) {
  const row = await prisma.contentPost.findUnique({ where: { id }, include: { coverAsset: COVER_SELECT } });
  if (!row) throw new NotFoundError('Post', id);
  return resolvePost(row);
}

async function resolvePost<T extends { blocks: unknown }>(row: T) {
  return { ...row, blocks: await resolveBlocks(row.blocks) };
}
