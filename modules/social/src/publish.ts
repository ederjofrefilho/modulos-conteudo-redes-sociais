import { prisma, SocialPostStatus, type Prisma } from '@app/db';
import { events, type Ctx } from '@app/core';
import { decryptAccessToken } from './accounts.js';
import { PROVIDER_LABEL, hasErrors, isPlacement, validateSocialDraft } from './rules.js';
import { PUBLISHING_STALE_MS } from './status.js';
import { getProvider, publishMode, type PublishMode } from './providers/index.js';
import { publishSimulated } from './providers/simulated.js';
import { withUtm } from './utm.js';
import { SocialPublishError, type PublishInput, type PublishMedia, type PublishResult } from './providers/types.js';

/**
 * Quantas tentativas um post pode passar "ainda processando" antes de virar
 * FAILED. Com o cron a cada ~5 a 15 min, dá de uma a três horas: muito mais
 * do que um vídeo de anúncio leva.
 */
export const MAX_PROCESSING_ATTEMPTS = 12;

export type PublishOutcome =
  | { postId: string; outcome: 'published'; externalUrl: string | null; simulated: boolean }
  | { postId: string; outcome: 'failed'; error: string }
  | { postId: string; outcome: 'processing'; message: string }
  | { postId: string; outcome: 'skipped'; reason: string };

/**
 * Reserva o post para publicar: APPROVED → PUBLISHING por `updateMany`
 * condicional (mesmo padrão do `syncLockedUntil` das caixas). Só uma chamada
 * ganha — cron e botão nunca publicam o mesmo post duas vezes. Post com
 * `externalId` (já foi ao ar) nunca é reservado.
 */
export async function claimForPublishing(id: string, now = new Date()): Promise<boolean> {
  const result = await prisma.socialPost.updateMany({
    where: {
      id,
      status: SocialPostStatus.APPROVED,
      externalId: null,
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
    },
    data: { status: SocialPostStatus.PUBLISHING, attempts: { increment: 1 }, lastError: null },
  });
  return result.count === 1;
}

/**
 * Publica um post aprovado e vencido. Sem `ctx` = publicador automático
 * (cron), origem "cron". Nunca lança: o resultado diz o que aconteceu, e uma
 * falha vira status FAILED com mensagem legível + evento `social.failed`.
 */
export async function publishSocialPost(
  id: string,
  opts: { ctx?: Ctx; mode?: PublishMode; now?: Date } = {},
): Promise<PublishOutcome> {
  const now = opts.now ?? new Date();
  if (!(await claimForPublishing(id, now))) {
    return { postId: id, outcome: 'skipped', reason: 'Não está aprovado e vencido (ou outro processo já está publicando).' };
  }
  const source = opts.ctx ? events.sourceOf(opts.ctx) : 'cron';
  const actorId = opts.ctx?.actor.id ?? null;

  const post = await prisma.socialPost.findUniqueOrThrow({
    where: { id },
    include: {
      socialAccount: true,
      sourceContentPost: { select: { title: true, seoTitle: true, seoDescription: true, coverAsset: true } },
    },
  });
  const account = post.socialAccount;
  const basePayload = { postId: id, provider: account.provider, accountId: account.id, campaignKey: post.campaignKey };

  const fail = async (err: unknown): Promise<PublishOutcome> => {
    // A rede ainda processa (vídeo): volta a APPROVED com o progresso guardado
    // e o próximo cron retoma, sem envio novo. Depois de muitas voltas, vira
    // falha de verdade para alguém olhar.
    if (err instanceof SocialPublishError && err.opts.retryLater && post.attempts < MAX_PROCESSING_ATTEMPTS) {
      await prisma.socialPost.update({
        where: { id },
        data: {
          status: SocialPostStatus.APPROVED,
          lastError: err.message,
          ...(err.opts.providerState ? { providerState: mergeState(post.providerState, err.opts.providerState) } : {}),
        },
      });
      return { postId: id, outcome: 'processing', message: err.message };
    }
    const message =
      err instanceof SocialPublishError
        ? err.message
        : `Erro inesperado ao publicar no ${PROVIDER_LABEL[account.provider]}.`;
    if (!(err instanceof SocialPublishError)) console.error(`[social] falha ao publicar ${id}:`, err);
    const state = err instanceof SocialPublishError ? err.opts.providerState : undefined;
    await prisma.socialPost.update({
      where: { id },
      data: {
        status: SocialPostStatus.FAILED,
        lastError: message,
        ...(state ? { providerState: mergeState(post.providerState, state) } : {}),
      },
    });
    if (err instanceof SocialPublishError && err.opts.deactivateAccount) {
      await prisma.socialAccount.update({ where: { id: account.id }, data: { isActive: false, lastError: message } });
    }
    await events.emit({ type: 'social.failed', source, actorId, payload: { ...basePayload, error: message, attempt: post.attempts } });
    return { postId: id, outcome: 'failed', error: message };
  };

  try {
    if (!account.isActive) {
      throw new SocialPublishError(
        `A conta ${PROVIDER_LABEL[account.provider]} "${account.displayName}" está desconectada — reconecte em /settings/social e tente de novo.`,
      );
    }
    // Revalida na hora de publicar: uma imagem pode ter sido apagada depois da aprovação.
    const assets = post.mediaAssetIds.length
      ? await prisma.contentAsset.findMany({ where: { id: { in: post.mediaAssetIds } } })
      : [];
    const byId = new Map(assets.map((a) => [a.id, a]));
    const media = post.mediaAssetIds.map((mid) => byId.get(mid)).filter((a): a is NonNullable<typeof a> => !!a);
    if (media.length < post.mediaAssetIds.length) throw new SocialPublishError('Um dos arquivos foi apagado da biblioteca depois da aprovação.');
    const placement = isPlacement(post.placement) ? post.placement : 'feed';
    const issues = validateSocialDraft({ provider: account.provider, text: post.text, media, linkUrl: post.linkUrl, placement });
    if (hasErrors(issues)) throw new SocialPublishError(Object.values(issues.errors)[0]!);

    const input: PublishInput = {
      postId: id,
      account: { id: account.id, provider: account.provider, kind: account.kind, externalId: account.externalId, accessToken: null },
      text: post.text,
      placement,
      media: media.map(toMedia),
      // UTM entra só aqui, na saída: o link guardado e a validação ficam como a pessoa escreveu.
      linkUrl:
        post.linkUrl && post.utmAuto
          ? withUtm(post.linkUrl, { provider: account.provider, postId: id, topic: post.topic, campaignKey: post.campaignKey })
          : post.linkUrl,
      linkPreview: post.linkUrl && post.sourceContentPost ? linkPreviewOf(post.sourceContentPost) : null,
      documentTitle: post.sourceContentPost?.title ?? null,
      providerState: (post.providerState as Record<string, unknown> | null) ?? null,
    };

    let result: PublishResult;
    if ((opts.mode ?? publishMode()) === 'log') {
      result = await publishSimulated(input);
    } else {
      const adapter = getProvider(account.provider);
      if (!adapter) {
        throw new SocialPublishError(
          `A publicação real no ${PROVIDER_LABEL[account.provider]} ainda não está disponível neste CRM (SOCIAL_PUBLISH=live sem adaptador).`,
        );
      }
      if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() <= now.getTime()) {
        throw new SocialPublishError(
          `O acesso ao ${PROVIDER_LABEL[account.provider]} expirou em ${account.tokenExpiresAt.toLocaleDateString('pt-BR')} — reconecte em /settings/social.`,
          { deactivateAccount: true },
        );
      }
      input.account.accessToken = decryptAccessToken(account);
      result = await adapter.publish(input);
    }

    await prisma.socialPost.update({
      where: { id },
      data: {
        status: SocialPostStatus.PUBLISHED,
        publishedAt: now,
        // Quem publicou: quem carregou no botão; no cron, quem aprovou.
        publishedById: actorId ?? post.approvedById ?? null,
        externalId: result.externalId,
        externalUrl: result.externalUrl,
        lastError: null,
        providerState: mergeState(post.providerState, { ...(result.providerState ?? {}), ...(result.simulated ? { simulated: true } : {}) }),
      },
    });
    await events.emit({
      type: 'social.published',
      source,
      actorId,
      payload: { ...basePayload, externalUrl: result.externalUrl, simulated: !!result.simulated },
    });
    return { postId: id, outcome: 'published', externalUrl: result.externalUrl, simulated: !!result.simulated };
  } catch (err) {
    return fail(err);
  }
}

