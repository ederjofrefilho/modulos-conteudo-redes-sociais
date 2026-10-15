import { prisma, ContentKind, ContentStatus, type Prisma } from '@app/db';
import { z } from 'zod';
import { NotFoundError, ValidationError, events, listParamsSchema, type ListParamsInput, type Paginated } from '@app/core';
import type { Ctx } from '@app/core';
import { contentBlocksSchema, sanitizeBlocks, imageAssetIdsIn, walkBlocks, CURRENT_BLOCKS_VERSION, type ContentBlock } from './blocks.js';
import { isVideoMime } from './media-kinds.js';
import { notifySiteRevalidate } from './revalidate.js';

const AUTHOR_SELECT = { select: { id: true, name: true, email: true } } as const;
const COVER_SELECT = { select: { id: true, url: true, width: true, height: true, alt: true } } as const;

const postCreateSchema = z.object({
  kind: z.nativeEnum(ContentKind),
  slug: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1, 'Título é obrigatório'),
  // Opcionais na CRIAÇÃO (não em publishPost, que continua exigindo o que já
  // exigia) — a criação instantânea no editor (kind+título só) precisa
  // conseguir nascer sem excerpt/categoria/cor definidos ainda; se vierem
  // preenchidos (ex.: create_post via MCP), continuam validados normalmente.
  excerpt: z.string().trim().min(1, 'Resumo é obrigatório').optional(),
  seoTitle: z.string().trim().nullable().optional(),
  seoDescription: z.string().trim().nullable().optional(),
  category: z.string().trim().min(1, 'Categoria é obrigatória').optional(),
  accent: z.string().trim().min(1, 'Cor de destaque é obrigatória').optional(),
  blocks: contentBlocksSchema.default([]),
  coverAssetId: z.string().trim().nullable().optional(),
  ctaHeadline: z.string().trim().nullable().optional(),
  ctaDescription: z.string().trim().nullable().optional(),
  // Só fazem sentido em kind: CASE, mas não vale a pena bifurcar o schema por
  // isso — publishPost recusa combinação inconsistente na hora que importa.
  clienteExibicao: z.string().trim().nullable().optional(),
  setor: z.string().trim().nullable().optional(),
  clienteAutorizou: z.boolean().optional(),
});
const postUpdateSchema = postCreateSchema.partial().omit({ kind: true });

export type ContentPostCreate = z.infer<typeof postCreateSchema>;
export type ContentPostUpdate = z.infer<typeof postUpdateSchema>;

/** "Relatório vs. Dashboard: qual sua empresa precisa" -> "relatorio-vs-dashboard-qual-sua-empresa-precisa" */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const POST_ORDER: Record<string, Prisma.ContentPostOrderByWithRelationInput> = {
  'updated-asc': { updatedAt: 'asc' },
  'updated-desc': { updatedAt: 'desc' },
  'published-desc': { publishedAt: 'desc' },
  'title-asc': { title: 'asc' },
  'title-desc': { title: 'desc' },
};

