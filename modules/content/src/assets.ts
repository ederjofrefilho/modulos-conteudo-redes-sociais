import { prisma, type Prisma } from '@app/db';
import { z } from 'zod';
import { NotFoundError, ValidationError, listParamsSchema, type ListParamsInput, type Paginated } from '@app/core';
import type { Ctx } from '@app/core';
import { contentBlocksSchema, imageAssetIdsIn } from './blocks.js';
import { ASSET_MIME_TYPES, MAX_VIDEO_BYTES, isVideoMime } from './media-kinds.js';

// Registra um ContentAsset já existente (upload feito por fora — Blob no
// editor, Fase B, ou uma URL externa que o Claude decide referenciar via
// MCP). Esta função nunca envia bytes: o protocolo MCP não é lugar para
// binário, e o upload real do editor chama isto só DEPOIS do arquivo já
// estar no Blob.
export const contentAssetCreateSchema = z.object({
  url: z.string().trim().url('URL inválida'),
  pathname: z.string().trim().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  // Obrigatório desde o registro — é requisito de publicação (publishPost),
  // e pedir depois de publicado significa nunca pedir.
  alt: z.string().trim().min(1, 'Texto alternativo (alt) é obrigatório'),
  bytes: z.number().int().positive(),
  mimeType: z
    .string()
    .trim()
    .refine((v) => (ASSET_MIME_TYPES as readonly string[]).includes(v), {
      message: 'Formato não aceito: envie JPG, PNG, WebP, GIF ou vídeo MP4.',
    }),
  // Só vídeo: medida no navegador antes do envio.
  durationMs: z.number().int().positive().nullable().optional(),
}).superRefine((v, c) => {
  if (!isVideoMime(v.mimeType)) return;
  if (!v.durationMs) c.addIssue({ code: 'custom', path: ['durationMs'], message: 'Não foi possível ler a duração do vídeo.' });
  if (v.bytes > MAX_VIDEO_BYTES)
    c.addIssue({ code: 'custom', path: ['bytes'], message: `Vídeo passa de ${MAX_VIDEO_BYTES / (1024 * 1024)} MB.` });
});
export type ContentAssetCreate = z.infer<typeof contentAssetCreateSchema>;

/**
 * `kind` filtra imagem ou vídeo; sem ele vem tudo. O blog e os modelos de
 * imagem pedem só `image` (vídeo nunca vira capa nem bloco do post).
 */
export async function listContentAssets(
  params: ListParamsInput & { kind?: 'image' | 'video' } = {},
): Promise<Paginated<any>> {
  const { q, skip, take } = listParamsSchema.parse(params);
  const where: Prisma.ContentAssetWhereInput = {
    ...(q ? { OR: [{ alt: { contains: q, mode: 'insensitive' } }, { pathname: { contains: q, mode: 'insensitive' } }] } : {}),
    ...(params.kind === 'video'
      ? { mimeType: { startsWith: 'video/' } }
      : params.kind === 'image'
        ? { mimeType: { startsWith: 'image/' } }
        : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contentAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.contentAsset.count({ where }),
  ]);
  return { items, total, skip, take };
}

/** Total de arquivos e de bytes da biblioteca. */
export async function contentStorage(): Promise<{ files: number; bytes: number }> {
  const agg = await prisma.contentAsset.aggregate({ _count: { _all: true }, _sum: { bytes: true } });
  return { files: agg._count._all, bytes: agg._sum.bytes ?? 0 };
}

export async function createContentAsset(input: ContentAssetCreate, ctx: Ctx) {
  const parsed = contentAssetCreateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());
  return prisma.contentAsset.create({ data: { ...parsed.data, uploadedById: ctx.actor.id } });
}

/**
 * Busca vários assets pelo id de uma vez — usado pelo editor (Fase B) pra
 * montar a miniatura de cada bloco `image` já ao abrir um post existente
 * (o bloco só guarda `assetId`, não url/width/height/alt).
 */
export async function getAssetsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.contentAsset.findMany({ where: { id: { in: ids } } });
}

export const contentAssetUpdateSchema = z.object({
  alt: z.string().trim().min(1, 'Texto alternativo (alt) é obrigatório'),
});
export type ContentAssetUpdate = z.infer<typeof contentAssetUpdateSchema>;

/**
 * Corrige o alt de uma imagem depois do upload — antes do redesign do módulo
 * de conteúdo, um alt digitado errado só se corrigia reenviando o arquivo
 * (o `MediaPicker` exigia alt ANTES de abrir o seletor, mas nunca deixava
 * editar depois). Não recebe `ctx`: alt não tem dono, é metadado do arquivo.
 */
export async function updateContentAsset(id: string, input: ContentAssetUpdate) {
  const parsed = contentAssetUpdateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());

  const exists = await prisma.contentAsset.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError('Imagem', id);

  return prisma.contentAsset.update({ where: { id }, data: { alt: parsed.data.alt } });
}

/**
 * Exclui um asset — recusa se ele for capa de algum post ou aparecer em
 * qualquer bloco (`image`/`gallery`, em qualquer profundidade). `blocks` é
 * `Json`, não dá pra filtrar essa referência no banco, então varre em
 * memória — aceitável na escala de um blog (dezenas/centenas de posts, não
 * milhões), não vale um índice dedicado pra isso agora.
 */
export async function deleteContentAsset(id: string) {
  const exists = await prisma.contentAsset.findUnique({ where: { id }, select: { id: true, url: true, pathname: true } });
  if (!exists) throw new NotFoundError('Arquivo', id);

  // Post de rede social ainda por sair (rascunho, aprovado, com erro, a publicar) precisa do arquivo
  // para publicar. Publicado ou arquivado não: a rede já tem a cópia dela.
  const socialUse = await prisma.socialPost.count({
    where: { mediaAssetIds: { has: id }, status: { in: ['DRAFT', 'APPROVED', 'FAILED', 'PUBLISHING'] } },
  });
  if (socialUse > 0) {
    throw new ValidationError(
      `Este arquivo está em ${socialUse} post(s) de rede social ainda por publicar — tire-o de lá (ou arquive o post) antes de excluir.`,
    );
  }

  const coverUse = await prisma.contentPost.count({ where: { coverAssetId: id } });
  if (coverUse > 0) {
    throw new ValidationError('Esta imagem é capa de pelo menos um post — troque a capa antes de excluir.');
  }

  const posts = await prisma.contentPost.findMany({ select: { blocks: true } });
  const inUse = posts.some((post) => {
    const parsed = contentBlocksSchema.safeParse(post.blocks);
    return parsed.success && imageAssetIdsIn(parsed.data).includes(id);
  });
  if (inUse) {
    throw new ValidationError('Esta imagem está em uso no corpo de pelo menos um post — remova-a de lá antes de excluir.');
  }

  await prisma.contentAsset.delete({ where: { id } });
  // Quem chama apaga o arquivo do Blob com estes dados (o módulo não fala com o Blob).
  return { id, deleted: true, url: exists.url, pathname: exists.pathname };
}
