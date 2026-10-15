import { prisma, SocialPostStatus, SocialProvider, type Prisma } from '@app/db';
import { z } from 'zod';
import { NotFoundError, ValidationError, events, listParamsSchema, notifications, type Ctx, type ListParamsInput } from '@app/core';
import { accountIdsWith, assertAccess, publisherIds } from './access.js';
import { PLACEMENTS, isPlacement, validateSocialDraft, type MediaInfo, type SocialIssues } from './rules.js';
import { canApprove, canArchive, canRetry, canSchedule, editBlockedReason, statusAfterEdit } from './status.js';

// Regra de negócio dos posts de rede social. Aprovar NÃO tem tool MCP de
// propósito: só um humano logado aprova, na tela /social. O Claude cria,
// edita, agenda e lista.

const POST_INCLUDE = {
  socialAccount: {
    select: { id: true, provider: true, kind: true, displayName: true, avatarUrl: true, isActive: true, shared: true, ownerId: true },
  },
  createdBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
  scheduledBy: { select: { id: true, name: true, email: true } },
  publishedBy: { select: { id: true, name: true, email: true } },
  sourceContentPost: { select: { id: true, title: true, slug: true, kind: true } },
} as const;

const MEDIA_SELECT = { id: true, url: true, width: true, height: true, alt: true, bytes: true, mimeType: true } as const;

const baseFields = {
  text: z.string().max(10_000, 'Texto longo demais.'),
  mediaAssetIds: z.array(z.string().trim().min(1)).max(20, 'No máximo 20 imagens.'),
  linkUrl: z.string().trim().url('Link inválido').nullable(),
  scheduledAt: z.coerce.date().nullable(),
  sourceContentPostId: z.string().trim().min(1).nullable(),
  campaignKey: z.string().trim().min(1).max(120).nullable(),
  topic: z.string().trim().max(60, 'Tema com no máximo 60 caracteres.').nullable(),
  isIdea: z.boolean(),
  utmAuto: z.boolean(),
  placement: z.enum(PLACEMENTS as [string, ...string[]]),
};

const createSchema = z.object({
  socialAccountId: z.string().trim().min(1, 'Escolha o destino (conta conectada).'),
  text: baseFields.text.default(''),
  mediaAssetIds: baseFields.mediaAssetIds.default([]),
  linkUrl: baseFields.linkUrl.optional(),
  scheduledAt: baseFields.scheduledAt.optional(),
  sourceContentPostId: baseFields.sourceContentPostId.optional(),
  campaignKey: baseFields.campaignKey.optional(),
  topic: baseFields.topic.optional(),
  isIdea: baseFields.isIdea.optional(),
  utmAuto: baseFields.utmAuto.optional(),
  placement: baseFields.placement.optional(),
});
const updateSchema = z.object({
  socialAccountId: z.string().trim().min(1).optional(),
  text: baseFields.text.optional(),
  mediaAssetIds: baseFields.mediaAssetIds.optional(),
  linkUrl: baseFields.linkUrl.optional(),
  scheduledAt: baseFields.scheduledAt.optional(),
  sourceContentPostId: baseFields.sourceContentPostId.optional(),
  campaignKey: baseFields.campaignKey.optional(),
  topic: baseFields.topic.optional(),
  isIdea: baseFields.isIdea.optional(),
  utmAuto: baseFields.utmAuto.optional(),
  placement: baseFields.placement.optional(),
});

export type SocialPostCreate = z.input<typeof createSchema>;
export type SocialPostUpdate = z.input<typeof updateSchema>;

type PostRow = Prisma.SocialPostGetPayload<{ include: typeof POST_INCLUDE }>;
export type SocialPostDto = PostRow & {
  media: Array<MediaInfo & { url: string; alt: string }>;
  issues: SocialIssues;
};

/** Junta as imagens (na ordem) e os avisos de validação da rede. */
async function hydrate(rows: PostRow[]): Promise<SocialPostDto[]> {
  const ids = Array.from(new Set(rows.flatMap((r) => r.mediaAssetIds)));
  const assets = ids.length ? await prisma.contentAsset.findMany({ where: { id: { in: ids } }, select: MEDIA_SELECT }) : [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  return rows.map((row) => {
    const media = row.mediaAssetIds.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => !!a);
    // Publicação sincronizada da rede já está no ar: as regras de publicar não se aplicam.
    if (row.origin === 'imported') return { ...row, media, issues: { errors: {}, warnings: {} } };
    const issues = validateSocialDraft({
      provider: row.socialAccount.provider,
      text: row.text,
      media,
      linkUrl: row.linkUrl,
      placement: isPlacement(row.placement) ? row.placement : 'feed',
    });
    if (media.length < row.mediaAssetIds.length) issues.errors.media = 'Uma das imagens foi apagada da biblioteca — escolha de novo.';
    return { ...row, media, issues };
  });
}

