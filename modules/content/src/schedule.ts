import { prisma, ContentKind, ContentStatus } from '@app/db';
import type { schedule } from '@app/core';

/** Artigos e casos agendados, para a agenda (ver `@app/core` schedule.ts). */
export async function listScheduledContentPosts(q: schedule.ScheduleQuery): Promise<schedule.ScheduledItem[]> {
  const rows = await prisma.contentPost.findMany({
    where: {
      status: ContentStatus.SCHEDULED,
      scheduledAt: { gte: q.from, lt: q.to },
      ...(q.userId ? { authorId: q.userId } : {}),
    },
    select: { id: true, kind: true, title: true, scheduledAt: true, author: { select: { name: true, email: true } } },
    orderBy: { scheduledAt: 'asc' },
    take: 200,
  });
  return rows.map((p) => ({
    id: `content:${p.id}`,
    kind: 'content' as const,
    at: p.scheduledAt!.toISOString(),
    title: p.title,
    detail: p.kind === ContentKind.CASE ? 'Caso de sucesso no site' : 'Artigo no blog',
    who: p.author.name ?? p.author.email,
    href: `/conteudo/${p.id}`,
    needsApproval: false,
  }));
}