export async function listPosts(
  params: ListParamsInput & {
    kind?: ContentKind;
    status?: ContentStatus;
    sort?: string;
    /** Filtra por autor (usado pelo toggle "Meus posts" da listagem) — não é `ctx`/`mine` de propósito: quem resolve o id do ator é o chamador (ver assinatura de `pipelines.getBoard`, mesma inconsistência deliberada documentada no CLAUDE.md). */
    authorId?: string;
    category?: string;
  } = {},
): Promise<Paginated<any>> {
  const { q, skip, take } = listParamsSchema.parse(params);
  const where: Prisma.ContentPostWhereInput = {
    ...(params.kind ? { kind: params.kind } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.authorId ? { authorId: params.authorId } : {}),
    ...(params.category ? { category: params.category } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { excerpt: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contentPost.findMany({
      where,
      orderBy: POST_ORDER[params.sort ?? ''] ?? { updatedAt: 'desc' },
      skip,
      take,
      include: { author: AUTHOR_SELECT, coverAsset: COVER_SELECT },
    }),
    prisma.contentPost.count({ where }),
  ]);
  return { items, total, skip, take };
}

/** Categorias distintas já usadas — alimenta o combobox com autocomplete do editor (sem tabela própria de categorias). */
export async function listCategories(): Promise<string[]> {
  const rows = await prisma.contentPost.findMany({
    where: { category: { not: '' } },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });
  return rows.map((r) => r.category);
}

export async function getPost(id: string) {
  const post = await prisma.contentPost.findUnique({
    where: { id },
    include: { author: AUTHOR_SELECT, coverAsset: COVER_SELECT },
  });
  if (!post) throw new NotFoundError('Post', id);
  return post;
}

export async function getPostBySlug(slug: string) {
  const post = await prisma.contentPost.findUnique({
    where: { slug },
    include: { author: AUTHOR_SELECT, coverAsset: COVER_SELECT },
  });
  if (!post) throw new NotFoundError('Post', slug);
  return post;
}

export async function createPost(input: ContentPostCreate, ctx: Ctx) {
  const parsed = postCreateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());

  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(parsed.data.title);
  if (!slug) throw new ValidationError('Não foi possível gerar um slug a partir do título — informe um manualmente.');

  try {
    return await prisma.contentPost.create({
      data: {
        ...toData(parsed.data),
        // Colunas obrigatórias sem default no schema — vazio aqui é uma
        // publicação bloqueada por publishPost (ou, no caso de categoria,
        // um lembrete visual no editor), não um erro de criação. É o que
        // permite a criação instantânea (kind + título só) do redesign do
        // editor: o resto se preenche depois, na tela.
        excerpt: parsed.data.excerpt ?? '',
        category: parsed.data.category ?? '',
        accent: parsed.data.accent ?? '',
        seoDescription: parsed.data.seoDescription ?? '',
        slug,
        blocksVersion: CURRENT_BLOCKS_VERSION,
        authorId: ctx.actor.id,
      } as Prisma.ContentPostUncheckedCreateInput,
      include: { author: AUTHOR_SELECT, coverAsset: COVER_SELECT },
    });
  } catch (err) {
    throw translateUniqueError(err);
  }
}

/**
 * Atualiza um post — inclusive um já PUBLISHED. Deliberadamente NÃO revalida
 * o site aqui (só bump de `contentUpdatedAt`): um post no ar acumula
 * "alterações não publicadas" normalmente enquanto o autor edita/autosalva, e
 * só vai ao ar de novo quando `publishPost` for chamado explicitamente
 * (botão "Atualizar publicação" no editor) — ver BACKLOG.md, redesign do
 * módulo de conteúdo. Antes desta mudança, TODO save de um post publicado
 * disparava revalidação imediata, o que tornava impossível rascunhar uma
 * edição maior num post já no ar sem publicar pedaço por pedaço.
 */
/**
 * `opts.expectedContentUpdatedAt`: bloqueio otimista pro autosave do editor
 * — quando presente, o update só aplica se `contentUpdatedAt` no banco ainda
 * bater com o que o cliente tinha ao carregar/salvar por último. Sem isso,
 * duas abas (ou dois autores) editando o mesmo post se sobrescreviam em
 * silêncio, cada save vencendo o anterior sem aviso nenhum. Omitido (ex.:
 * chamadas via MCP), o comportamento é o de sempre — sem checagem.
 */
export async function updatePost(
  id: string,
  input: ContentPostUpdate,
  opts: { expectedContentUpdatedAt?: Date } = {},
) {
  const parsed = postUpdateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());
  await ensureExists(id);

  const data = toData(parsed.data);
  if (parsed.data.slug !== undefined) {
    const slug = slugify(parsed.data.slug ?? '');
    if (!slug) throw new ValidationError('Slug inválido.');
    data.slug = slug;
  }
  // A forma da união pode ter mudado desde que o post nasceu (ex.: post
  // criado antes de `columns` existir) — qualquer save que toca `blocks`
  // realinha `blocksVersion` com a versão atual, é o sinal que o site usa
  // pra saber se já sabe renderizar o que está gravado.
  if (parsed.data.blocks !== undefined) data.blocksVersion = CURRENT_BLOCKS_VERSION;

  try {
    if (opts.expectedContentUpdatedAt) {
      const result = await prisma.contentPost.updateMany({
        where: { id, contentUpdatedAt: opts.expectedContentUpdatedAt },
        data: { ...data, contentUpdatedAt: new Date() } as Prisma.ContentPostUncheckedUpdateInput,
      });
      if (result.count === 0) {
        throw new ValidationError(
          'Este post foi alterado em outro lugar (outra aba ou outra pessoa) — recarregue a página antes de continuar editando.',
        );
      }
      return await prisma.contentPost.findUniqueOrThrow({
        where: { id },
        include: { author: AUTHOR_SELECT, coverAsset: COVER_SELECT },
      });
    }
    return await prisma.contentPost.update({
      where: { id },
      data: { ...data, contentUpdatedAt: new Date() } as Prisma.ContentPostUncheckedUpdateInput,
      include: { author: AUTHOR_SELECT, coverAsset: COVER_SELECT },
    });
  } catch (err) {
    throw translateUniqueError(err);
  }
}