async function loadRow(id: string): Promise<PostRow> {
  const row = await prisma.socialPost.findUnique({ where: { id }, include: POST_INCLUDE });
  if (!row) throw new NotFoundError('Post de rede social', id);
  return row;
}

/** Com `ctx`, exige acesso de leitura à conta do post. */
export async function getSocialPost(id: string, ctx?: Ctx): Promise<SocialPostDto> {
  const row = await loadRow(id);
  if (ctx) await assertAccess(ctx, row.socialAccountId, 'VIEW');
  return (await hydrate([row]))[0]!;
}

/** Nível mínimo para mexer num post: aprovado/agendado é de quem publica; rascunho, de quem cria. */
function minFor(status: SocialPostStatus) {
  return status === SocialPostStatus.DRAFT || status === SocialPostStatus.ARCHIVED ? ('DRAFT' as const) : ('PUBLISH' as const);
}

export async function listSocialPosts(
  params: ListParamsInput & {
    status?: SocialPostStatus | SocialPostStatus[];
    provider?: SocialProvider;
    socialAccountId?: string;
    sourceContentPostId?: string;
    campaignKey?: string;
    createdById?: string;
    topic?: string;
  } = {},
  ctx?: Ctx,
) {
  const { q, skip, take } = listParamsSchema.parse(params);
  const visible = ctx ? await accountIdsWith(ctx, 'VIEW') : null;
  const statuses = params.status ? (Array.isArray(params.status) ? params.status : [params.status]) : undefined;
  const where: Prisma.SocialPostWhereInput = {
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(params.provider ? { socialAccount: { provider: params.provider } } : {}),
    ...(params.socialAccountId ? { socialAccountId: params.socialAccountId } : {}),
    ...(params.sourceContentPostId ? { sourceContentPostId: params.sourceContentPostId } : {}),
    ...(params.campaignKey ? { campaignKey: params.campaignKey } : {}),
    ...(params.createdById ? { createdById: params.createdById } : {}),
    ...(params.topic ? { topic: params.topic } : {}),
    ...(q ? { text: { contains: q, mode: 'insensitive' } } : {}),
    ...(visible ? { AND: [{ socialAccountId: { in: visible } }] } : {}),
  };
  // Fila de trabalho: o que vai ao ar primeiro aparece primeiro; sem horário, os mais recentes.
  const [rows, total] = await Promise.all([
    prisma.socialPost.findMany({
      where,
      include: POST_INCLUDE,
      orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      skip,
      take,
    }),
    prisma.socialPost.count({ where }),
  ]);
  return { items: await hydrate(rows), total, skip, take };
}

/** Contagem por status — para as abas da tela. */
export async function countSocialPostsByStatus(ctx?: Ctx): Promise<Record<SocialPostStatus, number>> {
  const visible = ctx ? await accountIdsWith(ctx, 'VIEW') : null;
  const groups = await prisma.socialPost.groupBy({
    by: ['status'],
    where: visible ? { socialAccountId: { in: visible } } : {},
    _count: { _all: true },
  });
  const counts = Object.fromEntries(Object.values(SocialPostStatus).map((s) => [s, 0])) as Record<SocialPostStatus, number>;
  for (const g of groups) counts[g.status] = g._count._all;
  return counts;
}

async function assertReferences(data: { socialAccountId?: string; mediaAssetIds?: string[]; sourceContentPostId?: string | null }) {
  const errors: Record<string, string> = {};
  if (data.socialAccountId) {
    const account = await prisma.socialAccount.findUnique({ where: { id: data.socialAccountId }, select: { isActive: true } });
    if (!account) errors.socialAccountId = 'Conta de destino não encontrada.';
    else if (!account.isActive) errors.socialAccountId = 'Esta conta está desconectada — reconecte em /settings/social.';
  }
  if (data.mediaAssetIds?.length) {
    const found = await prisma.contentAsset.count({ where: { id: { in: data.mediaAssetIds } } });
    if (found < new Set(data.mediaAssetIds).size) errors.mediaAssetIds = 'Alguma imagem não existe na biblioteca de conteúdo.';
    if (new Set(data.mediaAssetIds).size < data.mediaAssetIds.length) errors.mediaAssetIds = 'A mesma imagem aparece duas vezes.';
  }
  if (data.sourceContentPostId) {
    const post = await prisma.contentPost.findUnique({ where: { id: data.sourceContentPostId }, select: { id: true } });
    if (!post) errors.sourceContentPostId = 'Artigo de origem não encontrado.';
  }
  if (Object.keys(errors).length) throw new ValidationError('Corrija os campos indicados.', errors);
}

