import { prisma, ActivityStatus, ActivityType, SequenceStatus } from '@app/db';

// "O que vai acontecer" — leitura para a agenda (pedido de produto, 15/10/2026:
// como dono, ver na agenda tudo o que está programado na empresa, mesmo o que
// não está ligado a ele). Só leitura, sem regra nova: cada fonte lê o que o
// seu motor já vai executar (cron de agendados, motor de sequências,
// publicador de redes, publicação de artigos). Este arquivo tem o formato
// comum e as fontes do core (atividades, inscrições, WhatsApp); as de redes
// sociais e de conteúdo moram nos seus módulos e devolvem o mesmo formato.

export type ScheduledKind =
  | 'email'
  | 'prospecting'
  | 'sequence'
  | 'task'
  | 'call'
  | 'whatsapp'
  | 'social'
  | 'content';

export interface ScheduledItem {
  /** Único entre fontes (`<fonte>:<id>`). */
  id: string;
  kind: ScheduledKind;
  /** Quando vai acontecer (ISO). Nulo = à espera de uma pessoa, sem hora (aprovação). */
  at: string | null;
  title: string;
  /** Para quem / onde (contato, rede, conta). */
  detail: string | null;
  /** De quem é (autor, responsável ou quem agendou). */
  who: string | null;
  href: string;
  /** Só sai depois de alguém aprovar (post em rascunho, mensagem do Claude). */
  needsApproval: boolean;
}

export interface ScheduleQuery {
  from: Date;
  to: Date;
  /** Só o que é desta pessoa; ausente = empresa inteira. */
  userId?: string;
}

const LIMIT = 500;

const nameOf = (u: { name: string | null; email: string } | null | undefined) => (u ? u.name ?? u.email : null);

function recordHref(a: { contactId: string | null; dealId: string | null; accountId: string | null }): string {
  if (a.dealId) return `/deals/${a.dealId}`;
  if (a.contactId) return `/contacts/${a.contactId}`;
  if (a.accountId) return `/accounts/${a.accountId}`;
  return '/today';
}

/**
 * E-mails programados (manuais, de sequência do motor antigo e de prospecção),
 * tarefas, ligações e mensagens de WhatsApp com data — tudo o que é uma
 * Activity PLANNED com `scheduledAt`.
 */
export async function listScheduledActivities(q: ScheduleQuery): Promise<ScheduledItem[]> {
  const rows = await prisma.activity.findMany({
    where: {
      status: ActivityStatus.PLANNED,
      type: { in: [ActivityType.EMAIL, ActivityType.TASK, ActivityType.CALL, ActivityType.WHATSAPP] },
      scheduledAt: { gte: q.from, lt: q.to },
      deletedAt: null,
      ...(q.userId ? { OR: [{ createdById: q.userId }, { assignedToId: q.userId }] } : {}),
    },
    select: {
      id: true,
      type: true,
      subject: true,
      scheduledAt: true,
      threadId: true,
      contactId: true,
      dealId: true,
      accountId: true,
      contact: { select: { fullName: true, email: true } },
      account: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { name: true, email: true } },
      sequence: { select: { prospecting: true } },
    },
    orderBy: { scheduledAt: 'asc' },
    take: LIMIT,
  });
  return rows.map((a) => {
    const kind: ScheduledKind =
      a.type === ActivityType.EMAIL
        ? a.sequence?.prospecting
          ? 'prospecting'
          : 'email'
        : a.type === ActivityType.TASK
          ? 'task'
          : a.type === ActivityType.CALL
            ? 'call'
            : 'whatsapp';
    const isEmail = a.type === ActivityType.EMAIL;
    return {
      id: `activity:${a.id}`,
      kind,
      at: a.scheduledAt!.toISOString(),
      title: a.subject?.trim() || DEFAULT_TITLE[kind],
      detail: a.contact?.fullName ?? a.contact?.email ?? a.account?.name ?? null,
      who: nameOf(isEmail ? a.createdBy : a.assignedTo ?? a.createdBy),
      href: isEmail ? `/email/${encodeURIComponent(a.threadId ?? a.id)}?pasta=programados` : recordHref(a),
      needsApproval: false,
    };
  });
}

const DEFAULT_TITLE: Record<ScheduledKind, string> = {
  email: 'E-mail programado',
  prospecting: 'E-mail de prospecção',
  sequence: 'Passo de sequência',
  task: 'Tarefa',
  call: 'Ligação',
  whatsapp: 'Mensagem de WhatsApp',
  social: 'Post em rede social',
  content: 'Publicação no blog',
};

