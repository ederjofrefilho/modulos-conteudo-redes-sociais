import { getMetricsCapabilities, socialAccess, socialMetrics, socialPosts, publishMode, type PostFormat } from '@app/social';
import { dayKey } from '@app/social/analyze';
import { Badge, PageShell } from '@/components/ui';
import { socialTabs } from '@/components/social/tabs';
import { PerformanceDashboard } from '@/components/social/performance/PerformanceDashboard';
import { requireCtx } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Desempenho das redes sociais' };

const FORMATS: PostFormat[] = ['TEXT', 'IMAGE', 'CAROUSEL', 'LINK', 'VIDEO'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function shift(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default async function SocialPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string; rede?: string; formato?: string; tema?: string; post?: string }>;
}) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const allowed = await socialAccess.metricsAccountIds(ctx);
  const today = dayKey(new Date());
  const custom = sp.de && sp.ate && DAY.test(sp.de) && DAY.test(sp.ate) && sp.de <= sp.ate;
  const preset = ['7', '30', '90', '365'].includes(sp.periodo ?? '') ? Number(sp.periodo) : 30;
  const from = custom ? sp.de! : shift(today, -(preset - 1));
  const to = custom ? sp.ate! : today;
  const provider = sp.rede === 'LINKEDIN' ? ('LINKEDIN' as const) : sp.rede === 'INSTAGRAM' ? ('INSTAGRAM' as const) : undefined;
  const format = FORMATS.find((f) => f === sp.formato);
  const filters: socialMetrics.ReportFilters = { from, to, provider, format, topic: sp.tema || undefined };
  const visible = new Set(allowed);

  const [report, capabilities, topics] = await Promise.all([
    socialMetrics.getSocialReport({ ...filters, accountIds: allowed }),
    getMetricsCapabilities().then((all) => all.filter((c) => visible.has(c.id))),
    socialPosts.listSocialTopics(),
  ]);

  return (
    <PageShell fill>
      <PerformanceDashboard
        today={today}
        tabs={socialTabs('/social/desempenho')}
        description="Como os posts publicados se saíram no LinkedIn e no Instagram, com histórico guardado no CRM."
        badges={publishMode() === 'log' ? <Badge tone="warning">Modo simulação</Badge> : undefined}
        report={report}
        filters={{ ...filters, preset: custom ? 'custom' : String(preset) }}
        topics={topics}
        capabilities={capabilities.map((c) => ({
          id: c.id,
          provider: c.provider,
          kind: c.kind,
          displayName: c.displayName,
          isActive: c.isActive,
          missingScopes: c.missingScopes,
          metricsAt: c.metricsAt?.toISOString() ?? null,
          metricsError: c.metricsError,
        }))}
        initialPostId={sp.post ?? null}
      />
    </PageShell>
  );
}
