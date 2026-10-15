'use server';

import { del } from '@vercel/blob';
import { revalidatePath } from 'next/cache';
import { posts, assets, buildPreviewUrl } from '@app/content';
import type { ContentKind } from '@app/db';
import { requireCtx } from '@/lib/session';
import { toActionResult, type ActionResult } from '@/lib/action-result';

/** Gera uma URL de prévia de curta duração (~15 min) pro `PostPreviewFrame`. `null` sem `SITE_REVALIDATE_URL`/`SITE_PREVIEW_SECRET` configurados — a UI cai para a mensagem "prévia indisponível". */
export async function getPreviewUrlAction(id: string): Promise<ActionResult<{ url: string | null }>> {
  try {
    await requireCtx();
    return { ok: true, data: { url: buildPreviewUrl(id) } };
  } catch (err) {
    return toActionResult(err);
  }
}

export async function createPostAction(
  data: posts.ContentPostCreate,
): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    const ctx = await requireCtx();
    const post = await posts.createPost(data, ctx);
    revalidatePath('/conteudo');
    return { ok: true, data: { id: post.id, slug: post.slug } };
  } catch (err) {
    return toActionResult(err);
  }
}

/**
 * Criação instantânea — só o tipo, sem tela-ponte. Nasce "Sem título",
 * excerpt/categoria/cor vazios (editáveis a seguir no editor completo); ver
 * `postCreateSchema` em `modules/content/src/posts.ts`, que passou a aceitar
 * esses campos ausentes na criação de propósito para este fluxo.
 */
export async function quickCreatePostAction(kind: ContentKind): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireCtx();
    const post = await posts.createPost({ kind, title: 'Sem título', blocks: [] }, ctx);
    revalidatePath('/conteudo');
    return { ok: true, data: { id: post.id } };
  } catch (err) {
    return toActionResult(err);
  }
}

/**
 * `expectedContentUpdatedAt` (ISO) — opcional, manda o autosave do editor
 * para detectar conflito (outra aba/pessoa salvou por baixo) em vez de
 * sobrescrever em silêncio; ver `posts.updatePost`. Não revalida `/conteudo`
 * aqui: essa rota já é `force-dynamic` (sempre busca fresco ao navegar) e
 * este action dispara a cada autosave — invalidar o cache do roteador a
 * cada poucos segundos de digitação era custo sem benefício.
 */
export async function updatePostAction(
  id: string,
  data: posts.ContentPostUpdate,
  expectedContentUpdatedAt?: string,
): Promise<ActionResult<{ slug: string; contentUpdatedAt: string }>> {
  try {
    await requireCtx();
    const post = await posts.updatePost(
      id,
      data,
      expectedContentUpdatedAt ? { expectedContentUpdatedAt: new Date(expectedContentUpdatedAt) } : {},
    );
    revalidatePath(`/conteudo/${id}`);
    return { ok: true, data: { slug: post.slug, contentUpdatedAt: post.contentUpdatedAt.toISOString() } };
  } catch (err) {
    return toActionResult(err);
  }
}

export async function publishPostAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    await posts.publishPost(id, ctx);
  } catch (err) {
    return toActionResult(err);
  }
  revalidatePath('/conteudo');
  revalidatePath(`/conteudo/${id}`);
  return { ok: true };
}

export async function unpublishPostAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    await posts.unpublishPost(id, ctx);
  } catch (err) {
    return toActionResult(err);
  }
  revalidatePath('/conteudo');
  revalidatePath(`/conteudo/${id}`);
  return { ok: true };
}

export async function schedulePostAction(
  id: string,
  scheduledAtIso: string,
): Promise<ActionResult<{ scheduledAt: string | null }>> {
  try {
    await requireCtx();
    const post = await posts.schedulePost(id, new Date(scheduledAtIso));
    revalidatePath('/conteudo');
    revalidatePath(`/conteudo/${id}`);
    return { ok: true, data: { scheduledAt: post.scheduledAt?.toISOString() ?? null } };
  } catch (err) {
    return toActionResult(err);
  }
}

export async function cancelScheduleAction(id: string): Promise<ActionResult> {
  try {
    await requireCtx();
    await posts.cancelSchedule(id);
    revalidatePath('/conteudo');
    revalidatePath(`/conteudo/${id}`);
    return { ok: true };
  } catch (err) {
    return toActionResult(err);
  }
}

