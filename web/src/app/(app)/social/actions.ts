'use server';

import { revalidatePath } from 'next/cache';
import { ValidationError } from '@app/core';
import {
  FORMAT_LABEL,
  PROVIDER_LABEL,
  collectSocialMetrics,
  publishSocialPost,
  socialAccounts,
  socialAccess,
  socialMetrics,
  socialPosts,
} from '@app/social';
import type { SocialPlacement } from '@app/social/rules';
import { assets } from '@app/content';
import { requireCtx } from '@/lib/session';
import { toActionResult, type ActionResult } from '@/lib/action-result';

// Adaptadores finos sobre @app/social. Aprovar existe SÓ aqui (sessão de um
// humano logado) — não há rota de API nem tool MCP que aprove.

/**
 * O serviço lança ValidationError com `{ campo: mensagem }` (mesmo formato de
 * `publishPost`); a tela espera `fieldErrors: { campo: [mensagem] }`.
 */
function toResult(err: unknown): ActionResult<never> {
  if (err instanceof ValidationError && err.issues && typeof err.issues === 'object' && !('fieldErrors' in err.issues)) {
    const fieldErrors = Object.fromEntries(
      Object.entries(err.issues as Record<string, unknown>).map(([k, v]) => [k, [String(v)]]),
    );
    return { ok: false, error: err.message, fieldErrors };
  }
  return toActionResult(err);
}

function refresh(id?: string) {
  revalidatePath('/social');
  if (id) revalidatePath(`/social/${id}`);
}


function parseDate(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

/**
 * Aprova (e, sem horário futuro, já tenta publicar — "publicar assim que
 * aprovado"; com SOCIAL_PUBLISH=log é simulação). Falha de publicação não
 * desfaz a aprovação: o post fica "Com erro" com a mensagem.
 */
export async function approveSocialPostAction(
  id: string,
  scheduledAt?: string | null,
): Promise<ActionResult<{ published: boolean; error?: string; processing?: string }>> {
  try {
    const ctx = await requireCtx();
    const post = await socialPosts.approveSocialPost(id, ctx, scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {});
    let published = false;
    let error: string | undefined;
    let processing: string | undefined;
    if (!post.scheduledAt || post.scheduledAt.getTime() <= Date.now()) {
      const outcome = await publishSocialPost(id, { ctx });
      published = outcome.outcome === 'published';
      if (outcome.outcome === 'failed') error = outcome.error;
      if (outcome.outcome === 'processing') processing = outcome.message;
    }
    refresh(id);
    return { ok: true, data: { published, error, processing } };
  } catch (err) {
    return toResult(err);
  }
}

export async function archiveSocialPostAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    await socialPosts.archiveSocialPost(id, ctx);
    refresh(id);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function retrySocialPostAction(id: string): Promise<ActionResult<{ published: boolean; error?: string; processing?: string }>> {
  try {
    const ctx = await requireCtx();
    const post = await socialPosts.retrySocialPost(id, ctx);
    let published = false;
    let error: string | undefined;
    let processing: string | undefined;
    if (!post.scheduledAt || post.scheduledAt.getTime() <= Date.now()) {
      const outcome = await publishSocialPost(id, { ctx });
      published = outcome.outcome === 'published';
      if (outcome.outcome === 'failed') error = outcome.error;
      if (outcome.outcome === 'processing') processing = outcome.message;
    }
    refresh(id);
    return { ok: true, data: { published, error, processing } };
  } catch (err) {
    return toResult(err);
  }
}

export async function disconnectSocialAccountAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    await socialAccounts.disconnectSocialAccount(id, ctx);
    revalidatePath('/settings/social');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/** Dados de validação dos arquivos escolhidos (tipo, bytes, duração do vídeo) — o MediaPicker só traz url/tamanho/alt. */
export async function getSocialMediaInfoAction(ids: string[]) {
  await requireCtx();
  if (ids.length === 0) return [];
  const rows = await assets.getAssetsByIds(ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(({ id, url, width, height, alt, bytes, mimeType, durationMs }) => ({ id, url, width, height, alt, bytes, mimeType, durationMs }));
}

export interface SocialVariantData {
  /** Versão já guardada (editar) ou nenhuma (nova versão desta rede). */
  id: string | null;
  socialAccountId: string;
  text: string;
  mediaAssetIds: string[];
  linkUrl: string | null;
  scheduledAt: string | null; // ISO
  /** Instagram: feed, reel ou story. */
  placement: SocialPlacement;
}

/**
 * Guarda uma publicação com uma versão por rede (cada uma com o seu texto,
 * imagens, link e horário; tema, artigo e UTM são comuns). As versões novas
 * entram na mesma campanha das existentes; as que não mudaram não são
 * tocadas (não desfaz aprovação à toa). Pára no primeiro erro e diz em que
 * rede foi — o que já foi gravado fica.
 */
export async function saveSocialPostGroupAction(
  variants: SocialVariantData[],
  shared: { topic: string | null; sourceContentPostId: string | null; utmAuto: boolean; isIdea: boolean; campaignKey: string | null },
  changed: string[],
): Promise<ActionResult<{ ids: string[]; statuses: Record<string, string> }>> {
  const ids: string[] = [];
  const statuses: Record<string, string> = {};
  try {
    const ctx = await requireCtx();
    if (variants.length === 0) return { ok: false, error: 'Escolha pelo menos uma rede.', fieldErrors: { socialAccountId: ['Escolha onde publicar.'] } };
    // Posts independentes: nada de campanha automática a ligá-los (mantém a que o post já tinha).
    const campaignKey = shared.campaignKey;
    for (const v of variants) {
      const data = {
        text: v.text,
        mediaAssetIds: v.mediaAssetIds,
        linkUrl: v.linkUrl,
        placement: v.placement,
        scheduledAt: parseDate(v.scheduledAt),
        sourceContentPostId: shared.sourceContentPostId,
        topic: shared.topic,
        isIdea: shared.isIdea,
        utmAuto: shared.utmAuto,
        campaignKey,
      };
      try {
        if (v.id) {
          if (!changed.includes(v.id)) {
            ids.push(v.id);
            continue;
          }
          const post = await socialPosts.updateSocialPost(v.id, { ...data, socialAccountId: v.socialAccountId }, ctx);
          statuses[v.id] = post.status;
          ids.push(v.id);
        } else {
          const post = await socialPosts.createSocialPost({ ...data, socialAccountId: v.socialAccountId }, ctx);
          ids.push(post.id);
        }
      } catch (err) {
        const res = toResult(err);
        const account = await socialAccounts.getSocialAccount(v.socialAccountId).catch(() => null);
        return { ...res, error: `${account ? `${PROVIDER_LABEL[account.provider]}: ` : ''}${res.ok ? '' : res.error}` } as ActionResult<never>;
      }
    }
    refresh();
    return { ok: true, data: { ids, statuses } };
  } catch (err) {
    if (ids.length) refresh();
    return toResult(err);
  }
}

/** Duplicar (mesma conta) ou adaptar para outra rede (`socialAccountId` de outra conta). Nasce rascunho sem horário. */
export async function duplicateSocialPostAction(
  id: string,
  socialAccountId?: string,
  campaignKey?: string | null,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireCtx();
    const post = await socialPosts.duplicateSocialPost(id, ctx, { socialAccountId, campaignKey });
    refresh();
    return { ok: true, data: { id: post.id } };
  } catch (err) {
    return toResult(err);
  }
}

/** Arrastar no calendário: muda só o horário (não desfaz a aprovação). */
export async function rescheduleSocialPostAction(id: string, scheduledAt: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    await socialPosts.scheduleSocialPost(id, new Date(scheduledAt), ctx);
    refresh(id);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function unscheduleSocialPostAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    await socialPosts.unscheduleSocialPost(id, ctx);
    refresh(id);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function archiveSocialPostsAction(ids: string[]): Promise<ActionResult<{ done: number; failed: number }>> {
  try {
    const ctx = await requireCtx();
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await socialPosts.archiveSocialPost(id, ctx);
        done++;
      } catch {
        failed++;
      }
    }
    refresh();
    return { ok: true, data: { done, failed } };
  } catch (err) {
    return toResult(err);
  }
}

