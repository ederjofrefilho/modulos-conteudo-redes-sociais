import { notFound } from 'next/navigation';
import { PageShell } from '@/components/ui';
import { posts, assets, contentBlocksSchema, imageAssetIdsIn } from '@app/content';
import { NotFoundError } from '@app/core';
import { requireCtx } from '@/lib/session';
import { PostEditor, type PostEditorPost } from '@/components/content/PostEditor';
import type { PickedAsset } from '@/components/content/MediaPicker';
import { PostPromotionSection } from '@/components/social/PostPromotionSection';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  try {
    const post = await posts.getPost((await params).id);
    return { title: post.title };
  } catch {
    return { title: 'Post' };
  }
}

export default async function ContentPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCtx();

  let post: Awaited<ReturnType<typeof posts.getPost>>;
  try {
    post = await posts.getPost(id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const blocks = contentBlocksSchema.parse(post.blocks);
  const assetIds = Array.from(new Set([...imageAssetIdsIn(blocks), ...(post.coverAssetId ? [post.coverAssetId] : [])]));
  const [assetRows, categories] = await Promise.all([assets.getAssetsByIds(assetIds), posts.listCategories()]);
  const assetsById: Record<string, PickedAsset> = Object.fromEntries(
    assetRows.map((a) => [a.id, { id: a.id, url: a.url, width: a.width, height: a.height, alt: a.alt }]),
  );

  const editorPost: PostEditorPost = {
    id: post.id,
    kind: post.kind,
    status: post.status,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    category: post.category,
    accent: post.accent,
    blocks: blocks as PostEditorPost['blocks'],
    coverAssetId: post.coverAssetId,
    ctaHeadline: post.ctaHeadline,
    ctaDescription: post.ctaDescription,
    clienteExibicao: post.clienteExibicao,
    setor: post.setor,
    clienteAutorizou: post.clienteAutorizou,
    scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
    contentUpdatedAt: post.contentUpdatedAt.toISOString(),
    publishedContentUpdatedAt: post.publishedContentUpdatedAt ? post.publishedContentUpdatedAt.toISOString() : null,
  };

  // Sem `PageHeader`/wrapper aqui de propósito: `PostEditor` já desenha a
  // própria barra superior (sticky, com o link de volta) e o próprio
  // contêiner de rolagem — duplicar os dois nesta página produzia duas
  // barras e duas rolagens competindo na mesma tela.
  // Editor em tela cheia: o shell não tem respiro lateral (`bleed`) e o
  // cabeçalho é o PageHeader dentro do PostEditor.
  return (
    <PageShell fill bleed>
      <PostEditor
        post={editorPost}
        categories={categories}
        initialAssetsById={assetsById}
        initialCover={post.coverAssetId ? (assetsById[post.coverAssetId] ?? null) : null}
        promotion={<PostPromotionSection contentPostId={post.id} />}
      />
    </PageShell>
  );
}