function assertFuture(scheduledAt: Date | null | undefined) {
  if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
    throw new ValidationError('Corrija os campos indicados.', { scheduledAt: 'Escolha uma data e hora no futuro.' });
  }
}

/** Sempre nasce DRAFT — aprovar é decisão humana, na tela. */
export async function createSocialPost(input: SocialPostCreate, ctx: Ctx): Promise<SocialPostDto> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());
  const d = parsed.data;
  await assertReferences(d);
  await assertAccess(ctx, d.socialAccountId, 'DRAFT');
  assertFuture(d.scheduledAt);
  const row = await prisma.socialPost.create({
    data: {
      socialAccountId: d.socialAccountId,
      text: d.text,
      mediaAssetIds: d.mediaAssetIds,
      linkUrl: d.linkUrl || null,
      scheduledAt: d.scheduledAt ?? null,
      sourceContentPostId: d.sourceContentPostId ?? null,
      campaignKey: d.campaignKey ?? null,
      topic: d.topic || null,
      isIdea: d.isIdea ?? false,
      utmAuto: d.utmAuto ?? false,
      placement: d.placement ?? 'feed',
      status: SocialPostStatus.DRAFT,
      createdById: ctx.actor.id,
      ...(d.scheduledAt ? { scheduledById: ctx.actor.id } : {}),
    },
    include: POST_INCLUDE,
  });
  return (await hydrate([row]))[0]!;
}

/**
 * Edita. Mudar texto, imagens, link ou destino de um post APPROVED/FAILED
 * volta para DRAFT e limpa a aprovação; mudar só horário/vínculos não.
 */
export async function updateSocialPost(id: string, input: SocialPostUpdate, ctx: Ctx): Promise<SocialPostDto> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());
  const d = parsed.data;
  const current = await loadRow(id);
  const blocked = editBlockedReason(current.status);
  if (blocked) throw new ValidationError(blocked);
  await assertReferences({
    socialAccountId: d.socialAccountId !== current.socialAccountId ? d.socialAccountId : undefined,
    mediaAssetIds: d.mediaAssetIds,
    sourceContentPostId: d.sourceContentPostId,
  });
  if (d.scheduledAt !== undefined && d.scheduledAt?.getTime() !== current.scheduledAt?.getTime()) assertFuture(d.scheduledAt);

  const { status, resetsApproval } = statusAfterEdit(current, {
    text: d.text,
    mediaAssetIds: d.mediaAssetIds,
    linkUrl: d.linkUrl === undefined ? undefined : d.linkUrl || null,
    socialAccountId: d.socialAccountId,
    placement: d.placement,
  });
  // Editar conteúdo volta a rascunho (basta poder criar); mexer num aprovado sem o desfazer é de quem publica.
  await assertAccess(ctx, current.socialAccountId, status === SocialPostStatus.DRAFT ? 'DRAFT' : 'PUBLISH');
  if (d.socialAccountId && d.socialAccountId !== current.socialAccountId) await assertAccess(ctx, d.socialAccountId, 'DRAFT');
  const scheduleChanged = d.scheduledAt !== undefined && d.scheduledAt?.getTime() !== current.scheduledAt?.getTime();
  const row = await prisma.socialPost.update({
    where: { id },
    data: {
      ...(d.socialAccountId !== undefined ? { socialAccountId: d.socialAccountId } : {}),
      ...(d.text !== undefined ? { text: d.text } : {}),
      ...(d.mediaAssetIds !== undefined ? { mediaAssetIds: d.mediaAssetIds } : {}),
      ...(d.linkUrl !== undefined ? { linkUrl: d.linkUrl || null } : {}),
      ...(d.scheduledAt !== undefined ? { scheduledAt: d.scheduledAt } : {}),
      ...(d.sourceContentPostId !== undefined ? { sourceContentPostId: d.sourceContentPostId } : {}),
      ...(d.campaignKey !== undefined ? { campaignKey: d.campaignKey } : {}),
      ...(d.topic !== undefined ? { topic: d.topic || null } : {}),
      ...(d.isIdea !== undefined ? { isIdea: d.isIdea } : {}),
      ...(d.utmAuto !== undefined ? { utmAuto: d.utmAuto } : {}),
      ...(d.placement !== undefined ? { placement: d.placement } : {}),
      status,
      ...(scheduleChanged ? { scheduledById: d.scheduledAt ? ctx.actor.id : null } : {}),
      ...(resetsApproval ? { approvedById: null, approvedAt: null, lastError: null } : {}),
    },
    include: POST_INCLUDE,
  });
  return (await hydrate([row]))[0]!;
}