export async function deletePost(id: string) {
  await ensureExists(id);
  await prisma.contentPost.delete({ where: { id } });
  return { id, deleted: true };
}

type PublishGateRow = {
  seoDescription: string;
  slug: string;
  coverAssetId: string | null;
  blocks: unknown;
  kind: ContentKind;
  clienteExibicao: string | null;
  clienteAutorizou: boolean;
};

/**
 * As 5 regras que um post precisa satisfazer para ir ao ar — usadas tanto por
 * `publishPost` (publicar agora) quanto por `schedulePost` (agendar: o autor
 * recebe o mesmo feedback por campo NA HORA de agendar, não só quando o cron
 * disparar de madrugada e falhar em silêncio). `seoTitle` não tem teto de
 * tamanho aqui: o teto de 53 caracteres do site (` · Marca`) só se aplica às
 * páginas de integração (src/lib/integrations.ts) — a página de post usa
 * `title: { absolute }` (site institucional/src/app/blog/[slug]/page.tsx), sem
 * template nem limite.
 */
async function checkPublishGates(post: PublishGateRow): Promise<Record<string, string>> {
  const issues: Record<string, string> = {};

  if (!post.seoDescription || !post.seoDescription.trim()) {
    issues.seoDescription = 'Descrição de SEO é obrigatória.';
  } else if (post.seoDescription.length > 160) {
    issues.seoDescription = `Descrição de SEO tem ${post.seoDescription.length} caracteres — máximo 160.`;
  }

  if (!KEBAB_CASE.test(post.slug)) {
    issues.slug = 'Slug precisa estar em kebab-case (ex.: "meu-titulo-aqui").';
  }

  if (!post.coverAssetId) {
    issues.coverAssetId = 'Capa é obrigatória para publicar.';
  } else {
    const cover = await prisma.contentAsset.findUnique({ where: { id: post.coverAssetId }, select: { mimeType: true } });
    if (cover && isVideoMime(cover.mimeType)) issues.coverAssetId = 'A capa é um vídeo: escolha uma imagem.';
  }

  const blocks = contentBlocksSchema.parse(post.blocks) as ContentBlock[];
  if (blocks.length === 0) {
    issues.blocks = 'Post sem nenhum bloco de conteúdo.';
  } else {
    // `imageAssetIdsIn`/o percurso abaixo são recursivos (`walkBlocks`) —
    // cobrem imagem/galeria dentro de `columns`/`accordion`, não só no topo.
    const assetIds = imageAssetIdsIn(blocks);
    const assets =
      assetIds.length > 0
        ? await prisma.contentAsset.findMany({ where: { id: { in: assetIds } }, select: { id: true, alt: true, mimeType: true } })
        : [];
    const altById = new Map(assets.map((a) => [a.id, a.alt]));
    const videoIds = new Set(assets.filter((a) => isVideoMime(a.mimeType)).map((a) => a.id));

    let blocksIssue: string | null = null;
    walkBlocks(blocks, (block) => {
      if (blocksIssue) return; // a mensagem é só o primeiro motivo encontrado
      // Vídeo é só para as redes: o site não tem bloco de vídeo.
      if ((block.type === 'image' && videoIds.has(block.assetId)) || (block.type === 'gallery' && block.assetIds.some((id) => videoIds.has(id)))) {
        blocksIssue = 'Há um vídeo num bloco de imagem: o blog só aceita imagens.';
        return;
      }
      if (block.type === 'image') {
        if (!block.assetId) blocksIssue = 'Há bloco de imagem sem arquivo escolhido.';
        else if (!altById.get(block.assetId)?.trim()) blocksIssue = 'Há bloco de imagem cujo arquivo não tem texto alternativo (alt).';
      } else if (block.type === 'gallery') {
        if (block.assetIds.length < 2) blocksIssue = 'Galeria precisa de ao menos 2 imagens.';
        else if (block.assetIds.some((assetId) => !altById.get(assetId)?.trim()))
          blocksIssue = 'Há imagem de galeria cujo arquivo não tem texto alternativo (alt).';
      } else if (block.type === 'button') {
        if (!block.label.trim() || !block.href.trim()) blocksIssue = 'Há botão sem texto ou sem link.';
      } else if (block.type === 'quote') {
        if (!block.text.trim()) blocksIssue = 'Há citação sem texto.';
      } else if (block.type === 'table') {
        if (block.rows.length === 0) blocksIssue = 'Há tabela sem nenhuma linha.';
      }
    });
    if (blocksIssue) issues.blocks = blocksIssue;
  }

  if (post.kind === ContentKind.CASE && post.clienteExibicao?.trim() && !post.clienteAutorizou) {
    issues.clienteAutorizou = 'Cliente identificado sem marcar autorização de uso do nome.';
  }

  return issues;
}