/**
 * Ações em massa da listagem — publicar/despublicar rodam por `posts.ts`
 * (validação por post, não dá para virar um `updateMany` cru). Sucessos
 * parciais contam normalmente; só devolve erro se TODOS falharem.
 */
export async function bulkPublishPostsAction(ids: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    const ctx = await requireCtx();
    let count = 0;
    let lastError: string | undefined;
    for (const id of ids) {
      try {
        await posts.publishPost(id, ctx);
        count++;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Falha ao publicar.';
      }
    }
    revalidatePath('/conteudo');
    if (count === 0 && lastError) return { ok: false, error: lastError };
    return { ok: true, data: { count } };
  } catch (err) {
    return toActionResult(err);
  }
}

export async function bulkUnpublishPostsAction(ids: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    const ctx = await requireCtx();
    let count = 0;
    for (const id of ids) {
      await posts.unpublishPost(id, ctx);
      count++;
    }
    revalidatePath('/conteudo');
    return { ok: true, data: { count } };
  } catch (err) {
    return toActionResult(err);
  }
}

export async function bulkSetCategoryPostsAction(
  ids: string[],
  category: string,
): Promise<ActionResult<{ count: number }>> {
  try {
    await requireCtx();
    let count = 0;
    for (const id of ids) {
      await posts.updatePost(id, { category });
      count++;
    }
    revalidatePath('/conteudo');
    return { ok: true, data: { count } };
  } catch (err) {
    return toActionResult(err);
  }
}

export async function bulkDeletePostsAction(ids: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    await requireCtx();
    let count = 0;
    for (const id of ids) {
      await posts.deletePost(id);
      count++;
    }
    revalidatePath('/conteudo');
    return { ok: true, data: { count } };
  } catch (err) {
    return toActionResult(err);
  }
}

export async function listContentCategoriesAction(): Promise<string[]> {
  await requireCtx();
  return posts.listCategories();
}

export async function duplicatePostAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireCtx();
    const copy = await posts.duplicatePost(id, ctx);
    revalidatePath('/conteudo');
    return { ok: true, data: { id: copy.id } };
  } catch (err) {
    return toActionResult(err);
  }
}

export async function deletePostAction(id: string): Promise<ActionResult> {
  try {
    await requireCtx();
    await posts.deletePost(id);
  } catch (err) {
    return toActionResult(err);
  }
  revalidatePath('/conteudo');
  return { ok: true };
}

/** `kind` ausente = imagens e vídeos (seletor das redes sociais). */
export async function listContentAssetsAction(q?: string, take = 60, kind?: 'image' | 'video') {
  await requireCtx();
  return assets.listContentAssets({ q, take, kind });
}

/** Quanto a biblioteca ocupa (arquivos e bytes) — para saber quando vale limpar. */
export async function contentStorageAction(): Promise<{ files: number; bytes: number }> {
  await requireCtx();
  return assets.contentStorage();
}

export async function deleteContentAssetAction(id: string): Promise<ActionResult<{ id: string; deleted: boolean; freedFile: boolean }>> {
  try {
    await requireCtx();
    const data = await assets.deleteContentAsset(id);
    // Apaga também o arquivo no Blob (é isso que libera espaço). Só do store do CRM;
    // falhar aqui não desfaz a exclusão — o registo já saiu da biblioteca.
    let freedFile = false;
    if (process.env.BLOB_STORE_ID && data.url.includes('.public.blob.vercel-storage.com/')) {
      freedFile = await del(data.url).then(
        () => true,
        (err) => {
          console.error('[conteudo] não foi possível apagar o arquivo do Blob:', err);
          return false;
        },
      );
    }
    return { ok: true, data: { id: data.id, deleted: data.deleted, freedFile } };
  } catch (err) {
    return toActionResult(err);
  }
}

export async function createContentAssetAction(data: {
  url: string;
  pathname: string;
  width: number;
  height: number;
  alt: string;
  bytes: number;
  mimeType: string;
  durationMs?: number | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireCtx();
    const asset = await assets.createContentAsset(data, ctx);
    return { ok: true, data: { id: asset.id } };
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateContentAssetAltAction(id: string, alt: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireCtx();
    const asset = await assets.updateContentAsset(id, { alt });
    return { ok: true, data: { id: asset.id } };
  } catch (err) {
    return toActionResult(err);
  }
}
