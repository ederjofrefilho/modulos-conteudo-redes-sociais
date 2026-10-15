import { prisma, Prisma } from '@app/db';
import { z } from 'zod';
import { ValidationError } from './common.js';
import type { Ctx } from './actor.js';

// Registro de eventos — a linha do tempo única por pessoa/empresa que a IA lê
// (Fase 1 de docs/PLANO-REDESIGN-AUTONOMIA.md). Cada módulo grava aqui o FATO
// já consumado ("e-mail enviado", "etapa mudou"), depois da operação de
// verdade ter dado certo. Activity/AuditLog continuam sendo a fonte
// operacional; Event é a camada normalizada, append-only, por cima delas.
//
// Gravar evento NUNCA derruba a operação que o originou (ver `emit`): um
// e-mail enviado não pode virar erro na tela porque a linha do tempo falhou.

/**
 * Lista canônica. `Event.type` é String no banco (tipo novo não exige
 * migration), mas todo emissor do CRM usa um destes — é o vocabulário que a
 * tool MCP `query_events` documenta para o Claude.
 */
export const EVENT_TYPES = [
  // Contas e contatos criados (UI, API, MCP, importação)
  'account.created',
  'contact.created',
  // Negócios
  'deal.created',
  'deal.stage_changed',
  'deal.won',
  'deal.lost',
  // Atividades (por tipo — "o que aconteceu", não "uma linha foi inserida")
  'note.logged',
  'call.logged',
  'call.scheduled',
  'call.completed',
  'task.scheduled',
  'task.completed',
  'meeting.scheduled',
  'meeting.completed',
  // Agenda (modules/calendar): remarcação e cancelamento de um compromisso
  'meeting.rescheduled',
  'meeting.cancelled',
  // Salas de vídeo (modules/meetings): presença real na sala
  'meeting.started',
  'meeting.ended',
  'meeting.no_show',
  'dossier.created',
  // E-mail
  'email.sent',
  'email.received',
  // Envio que o servidor de e-mail recusou (a Activity fica FAILED)
  'email.failed',
  // Prospecção (P0): bounce recebido e pedido de descadastro
  'email.bounced',
  'contact.unsubscribed',
  // Prospecção (P1/P2): empresa da base CNPJ virou conta no CRM
  'lead.imported',
  // Prospecção (P4): resposta de lead classificada pelo Claude
  'reply.triaged',
  // Conteúdo
  'content.published',
  'content.unpublished',
  // Redes sociais (modules/social): aprovação humana, publicação e falha
  'social.approved',
  'social.published',
  'social.failed',
  'social.disconnected',
  // Anúncios (modules/ads): lead de formulário importado e alteração feita pelo CRM numa plataforma
  'ads.lead_received',
  'ads.changed',
  // WhatsApp (modules/whatsapp): mensagem do cliente e mensagem enviada (CRM, Claude ou app no celular)
  'whatsapp.received',
  'whatsapp.sent',
  // Site / atribuição
  'lead_intent.created',
  'visitor.identified',
  'site.page_view',
  'site.whatsapp_click',
  'site.form_submit',
  // Conversão do site registada (formulário, WhatsApp, agendamento) — conversions.ts
  'site.conversion',
  // Conversão enviada ao Google Ads (modules/ads, conversões)
  'ads.conversion_sent',
  // Toda chamada de tool MCP que escreve (apps/mcp/src/audit.ts): o que o
  // Claude ou uma rotina fez, com sucesso ou com erro. Complementa os eventos
  // de domínio acima, que continuam a ser gravados pelos serviços.
  'mcp.action',
  'mcp.failed',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Eventos que o site pode mandar por `collectSiteEvents` — o resto só nasce dentro do CRM. */
export const SITE_EVENT_TYPES = ['site.page_view', 'site.whatsapp_click', 'site.form_submit'] as const;

export interface EventInput {
  type: EventType;
  source?: string;
  occurredAt?: Date;
  accountId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  visitorId?: string | null;
  actorId?: string | null;
  payload?: Record<string, unknown>;
}

/** Origem padrão de um evento disparado por uma ação com Ctx (UI, API, MCP). */
export function sourceOf(ctx: Ctx | null | undefined): string {
  return ctx?.source ?? 'crm';
}

/** Monta o `data` do Prisma — puro, separado para teste. */
export function toEventRow(input: EventInput): Prisma.EventUncheckedCreateInput {
  return {
    type: input.type,
    source: input.source ?? 'crm',
    occurredAt: input.occurredAt ?? new Date(),
    accountId: input.accountId ?? null,
    contactId: input.contactId ?? null,
    dealId: input.dealId ?? null,
    visitorId: input.visitorId ?? null,
    actorId: input.actorId ?? null,
    payload: (input.payload ?? {}) as Prisma.InputJsonValue,
  };
}

/** Grava um evento e devolve a linha — lança se o banco recusar. Use `emit` nos serviços. */
export async function recordEvent(input: EventInput) {
  return prisma.event.create({ data: toEventRow(input) });
}

/**
 * Grava sem nunca lançar — é o que os serviços de negócio chamam depois da
 * operação principal. Falha vira log, não erro de tela.
 */
export async function emit(input: EventInput): Promise<void> {
  try {
    await recordEvent(input);
  } catch (err) {
    console.error(`[events] falha ao gravar "${input.type}":`, err);
  }
}

// ---------------------------------------------------------------------------
// Mapeamentos puros (testados em events.test.ts)
// ---------------------------------------------------------------------------

/**
 * Tipo do evento de uma atividade recém-criada, ou `null` quando criar a
 * linha não é um fato a registrar: rascunho de e-mail (o fato é o envio,
 * gravado por `sendEmailActivity`), e-mail de saída em geral pelo mesmo
 * motivo, e tipos legados (WHATSAPP).
 */
export function activityCreatedEventType(a: {
  type: string;
  direction: string;
  status: string;
}): EventType | null {
  const planned = a.status === 'PLANNED';
  switch (a.type) {
    case 'NOTE':
      return 'note.logged';
    case 'DOSSIER':
      return 'dossier.created';
    case 'CALL':
      return planned ? 'call.scheduled' : 'call.logged';
    case 'TASK':
      return planned ? 'task.scheduled' : 'task.completed';
    case 'MEETING':
      return planned ? 'meeting.scheduled' : 'meeting.completed';
    case 'EMAIL':
      // Resposta registrada à mão (logReply) — mesmo fato que a ingestão IMAP.
      return a.direction === 'INBOUND' && !planned ? 'email.received' : null;
    default:
      return null;
  }
}

/** Tipo do evento ao concluir uma atividade planejada, ou `null` se não houver um. */
export function activityCompletedEventType(type: string): EventType | null {
  switch (type) {
    case 'TASK':
      return 'task.completed';
    case 'MEETING':
      return 'meeting.completed';
    case 'CALL':
      return 'call.completed';
    default:
      return null;
  }
}

/**
 * Eventos de uma mudança de etapa: sempre `deal.stage_changed`, mais
 * `deal.won`/`deal.lost` quando o destino é terminal — o "ganhou" precisa ser
 * consultável sozinho, sem a IA ter que saber o nome das etapas.
 */
export function stageChangeEventTypes(toStage: { isWon?: boolean; isLost?: boolean }): EventType[] {
  const types: EventType[] = ['deal.stage_changed'];
  if (toStage.isWon) types.push('deal.won');
  if (toStage.isLost) types.push('deal.lost');
  return types;
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

const querySchema = z.object({
  accountId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  dealId: z.string().min(1).optional(),
  visitorId: z.string().min(1).optional(),
  types: z.array(z.string().min(1)).optional(),
  /** Prefixo de tipo, ex.: "site." ou "deal." */
  typePrefix: z.string().min(1).optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  take: z.coerce.number().int().min(1).max(500).default(100),
});
/** Entrada aceita strings (query string/MCP) — o schema converte. */
export interface EventQuery {
  accountId?: string;
  contactId?: string;
  dealId?: string;
  visitorId?: string;
  types?: string[];
  typePrefix?: string;
  since?: string | Date;
  until?: string | Date;
  take?: number | string;
}

/**
 * Eventos filtrados, mais recentes primeiro. Filtro por `contactId` também
 * traz o que o contato fez como visitante anônimo do site ANTES de virar
 * lead (eventos com o `visitorId` de qualquer Visitor ligado a ele) — é o
 * ponto da identidade unificada.
 */
export async function queryEvents(params: EventQuery) {
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) throw new ValidationError('Filtro inválido', parsed.error.flatten());
  const q = parsed.data;

  const and: Prisma.EventWhereInput[] = [];
  if (q.accountId) and.push({ accountId: q.accountId });
  if (q.dealId) and.push({ dealId: q.dealId });
  if (q.visitorId) and.push({ visitorId: q.visitorId });
  if (q.contactId) {
    const visitors = await prisma.visitor.findMany({
      where: { contactId: q.contactId },
      select: { id: true },
    });
    const visitorIds = visitors.map((v) => v.id);
    and.push(
      visitorIds.length
        ? { OR: [{ contactId: q.contactId }, { visitorId: { in: visitorIds } }] }
        : { contactId: q.contactId },
    );
  }
  if (q.types?.length) and.push({ type: { in: q.types } });
  if (q.typePrefix) and.push({ type: { startsWith: q.typePrefix } });
  if (q.since || q.until) and.push({ occurredAt: { gte: q.since, lte: q.until } });

  return prisma.event.findMany({
    where: and.length ? { AND: and } : {},
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: q.take,
    include: { actor: { select: { id: true, name: true, email: true } } },
  });
}

/** Linha do tempo de uma ficha (conta, contato ou negócio) — atalho de `queryEvents`. */
export async function getTimeline(
  target: { accountId: string } | { contactId: string } | { dealId: string },
  take = 100,
) {
  return queryEvents({ ...target, take });
}

// ---------------------------------------------------------------------------
// Site: coleta e identidade do visitante
// ---------------------------------------------------------------------------

const ATTRIBUTION_KEYS = [
  'gclid',
  'wbraid',
  'gbraid',
  'fbclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

const siteEventSchema = z.object({
  type: z.enum(SITE_EVENT_TYPES),
  occurredAt: z.coerce.date().optional(),
  page: z.string().trim().min(1).max(500),
  referrer: z.string().trim().max(1000).optional(),
  title: z.string().trim().max(300).optional(),
  attribution: z.record(z.string(), z.string().max(500)).optional(),
});

const collectSchema = z.object({
  // UUID de 1ª parte gerado pelo navegador DEPOIS do aceite do banner.
  visitorId: z.string().trim().min(8).max(64),
  // O site só manda se a pessoa aceitou — o campo existe para que nenhum
  // evento entre aqui sem a afirmação explícita de quem coletou.
  consent: z.literal('granted'),
  events: z.array(siteEventSchema).min(1).max(50),
});
export type SiteCollectInput = z.input<typeof collectSchema>;

/** Só as chaves de atribuição conhecidas — nada de payload livre vindo da internet. */
export function pickAttribution(raw: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const key of ATTRIBUTION_KEYS) {
    const value = raw[key]?.trim();
    if (value) out[key] = value.slice(0, 500);
  }
  return out;
}

/**
 * Ingestão do site institucional (via `POST /api/events/collect`, Bearer). Cria o
 * Visitor no primeiro contato (guardando o primeiro toque), atualiza
 * `lastSeenAt`, e grava cada evento já com `contactId`/`accountId` se o
 * visitante já foi identificado antes.
 */
export async function collectSiteEvents(input: SiteCollectInput) {
  const parsed = collectSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Eventos inválidos', parsed.error.flatten());
  const { visitorId, events } = parsed.data;

  const first = events[0]!;
  const firstTouch = { page: first.page, ...pickAttribution(first.attribution) };
  const visitor = await prisma.visitor.upsert({
    where: { id: visitorId },
    create: { id: visitorId, firstTouch },
    update: { lastSeenAt: new Date() },
  });

  await prisma.event.createMany({
    data: events.map((e) =>
      toEventRow({
        type: e.type,
        source: 'site',
        occurredAt: e.occurredAt,
        visitorId,
        contactId: visitor.contactId,
        accountId: visitor.accountId,
        payload: {
          page: e.page,
          ...(e.referrer ? { referrer: e.referrer } : {}),
          ...(e.title ? { title: e.title } : {}),
          ...pickAttribution(e.attribution),
        },
      }),
    ),
  });
  return { visitorId, recorded: events.length };
}

const identifySchema = z.object({
  visitorId: z.string().trim().min(8).max(64),
  contactId: z.string().min(1),
});

/**
 * Liga o visitante anônimo ao contato que ele virou (lead do formulário do
 * site). Retroativo: todo evento anterior desse visitante ganha
 * `contactId`/`accountId`, então a ficha do contato mostra a jornada inteira
 * desde a primeira visita. Idempotente — repetir não duplica nada.
 */
export async function identifyVisitor(input: z.input<typeof identifySchema>, ctx?: Ctx) {
  const parsed = identifySchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());
  const { visitorId, contactId } = parsed.data;

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, accountId: true },
  });
  if (!contact) throw new ValidationError('Contato não encontrado', { contactId: 'inexistente' });

  const existing = await prisma.visitor.findUnique({ where: { id: visitorId } });
  const alreadyLinked = existing?.contactId === contact.id;

  await prisma.visitor.upsert({
    where: { id: visitorId },
    create: { id: visitorId, contactId: contact.id, accountId: contact.accountId, identifiedAt: new Date() },
    update: {
      contactId: contact.id,
      accountId: contact.accountId,
      identifiedAt: existing?.identifiedAt ?? new Date(),
    },
  });
  const backfilled = await prisma.event.updateMany({
    where: { visitorId, contactId: null },
    data: { contactId: contact.id, accountId: contact.accountId },
  });

  if (!alreadyLinked) {
    await emit({
      type: 'visitor.identified',
      source: ctx ? sourceOf(ctx) : 'site',
      visitorId,
      contactId: contact.id,
      accountId: contact.accountId,
      actorId: ctx?.actor.id ?? null,
      payload: { firstTouch: existing?.firstTouch ?? {}, backfilledEvents: backfilled.count },
    });
  }
  return { visitorId, contactId: contact.id, backfilled: backfilled.count };
}