/** Muda só o horário — não desaprova. `scheduledAt` precisa ser no futuro. */
export async function scheduleSocialPost(id: string, scheduledAt: Date, ctx: Ctx): Promise<SocialPostDto> {
  const current = await loadRow(id);
  await assertAccess(ctx, current.socialAccountId, minFor(current.status));
  const blocked = canSchedule(current.status);
  if (blocked) throw new ValidationError(blocked);
  if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) {
    throw new ValidationError('Corrija os campos indicados.', { scheduledAt: 'Data inválida.' });
  }
  assertFuture(scheduledAt);
  const row = await prisma.socialPost.update({
    where: { id },
    data: { scheduledAt, scheduledById: ctx.actor.id },
    include: POST_INCLUDE,
  });
  return (await hydrate([row]))[0]!;
}

/**
 * Tira o horário. Num rascunho, só limpa. Num APPROVED, sem horário
 * significaria "publicar já" — então volta para rascunho, para nunca
 * publicar sem querer.
 */
export async function unscheduleSocialPost(id: string, ctx: Ctx): Promise<SocialPostDto> {
  const current = await loadRow(id);
  await assertAccess(ctx, current.socialAccountId, minFor(current.status));
  const blocked = canSchedule(current.status);
  if (blocked) throw new ValidationError(blocked);
  const row = await prisma.socialPost.update({
    where: { id },
    data: {
      scheduledAt: null,
      scheduledById: null,
      ...(current.status === SocialPostStatus.APPROVED
        ? { status: SocialPostStatus.DRAFT, approvedById: null, approvedAt: null }
        : {}),
    },
    include: POST_INCLUDE,
  });
  return (await hydrate([row]))[0]!;
}

/**
 * Aprova (SÓ UI — não existe tool MCP para isto). Bloqueia com erro por campo
 * se a rede recusaria o post. `scheduledAt` opcional: "Aprovar e agendar";
 * sem ele, vale o horário que o post já tem (nulo = publicar assim que o
 * publicador passar). Grava `social.approved`.
 */
