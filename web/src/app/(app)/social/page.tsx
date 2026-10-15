import { posts as contentPosts } from '@app/content';
import { isAdmin } from '@app/core';
import { socialAccess, socialAccounts, socialMetrics, socialPosts, publishMode } from '@app/social';
import { Badge, PageShell } from '@/components/ui';
import { socialTabs } from '@/components/social/tabs';
import { SocialWorkspace } from '@/components/social/SocialWorkspace';
import { toWorkspaceAccount, toWorkspacePosts } from '@/components/social/types';
import { requireCtx } from '@/lib/session';

export const dynamic = 'force-dynamic';
// "Atualizar" sincroniza as contas e recolhe métricas na mesma ação.
export const maxDuration = 60;
export const metadata = { title: 'Redes sociais' };

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; post?: string; novo?: string; artigo?: string; equipa?: string }>;
}) {
  const ctx = await requireCtx();
  const { vista, post, novo, artigo, equipa } = await searchParams;
  // Por omissão: as contas da pessoa + as da empresa a que tem acesso. ADMIN pode ver a equipa toda.
  const team = equipa === '1' && isAdmin(ctx);

  const rawAccounts = await socialAccounts.listAccountsFor(ctx, { team });
  const accounts = rawAccounts.map(toWorkspaceAccount);
  const [posts, topics, articles, bestSlots] = await Promise.all([
    socialPosts.listSocialPostsForWorkspace(ctx, { accountIds: accounts.map((a) => a.id) }),
    socialPosts.listSocialTopics(),
    contentPosts.listPosts({ take: 100, sort: 'updated-desc' }),
    socialAccess.metricsAccountIds(ctx).then((ids) => socialMetrics.getBestSlots(undefined, ids)),
  ]);
  const now = new Date();
  const simulating = publishMode() === 'log';

  return (
    <PageShell fill>
      <SocialWorkspace
        tabs={socialTabs('/social')}
        description="Posts do LinkedIn e do Instagram. Nada vai ao ar sem alguém aprovar aqui."
        badges={simulating ? <Badge tone="warning">Modo simulação</Badge> : undefined}
        posts={toWorkspacePosts(posts, accounts, now)}
        accounts={accounts}
        team={team ? 'all' : isAdmin(ctx) ? 'mine' : null}
        articles={articles.items.map((p: { id: string; title: string }) => ({ id: p.id, title: p.title }))}
        topics={topics}
        bestSlots={bestSlots.map(({ weekday, hour, posts: count, rate }) => ({ weekday, hour, posts: count, rate }))}
        initial={{
          view: vista === 'lista' ? 'lista' : 'calendario',
          postId: post ?? null,
          isNew: novo === '1',
          articleId: artigo ?? null,
        }}
      />
    </PageShell>
  );
}