/**
 * Publica um post (ou republica um já PUBLISHED com alterações acumuladas —
 * ver `updatePost`) — recusa com erro por campo em vez de deixar publicar
 * pela metade (ver BACKLOG.md, Fase A). `publishedAt` só é setado na
 * primeira vez (fica fixo depois — é o `datePublished` do JSON-LD do site);
 * `publishedContentUpdatedAt` é setado a CADA publicação bem-sucedida, igual
 * a `contentUpdatedAt` no mesmo instante — é o que permite à UI saber se um
 * post publicado tem alterações não publicadas (`contentUpdatedAt` avança
 * sozinho a cada save; `publishedContentUpdatedAt` só quando isto roda).
 */
/** Sem `ctx` = publicação pelo cron de agendados (`publishDueScheduled`). */
export async function publishPost(id: string, ctx?: Ctx) {
  const post = await prisma.contentPost.findUnique({ where: { id } });
  if (!post) throw new NotFoundError('Post', id);

  const issues = await checkPublishGates(post);
  if (Object.keys(issues).length > 0) {
    throw new ValidationError('Não é possível publicar: corrija os campos indicados.', issues);
  }

  const now = new Date();
  const published = await prisma.contentPost.update({
    where: { id },
    data: {
      status: ContentStatus.PUBLISHED,
      publishedAt: post.publishedAt ?? now,
      contentUpdatedAt: now,
      publishedContentUpdatedAt: now,
      scheduledAt: null,
    },
    include: { author: AUTHOR_SELECT, coverAsset: COVER_SELECT },
  });
  await notifySiteRevalidate(published.kind, published.slug);
  await events.emit({
    type: 'content.published',
    source: ctx ? events.sourceOf(ctx) : 'cron',
    actorId: ctx?.actor.id ?? null,
    payload: {
      postId: published.id,
      kind: published.kind,
      slug: published.slug,
      title: published.title,
      firstPublication: !post.publishedAt,
    },
  });
  return published;
}

export async function unpublishPost(id: string, ctx?: Ctx) {
  await ensureExists(id);
  const unpublished = await prisma.contentPost.update({
    where: { id },
    data: { status: ContentStatus.ARCHIVED, contentUpdatedAt: new Date() },
    include: { author: AUTHOR_SELECT, coverAsset: COVER_SELECT },
  });
  await notifySiteRevalidate(unpublished.kind, unpublished.slug);
  await events.emit({
    type: 'content.unpublished',
    source: events.sourceOf(ctx),
    actorId: ctx?.actor.id ?? null,
    payload: { postId: unpublished.id, kind: unpublished.kind, slug: unpublished.slug, title: unpublished.title },
  });
  return unpublished;
}

/**
 * Agenda a publicação — roda as MESMAS 5 validações de `publishPost` agora,
 * não só quando o cron for disparar (ver `checkPublishGates`): o autor
 * descobre um problema (SEO vazio, sem capa...) na hora de agendar, com a
 * mesma UI de erro por campo, em vez de o agendamento falhar em silêncio de
 * madrugada. `scheduledAt` precisa ser no futuro.
 */
export async function schedulePost(id: string, scheduledAt: Date) {
  const post = await prisma.contentPost.findUnique({ where: { id } });
  if (!post) throw new NotFoundError('Post', id);

  if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    throw new ValidationError('Não é possível agendar: corrija os campos indicados.', {
      scheduledAt: 'Escolha uma data e hora no futuro.',
    });
  }

  const issues = await checkPublishGates(post);
  if (Object.keys(issues).length > 0) {
    throw new ValidationError('Não é possível agendar: corrija os campos indicados.', issues);
  }

  return prisma.contentPost.update({
    where: { id },
    data: { status: ContentStatus.SCHEDULED, scheduledAt },
    include: { author: AUTHOR_SELECT, coverAsset: COVER_SELECT },
  });
}