export async function approveSocialPost(id: string, ctx: Ctx, opts: { scheduledAt?: Date | null } = {}): Promise<SocialPostDto> {
  const [post] = await hydrate([await loadRow(id)]);
  await assertAccess(ctx, post!.socialAccountId, 'PUBLISH');
  const blocked = canApprove(post!.status);
  if (blocked) throw new ValidationError(blocked);
  const errors = { ...post!.issues.errors };
  if (post!.isIdea) throw new ValidationError('Isto ainda é uma ideia — passe para rascunho antes de aprovar.');
  if (!post!.socialAccount.isActive) errors.socialAccountId = 'A conta de destino está desconectada — reconecte em /settings/social.';
  if (opts.scheduledAt) assertFuture(opts.scheduledAt);
  if (Object.keys(errors).length) throw new ValidationError('Não é possível aprovar: corrija os campos indicados.', errors);

  const now = new Date();
  const updated = await prisma.socialPost.updateMany({
    where: { id, status: SocialPostStatus.DRAFT },
    data: {
      status: SocialPostStatus.APPROVED,
      approvedById: ctx.actor.id,
      approvedAt: now,
      lastError: null,
      reviewState: null,
      ...(post!.reviewState ? { reviewedById: ctx.actor.id, reviewedAt: now, reviewComment: null } : {}),
      ...(opts.scheduledAt !== undefined
        ? { scheduledAt: opts.scheduledAt, scheduledById: opts.scheduledAt ? ctx.actor.id : null }
        : {}),
    },
  });
  if (updated.count === 0) throw new ValidationError('O post mudou enquanto você aprovava — recarregue a página.');
  const row = await loadRow(id);
  await events.emit({
    type: 'social.approved',
    source: events.sourceOf(ctx),
    actorId: ctx.actor.id,
    payload: {
      postId: id,
      provider: row.socialAccount.provider,
      accountId: row.socialAccountId,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      campaignKey: row.campaignKey,
    },
  });
  if (post!.reviewState === 'pending' && post!.submittedById && post!.submittedById !== ctx.actor.id) {
    await notifications.createNotification(post!.submittedById, {
      type: 'social_review',
      title: `Post aprovado: ${row.socialAccount.displayName}`,
      body: row.scheduledAt
        ? `Vai ao ar em ${row.scheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
        : 'Vai ao ar agora.',
      url: `/social?post=${id}`,
    });
  }
  return (await hydrate([row]))[0]!;
}

/**
 * Quem só pode criar rascunhos envia para aprovação: o post fica "pendente"
 * e quem pode publicar na conta recebe uma notificação. Continua DRAFT —
 * enviar não é aprovar.
 */
export async function submitSocialPost(id: string, ctx: Ctx): Promise<SocialPostDto> {
  const [post] = await hydrate([await loadRow(id)]);
  await assertAccess(ctx, post!.socialAccountId, 'DRAFT');
  if (post!.status !== SocialPostStatus.DRAFT) throw new ValidationError('Só um rascunho pode ser enviado para aprovação.');
  if (post!.isIdea) throw new ValidationError('Isto ainda é uma ideia — passe para rascunho antes de enviar.');
  if (Object.keys(post!.issues.errors).length)
    throw new ValidationError('Corrija os campos indicados antes de enviar.', { ...post!.issues.errors });
  const row = await prisma.socialPost.update({
    where: { id },
    data: { reviewState: 'pending', submittedById: ctx.actor.id, submittedAt: new Date(), reviewComment: null },
    include: POST_INCLUDE,
  });
  const who = ctx.actor.name ?? ctx.actor.email;
  for (const userId of await publisherIds(row.socialAccountId)) {
    if (userId === ctx.actor.id) continue;
    await notifications.createNotification(userId, {
      type: 'social_review',
      title: `Post para aprovar: ${row.socialAccount.displayName}`,
      body: `${who} enviou um post para aprovação.`,
      url: `/social?post=${id}`,
    });
  }
  return (await hydrate([row]))[0]!;
}

/** Devolve um rascunho com comentário (quem pode publicar). O autor é notificado. */
export async function returnSocialPost(id: string, comment: string, ctx: Ctx): Promise<SocialPostDto> {
  const current = await loadRow(id);
  await assertAccess(ctx, current.socialAccountId, 'PUBLISH');
  const text = comment.trim();
  if (!text) throw new ValidationError('Corrija os campos indicados.', { reviewComment: 'Escreva o que precisa mudar.' });
  if (text.length > 1000) throw new ValidationError('Corrija os campos indicados.', { reviewComment: 'No máximo 1000 caracteres.' });
  if (current.status !== SocialPostStatus.DRAFT) throw new ValidationError('Só um rascunho pode ser devolvido.');
  const row = await prisma.socialPost.update({
    where: { id },
    data: { reviewState: 'returned', reviewComment: text, reviewedById: ctx.actor.id, reviewedAt: new Date() },
    include: POST_INCLUDE,
  });
  const author = current.submittedById ?? current.createdById;
  if (author !== ctx.actor.id) {
    await notifications.createNotification(author, {
      type: 'social_review',
      title: `Post devolvido: ${row.socialAccount.displayName}`,
      body: text.slice(0, 200),
      url: `/social?post=${id}`,
    });
  }
  return (await hydrate([row]))[0]!;
}

export async function archiveSocialPost(id: string, ctx: Ctx): Promise<SocialPostDto> {
  const current = await loadRow(id);
  await assertAccess(ctx, current.socialAccountId, minFor(current.status));
  const blocked = canArchive(current.status);
  if (blocked) throw new ValidationError(blocked);
  const row = await prisma.socialPost.update({
    where: { id },
    data: { status: SocialPostStatus.ARCHIVED },
    include: POST_INCLUDE,
  });
  return (await hydrate([row]))[0]!;
}

/** FAILED → APPROVED (mantém a aprovação humana original e o providerState para não duplicar). */
export async function retrySocialPost(id: string, ctx: Ctx): Promise<SocialPostDto> {
  const current = await loadRow(id);
  await assertAccess(ctx, current.socialAccountId, 'PUBLISH');
  const blocked = canRetry(current.status);
  if (blocked) throw new ValidationError(blocked);
  const updated = await prisma.socialPost.updateMany({
    where: { id, status: SocialPostStatus.FAILED },
    data: { status: SocialPostStatus.APPROVED, lastError: null },
  });
  if (updated.count === 0) throw new ValidationError('O post mudou — recarregue a página.');
  return getSocialPost(id);
}

/**
 * Tudo o que a tela /social mostra de uma vez (calendário e lista filtram no
 * navegador): os posts vivos e, dos arquivados e publicados, os mais recentes.
 * Sem o teto de 100 do `listParamsSchema` — o volume é de dezenas por mês.
 */
export async function listSocialPostsForWorkspace(
  ctx: Ctx,
  opts: { max?: number; accountIds?: string[] } = {},
): Promise<SocialPostDto[]> {
  const visible = await accountIdsWith(ctx, 'VIEW');
  const ids = opts.accountIds ? opts.accountIds.filter((id) => visible.includes(id)) : visible;
  const rows = await prisma.socialPost.findMany({
    where: { socialAccountId: { in: ids } },
    include: POST_INCLUDE,
    orderBy: [{ updatedAt: 'desc' }],
    take: opts.max ?? 600,
  });
  return hydrate(rows);
}

/** Temas já usados, do mais frequente para o menos — alimenta o seletor de tema. */
export async function listSocialTopics(): Promise<string[]> {
  const groups = await prisma.socialPost.groupBy({
    by: ['topic'],
    where: { topic: { not: null } },
    _count: { _all: true },
  });
  return groups
    .filter((g) => g.topic)
    .sort((a, b) => b._count._all - a._count._all || a.topic!.localeCompare(b.topic!))
    .map((g) => g.topic!);
}

/**
 * Cópia como RASCUNHO sem horário (nunca herda aprovação nem agendamento).
 * Com `socialAccountId` de outra conta é "adaptar para a outra rede": as duas
 * versões ficam ligadas pela mesma `campaignKey` (criada agora se o original
 * não tinha — ligar não é mudança de conteúdo e não mexe no estado dele).
 */
export async function duplicateSocialPost(
  id: string,
  ctx: Ctx,
  opts: { socialAccountId?: string; campaignKey?: string | null } = {},
): Promise<SocialPostDto> {
  const source = await loadRow(id);
  const targetAccountId = opts.socialAccountId ?? source.socialAccountId;
  await assertAccess(ctx, source.socialAccountId, 'VIEW');
  await assertReferences({ socialAccountId: targetAccountId });
  await assertAccess(ctx, targetAccountId, 'DRAFT');
  const adapting = targetAccountId !== source.socialAccountId;
  // Adaptar = mais uma versão da MESMA publicação (mesma campanha). Duplicar =
  // publicação nova: campanha nova (a dada, para copiar várias versões juntas) ou nenhuma.
  let campaignKey: string | null = opts.campaignKey ?? null;
  if (adapting) {
    campaignKey = source.campaignKey;
    if (!campaignKey) {
      campaignKey = `camp-${source.id}`;
      await prisma.socialPost.update({ where: { id: source.id }, data: { campaignKey } });
    }
  }
  const row = await prisma.socialPost.create({
    data: {
      socialAccountId: targetAccountId,
      text: source.text,
      mediaAssetIds: source.mediaAssetIds,
      linkUrl: source.linkUrl,
      scheduledAt: null,
      sourceContentPostId: source.sourceContentPostId,
      campaignKey,
      topic: source.topic,
      isIdea: source.isIdea,
      utmAuto: source.utmAuto,
      // Adaptar para outra rede: o formato do Instagram não passa para o LinkedIn.
      placement: adapting ? 'feed' : source.placement,
      status: SocialPostStatus.DRAFT,
      createdById: ctx.actor.id,
    },
    include: POST_INCLUDE,
  });
  return (await hydrate([row]))[0]!;
}

/** Tema em massa. Tema não é conteúdo: não desfaz aprovação nem mexe no horário. */
export async function setSocialPostsTopic(ids: string[], topic: string | null, ctx: Ctx): Promise<number> {
  const parsed = baseFields.topic.safeParse(topic);
  if (!parsed.success) throw new ValidationError('Tema inválido', parsed.error.flatten());
  if (ids.length === 0) return 0;
  const allowed = await accountIdsWith(ctx, 'DRAFT');
  const result = await prisma.socialPost.updateMany({
    where: { id: { in: ids }, socialAccountId: { in: allowed } },
    data: { topic: parsed.data || null },
  });
  return result.count;
}
