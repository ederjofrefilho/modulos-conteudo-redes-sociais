import { prisma, SocialPostStatus } from '@app/db';
import type { schedule } from '@app/core';
import { PROVIDER_LABEL } from './rules.js';

/**
 * Posts com horário para a agenda (ver `@app/core` schedule.ts): aprovados
 * (o cron publica na hora) e rascunhos com horário sugerido, que só saem
 * depois de alguém aprovar. Ideias não entram: ainda não são um post.
 */
export async function listScheduledSocialPosts(q: schedule.ScheduleQuery): Promise<schedule.ScheduledItem[]> {
  const rows = await prisma.socialPost.findMany({
    where: {
      status: { in: [SocialPostStatus.APPROVED, SocialPostStatus.DRAFT] },
      isIdea: false,
      scheduledAt: { gte: q.from, lt: q.to },
      ...(q.userId ? { OR: [{ createdById: q.userId }, { scheduledById: q.userId }] } : {}),
    },
    select: {
      id: true,
      text: true,
      status: true,
      scheduledAt: true,
      placement: true,
      socialAccount: { select: { provider: true, displayName: true } },
      createdBy: { select: { name: true, email: true } },
      scheduledBy: { select: { name: true, email: true } },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 500,
  });
  return rows.map((p) => {
    const firstLine = p.text.trim().split('\n')[0]?.trim() ?? '';
    const who = p.scheduledBy ?? p.createdBy;
    return {
      id: `social:${p.id}`,
      kind: 'social' as const,
      at: p.scheduledAt!.toISOString(),
      title: firstLine ? (firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine) : 'Post sem texto',
      detail: `${PROVIDER_LABEL[p.socialAccount.provider]} · ${p.socialAccount.displayName}`,
      who: who.name ?? who.email,
      href: `/social?post=${encodeURIComponent(p.id)}`,
      needsApproval: p.status === SocialPostStatus.DRAFT,
    };
  });
}
