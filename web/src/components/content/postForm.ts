import { walkBlocks, type ContentBlock } from '@app/content-contract';
import type { PickedAsset } from './MediaPicker';
import type { ContentKindLike, ContentStatusLike } from './meta';

export interface PostEditorPost {
  id: string;
  kind: ContentKindLike;
  status: ContentStatusLike;
  slug: string;
  title: string;
  excerpt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  category: string;
  accent: string;
  blocks: ContentBlock[];
  coverAssetId: string | null;
  ctaHeadline: string | null;
  ctaDescription: string | null;
  clienteExibicao: string | null;
  setor: string | null;
  clienteAutorizou: boolean;
  scheduledAt: string | null;
  contentUpdatedAt: string;
  publishedContentUpdatedAt: string | null;
}

export interface PostForm {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  accent: string;
  seoTitle: string;
  seoDescription: string;
  ctaHeadline: string;
  ctaDescription: string;
  clienteExibicao: string;
  setor: string;
  clienteAutorizou: boolean;
  coverAssetId: string | null;
  blocks: ContentBlock[];
}

export function toPostForm(post: PostEditorPost): PostForm {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    category: post.category,
    accent: post.accent,
    seoTitle: post.seoTitle ?? '',
    seoDescription: post.seoDescription ?? '',
    ctaHeadline: post.ctaHeadline ?? '',
    ctaDescription: post.ctaDescription ?? '',
    clienteExibicao: post.clienteExibicao ?? '',
    setor: post.setor ?? '',
    clienteAutorizou: post.clienteAutorizou,
    coverAssetId: post.coverAssetId,
    blocks: post.blocks,
  };
}

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Espelha, no cliente, as checagens de conteúdo que `checkPublishGates`
 * (`modules/content/src/posts.ts`) faz no servidor — a mesma travessia
 * recursiva (`walkBlocks`), pra o checklist de prontidão não deixar passar
 * batido algo que o publish vai recusar (ex.: imagem sem alt DENTRO de uma
 * coluna). É deliberadamente aproximado, não a autoridade: o servidor
 * valida de novo no `publishPost`/`schedulePost` de qualquer jeito.
 */
function blocksReadinessIssue(
  blocks: ContentBlock[],
  assetsById: Record<string, PickedAsset>,
): string | null {
  let issue: string | null = null;
  walkBlocks(blocks, (block) => {
    if (issue) return;
    if (block.type === 'image') {
      if (!block.assetId) issue = 'Há bloco de imagem sem arquivo escolhido.';
      else if (!assetsById[block.assetId]?.alt?.trim())
        issue = 'Há bloco de imagem cujo arquivo não tem texto alternativo (alt).';
    } else if (block.type === 'gallery') {
      if (block.assetIds.length < 2) issue = 'Galeria precisa de ao menos 2 imagens.';
      else if (block.assetIds.some((id) => !assetsById[id]?.alt?.trim()))
        issue = 'Há imagem de galeria sem texto alternativo (alt).';
    } else if (block.type === 'button') {
      if (!block.label.trim() || !block.href.trim()) issue = 'Há botão sem texto ou sem link.';
    } else if (block.type === 'quote') {
      if (!block.text.trim()) issue = 'Há citação sem texto.';
    } else if (block.type === 'table') {
      if (block.rows.length === 0) issue = 'Há tabela sem nenhuma linha.';
    }
  });
  return issue;
}

export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  /** id do campo no painel de configurações — o item da lista leva até ele. */
  fieldId: string;
}

/** Checklist "Prontidão para publicar" do painel de configurações. */
export function postReadiness(
  form: PostForm,
  kind: ContentKindLike,
  assetsById: Record<string, PickedAsset>,
): ReadinessItem[] {
  return [
    {
      key: 'seoDescription',
      label: 'Descrição de SEO (até 160 caracteres)',
      ok: form.seoDescription.trim().length > 0 && form.seoDescription.trim().length <= 160,
      fieldId: 'field-seoDescription',
    },
    {
      key: 'slug',
      label: 'Slug em kebab-case',
      ok: KEBAB_CASE.test(form.slug),
      fieldId: 'field-slug',
    },
    { key: 'cover', label: 'Capa definida', ok: !!form.coverAssetId, fieldId: 'field-cover' },
    {
      key: 'blocks',
      label: 'Corpo com conteúdo (imagens/botões/tabelas completos)',
      ok: form.blocks.length > 0 && blocksReadinessIssue(form.blocks, assetsById) === null,
      fieldId: 'field-blocks',
    },
    ...(kind === 'CASE'
      ? [
          {
            key: 'clienteAutorizou',
            label: 'Autorização de uso do nome do cliente',
            ok: !form.clienteExibicao.trim() || form.clienteAutorizou,
            fieldId: 'field-clienteAutorizou',
          },
        ]
      : []),
  ];
}
