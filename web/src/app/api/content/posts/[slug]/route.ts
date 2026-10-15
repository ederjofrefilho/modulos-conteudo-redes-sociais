import { publicPosts } from '@app/content';
import { requireScope } from '@app/core';
import { handle } from '@/lib/api';
import { requireCtx } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await requireCtx();
    requireScope(ctx, 'content:read');
    return publicPosts.getPublishedPostBySlug((await params).slug);
  });
}
