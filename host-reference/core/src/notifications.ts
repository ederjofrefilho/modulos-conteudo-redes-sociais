import { prisma } from '@app/db';
import { NotFoundError } from './common.js';
import type { Ctx } from './actor.js';

/**
 * Notificação pessoal — quem RECEBE, diferente de `audit.ts` (log de quem
 * FEZ a ação). Sem canal de push de verdade (Vercel serverless não sustenta
 * conexão persistente): o cliente (`NotificationsCenter.tsx`) faz polling
 * periódico chamando `listNotifications`/`countUnread`.
 */
export type NotificationType =
  | 'email_inbound'
  | 'email_scheduled_sent'
  | 'email_send_failed'
  | 'deal_advanced'
  | 'deal_regressed'
  | 'deal_bulk_moved'
  // Fila do agente (prospecção, P3): algo para aprovar / algo para resolver.
  | 'agent_approval'
  | 'agent_review'
  // Plataforma de reuniões: marcação nova/alterada e convidado na sala de espera.
  | 'meeting_booked'
  | 'meeting_rescheduled'
  | 'meeting_cancelled'
  | 'meeting_lobby'
  // Sequências: passo à espera de uma pessoa (e-mail para rever, tarefa) / inscrição parada com erro.
  | 'sequence_step_due'
  | 'sequence_error'
  // Anúncios: lead de formulário importado / alerta (ritmo de gasto, CPA, reprovação, ligação).
  | 'ads_lead'
  | 'ads_alert'
  // Redes sociais: post enviado/aprovado/devolvido na revisão; acesso de uma conta a vencer.
  | 'social_review'
  | 'social_token_expiring'
  // WhatsApp: mensagem nova de cliente / resposta do Claude à espera de aprovação.
  | 'whatsapp_inbound'
  | 'whatsapp_approval';

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  url?: string;
}

/** Cria uma notificação pro usuário `userId` — nunca lança: uma falha aqui não pode derrubar o fluxo principal (envio de e-mail, mudança de estágio etc.) que a originou. */
export async function createNotification(userId: string, input: CreateNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, type: input.type, title: input.title, body: input.body, url: input.url },
    });
  } catch {
    // best-effort — notificação é conveniência, não deve quebrar a ação real.
  }
}

/** Lista as notificações do usuário logado, mais recentes primeiro. */
export async function listNotifications(
  ctx: Ctx,
  opts: { take?: number; unreadOnly?: boolean } = {},
) {
  return prisma.notification.findMany({
    where: { userId: ctx.actor.id, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 20,
  });
}

/** Contagem de não lidas do usuário logado — pro ponto do sino. */
export async function countUnread(ctx: Ctx): Promise<number> {
  return prisma.notification.count({ where: { userId: ctx.actor.id, readAt: null } });
}

/** Marca uma notificação como lida — só o dono pode marcar a própria. */
export async function markRead(id: string, ctx: Ctx): Promise<void> {
  const notification = await prisma.notification.findUnique({ where: { id }, select: { userId: true } });
  if (!notification || notification.userId !== ctx.actor.id) throw new NotFoundError('Notificação', id);
  await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
}

/** Marca todas as notificações não lidas do usuário logado como lidas. */
export async function markAllRead(ctx: Ctx): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId: ctx.actor.id, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