/** Cancela um agendamento — volta para DRAFT (nunca "publica parcialmente"). */
export async function cancelSchedule(id: string) {
  await ensureExists(id);
  return prisma.contentPost.update({
    where: { id },
    data: { status: ContentStatus.DRAFT, scheduledAt: null },
    include: { author: AUTHOR_SELECT, coverAsset: COVER_SELECT },
  });
}

/**
 * Publica os posts SCHEDULED vencidos — chamado pelo cron
 * (`/api/cron/publish-scheduled`, a cada ~15min via agendador externo, mesmo
 * molde do sync de IMAP). Revalida as 5 regras de novo de forma defensiva
 * (um asset pode ter sido apagado entre agendar e o cron rodar); o que ainda
 * falhar fica SCHEDULED (nunca é revertido pra DRAFT em silêncio) e só é
 * logado — intervenção manual, não retry automático.
 */
export async function publishDueScheduled({ max = 25 }: { max?: number } = {}) {
  const due = await prisma.contentPost.findMany({
    where: { status: ContentStatus.SCHEDULED, scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: 'asc' },
    take: max,
    select: { id: true, title: true },
  });

  let published = 0;
  const skipped: { id: string; title: string; reason: string }[] = [];
  for (const row of due) {
    try {
      await publishPost(row.id);
      published++;
    } catch (err) {
      const reason = err instanceof ValidationError ? err.message : 'Erro inesperado ao publicar.';
      skipped.push({ id: row.id, title: row.title, reason });
      console.error(`[content] Falha ao publicar post agendado ${row.id} ("${row.title}"):`, err);
    }
  }
  return { checked: due.length, published, skipped };
}

/**
 * Duplica um post como ponto de partida para um novo (ver BACKLOG.md, Fase
 * B: um caso de sucesso tem quase sempre a mesma espinha, e duplicar poupa
 * mais tempo que qualquer sistema de modelos). Sempre nasce DRAFT, com slug
 * derivado + sufixo, e `clienteAutorizou` reiniciado em false — autorização
 * de uso de nome de cliente é por post, nunca herdada por cópia.
 */
export async function duplicatePost(id: string, ctx: Ctx) {
  const source = await prisma.contentPost.findUnique({ where: { id } });
  if (!source) throw new NotFoundError('Post', id);

  const baseSlug = `${source.slug}-copia`;
  let slug = baseSlug;
  let suffix = 2;
  while (await prisma.contentPost.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${suffix++}`;
  }

  return prisma.contentPost.create({
    data: {
      kind: source.kind,
      slug,
      title: `${source.title} (cópia)`,
      excerpt: source.excerpt,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      category: source.category,
      accent: source.accent,
      blocks: source.blocks as Prisma.InputJsonValue,
      blocksVersion: source.blocksVersion,
      coverAssetId: source.coverAssetId,
      ctaHeadline: source.ctaHeadline,
      ctaDescription: source.ctaDescription,
      clienteExibicao: source.clienteExibicao,
      setor: source.setor,
      clienteAutorizou: false,
      status: ContentStatus.DRAFT,
      authorId: ctx.actor.id,
    },
    include: { author: AUTHOR_SELECT, coverAsset: COVER_SELECT },
  });
}

function translateUniqueError(err: unknown): unknown {
  if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
    return new ValidationError('Já existe um post com esse slug.');
  }
  return err;
}

async function ensureExists(id: string) {
  const exists = await prisma.contentPost.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError('Post', id);
}

function toData(
  input: ContentPostCreate | ContentPostUpdate,
): Prisma.ContentPostUncheckedCreateInput & Prisma.ContentPostUncheckedUpdateInput {
  const { blocks, slug: _slug, ...rest } = input;
  const data: Record<string, unknown> = { ...rest };
  for (const key of ['seoTitle', 'seoDescription', 'coverAssetId', 'ctaHeadline', 'ctaDescription', 'clienteExibicao', 'setor'] as const) {
    if (data[key] !== undefined) data[key] = data[key] || null;
  }
  if (blocks !== undefined) data.blocks = sanitizeBlocks(blocks as ContentBlock[]) as Prisma.InputJsonValue;
  return data as Prisma.ContentPostUncheckedCreateInput & Prisma.ContentPostUncheckedUpdateInput;
}