type AssetRow = {
  id: string;
  url: string;
  width: number;
  height: number;
  mimeType: string;
  alt: string;
  bytes: number;
  durationMs: number | null;
};

function toMedia(m: AssetRow): PublishMedia {
  return {
    id: m.id,
    url: m.url,
    width: m.width,
    height: m.height,
    mimeType: m.mimeType,
    alt: m.alt,
    bytes: m.bytes,
    durationMs: m.durationMs,
  };
}

/** Prévia do link a partir do artigo de origem (título de SEO, descrição de SEO e capa). */
function linkPreviewOf(source: { title: string; seoTitle: string | null; seoDescription: string; coverAsset: AssetRow | null }) {
  return {
    title: source.seoTitle || source.title,
    description: source.seoDescription || null,
    thumbnail: source.coverAsset ? toMedia(source.coverAsset) : null,
  };
}

function mergeState(current: Prisma.JsonValue | null, patch: Record<string, unknown>): Prisma.InputJsonValue {
  const base = current && typeof current === 'object' && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

/**
 * Publicador automático (`/api/cron/publish-social`): primeiro solta locks
 * esquecidos (processo que morreu no meio vira FAILED — nunca republica
 * sozinho, porque pode ter ido ao ar), depois publica os vencidos EM SÉRIE.
 */
export async function publishDueSocialPosts({ max = 10, now = new Date(), mode }: { max?: number; now?: Date; mode?: PublishMode } = {}) {
  const stale = await prisma.socialPost.updateMany({
    where: { status: SocialPostStatus.PUBLISHING, updatedAt: { lt: new Date(now.getTime() - PUBLISHING_STALE_MS) } },
    data: {
      status: SocialPostStatus.FAILED,
      lastError: 'A publicação foi interrompida no meio. Confira na rede se o post saiu antes de tentar de novo.',
    },
  });

  const due = await prisma.socialPost.findMany({
    where: { status: SocialPostStatus.APPROVED, externalId: null, OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
    orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'first' } }, { approvedAt: 'asc' }],
    take: max,
    select: { id: true },
  });
  const results: PublishOutcome[] = [];
  for (const { id } of due) results.push(await publishSocialPost(id, { now, mode }));
  return {
    checked: due.length,
    published: results.filter((r) => r.outcome === 'published').length,
    failed: results.filter((r) => r.outcome === 'failed').length,
    processing: results.filter((r) => r.outcome === 'processing').length,
    staleReleased: stale.count,
    results,
  };
}
