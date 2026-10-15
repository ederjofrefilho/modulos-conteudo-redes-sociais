import { schedule } from '@app/core';
import { listScheduledSocialPosts } from '@app/social';
import { listScheduledContentPosts } from '@app/content';

/**
 * Tudo o que está programado num período, de todas as fontes (e-mails,
 * prospecção, sequências, tarefas, WhatsApp, redes sociais, blog), no formato
 * comum de `@app/core` schedule.ts. Uma fonte que falha não derruba a agenda:
 * ela some da lista e o erro vai para o log.
 */
export async function listScheduled(q: schedule.ScheduleQuery): Promise<schedule.ScheduledItem[]> {
  const sources = [
    schedule.listScheduledActivities(q),
    schedule.listScheduledSequenceSteps(q),
    listScheduledSocialPosts(q),
    listScheduledContentPosts(q),
  ];
  const settled = await Promise.allSettled(sources);
  const items = settled.flatMap((r) => {
    if (r.status === 'fulfilled') return r.value;
    console.error('[agenda] fonte de programados falhou:', r.reason);
    return [];
  });
  return schedule.sortScheduled(items);
}

/** Mensagens e posts que esperam aprovação, sem horário (só na visão da empresa). */
export function listAwaitingApproval(q: Pick<schedule.ScheduleQuery, 'userId'>) {
  return schedule.listPendingWhatsApp(q);
}