const STEP_LABEL: Record<string, string> = {
  EMAIL_AUTO: 'E-mail automático',
  EMAIL_MANUAL: 'E-mail manual',
  CALL: 'Ligação',
  LINKEDIN: 'LinkedIn',
  TASK: 'Tarefa',
};

/**
 * Próximo passo de cada inscrição do motor novo (o motor só cria o e-mail na
 * hora de executar, então ele ainda não é uma Activity). Inscrições do motor
 * antigo já aparecem como e-mails programados.
 */
export async function listScheduledSequenceSteps(q: ScheduleQuery): Promise<ScheduledItem[]> {
  const rows = await prisma.sequence.findMany({
    where: {
      status: SequenceStatus.ACTIVE,
      engineVersion: 2,
      nextRunAt: { gte: q.from, lt: q.to },
      ...(q.userId ? { createdById: q.userId } : {}),
    },
    select: {
      id: true,
      prospecting: true,
      currentStepOrder: true,
      nextRunAt: true,
      contactId: true,
      cadenceId: true,
      cadence: { select: { name: true } },
      contact: { select: { fullName: true, email: true } },
      createdBy: { select: { name: true, email: true } },
      steps: { select: { order: true, title: true, subject: true, kind: true, channel: true } },
    },
    orderBy: { nextRunAt: 'asc' },
    take: LIMIT,
  });
  return rows.map((s) => {
    const step = s.steps.find((st) => st.order === s.currentStepOrder);
    const stepKind = step?.kind ?? (step?.channel === 'EMAIL' ? 'EMAIL_AUTO' : step?.channel ?? 'EMAIL_AUTO');
    const isEmail = stepKind.startsWith('EMAIL');
    const kind: ScheduledKind = isEmail ? (s.prospecting ? 'prospecting' : 'sequence') : stepKind === 'CALL' ? 'call' : 'task';
    const label = STEP_LABEL[stepKind] ?? 'Passo';
    return {
      id: `sequence:${s.id}`,
      kind,
      at: s.nextRunAt!.toISOString(),
      title: (isEmail ? step?.subject : null)?.trim() || step?.title?.trim() || label,
      detail: [s.contact.fullName ?? s.contact.email, s.cadence?.name ?? 'Sequência avulsa'].filter(Boolean).join(' · '),
      who: nameOf(s.createdBy),
      href: s.cadenceId ? `/sequences/${s.cadenceId}` : `/contacts/${s.contactId}`,
      needsApproval: false,
    };
  });
}

/**
 * Mensagens de WhatsApp que o Claude escreveu e esperam aprovação. Lidas
 * só se o modelo existir: o módulo de WhatsApp ainda não está em todo deploy,
 * e esta leitura não pode depender dele (sem o modelo, devolve vazio).
 */
export async function listPendingWhatsApp(q: Pick<ScheduleQuery, 'userId'>): Promise<ScheduledItem[]> {
  if (q.userId) return []; // a conversa é da empresa, não de uma pessoa: só na visão da empresa
  const delegate = (prisma as unknown as Record<string, unknown>).whatsAppMessage as
    | { findMany(args: unknown): Promise<PendingWhatsAppRow[]> }
    | undefined;
  if (!delegate) return [];
  try {
    const rows = await delegate.findMany({
      where: { status: 'PENDING_APPROVAL' },
      select: {
        id: true,
        body: true,
        conversationId: true,
        conversation: { select: { profileName: true, waId: true, contact: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return rows.map((m) => ({
      id: `whatsapp:${m.id}`,
      kind: 'whatsapp',
      at: null,
      title: m.body.length > 80 ? `${m.body.slice(0, 77)}...` : m.body || DEFAULT_TITLE.whatsapp,
      detail: m.conversation.contact?.fullName ?? m.conversation.profileName ?? `+${m.conversation.waId}`,
      who: 'Claude',
      href: `/whatsapp?c=${encodeURIComponent(m.conversationId)}`,
      needsApproval: true,
    }));
  } catch (err) {
    console.error('[schedule] WhatsApp pendente indisponível:', err);
    return [];
  }
}

interface PendingWhatsAppRow {
  id: string;
  body: string;
  conversationId: string;
  conversation: { profileName: string | null; waId: string; contact: { fullName: string | null } | null };
}

/** Ordem de exibição: por horário; os sem horário (aprovação) por último. */
export function sortScheduled(items: ScheduledItem[]): ScheduledItem[] {
  return [...items].sort((a, b) => (a.at ?? '9999').localeCompare(b.at ?? '9999'));
}