export async function setSocialPostsTopicAction(ids: string[], topic: string | null): Promise<ActionResult<{ done: number }>> {
  try {
    const ctx = await requireCtx();
    const done = await socialPosts.setSocialPostsTopic(ids, topic, ctx);
    refresh();
    return { ok: true, data: { done } };
  } catch (err) {
    return toResult(err);
  }
}

/** "Atualizar métricas" do painel: recolhe já, ignorando a cadência. Só lê das redes. */
export async function refreshSocialMetricsAction(): Promise<
  ActionResult<{ collected: number; accounts: number; failed: number; rateLimited: string[]; firstError: string | null }>
> {
  try {
    await requireCtx();
    const result = await collectSocialMetrics({ force: true, max: 15 });
    revalidatePath('/social/desempenho');
    revalidatePath('/social');
    return {
      ok: true,
      data: {
        collected: result.collected,
        accounts: result.accounts,
        failed: result.failed,
        rateLimited: result.rateLimited,
        firstError: result.errors[0]?.error ?? null,
      },
    };
  } catch (err) {
    return toResult(err);
  }
}

export async function getPostPerformanceAction(id: string) {
  const ctx = await requireCtx();
  return socialMetrics.getSocialPostPerformance(id, await socialAccess.metricsAccountIds(ctx));
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV da tabela do painel, com os mesmos filtros. Separador ";" (Excel em pt-BR). */
export async function exportSocialReportCsvAction(filters: socialMetrics.ReportFilters): Promise<string> {
  const ctx = await requireCtx();
  const report = await socialMetrics.getSocialReport({ ...filters, accountIds: await socialAccess.metricsAccountIds(ctx) });
  const header = [
    'Publicado em', 'Rede', 'Conta', 'Formato', 'Tema', 'Texto', 'Impressões', 'Alcance', 'Reações', 'Comentários',
    'Partilhas', 'Guardados', 'Cliques', 'Visualizações de vídeo', 'Interações', 'Taxa de engagement (%)',
    'Visitas ao site', 'Contatos', 'Reuniões', 'Link',
  ];
  const rows = report.posts.map((p) => [
    new Date(p.publishedAt).toLocaleString('pt-BR', { timeZone: report.timezone }),
    PROVIDER_LABEL[p.provider], p.accountName, FORMAT_LABEL[p.format], p.topic, p.text.replace(/\s+/g, ' ').slice(0, 300),
    p.metrics?.impressions, p.metrics?.reach, p.metrics?.reactions, p.metrics?.comments, p.metrics?.shares,
    p.metrics?.saves, p.metrics?.clicks, p.metrics?.videoViews, p.interactions,
    p.rate === null ? null : p.rate.toFixed(2).replace('.', ','), p.visits, p.leads, p.meetings, p.externalUrl,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\n');
}


/** Quem só pode criar rascunhos envia para aprovação (notifica quem pode publicar). */
export async function submitSocialPostAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    await socialPosts.submitSocialPost(id, ctx);
    refresh(id);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/** Devolve com comentário (quem pode publicar). O autor é notificado. */
export async function returnSocialPostAction(id: string, comment: string): Promise<ActionResult> {
  try {
    const ctx = await requireCtx();
    await socialPosts.returnSocialPost(id, comment, ctx);
    refresh(id);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
