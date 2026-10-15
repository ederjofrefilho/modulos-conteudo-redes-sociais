import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { socialMetrics } from '@app/social';
import { cn } from '@/lib/cn';
import { formatCount, formatRate } from '../PostBits';

type Report = socialMetrics.SocialReport;
type Kpi = { value: number | null; previous: number | null; change: number | null };

function Tile({ label, kpi, format, hint }: { label: string; kpi: Kpi; format: (v: number | null) => string; hint?: string }) {
  const change = kpi.change;
  const Icon = change === null || Math.abs(change) < 0.05 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2" title={hint}>
      <dt className="truncate text-xs text-muted">{label}</dt>
      <dd className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums text-foreground">{format(kpi.value)}</span>
        {/* Sentido dado pelo ícone e pelo sinal, não só pela cor. */}
        <span
          className={cn(
            'inline-flex items-center gap-0.5 text-xs tabular-nums',
            change === null ? 'text-muted' : change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-muted',
          )}
          aria-label={
            change === null
              ? 'Sem período anterior para comparar'
              : `${change > 0 ? 'Subiu' : change < 0 ? 'Desceu' : 'Igual'} ${Math.abs(change).toFixed(0)}% face ao período anterior`
          }
        >
          {change !== null && <Icon className="h-3 w-3" />}
          {change === null ? '' : `${change > 0 ? '+' : ''}${change.toFixed(0)}%`}
        </span>
      </dd>
    </div>
  );
}

/**
 * KPIs do período numa faixa só (posts publicados no período, com os totais
 * mais recentes de cada um), cada um comparado com a janela anterior do mesmo
 * tamanho. "–" quer dizer que a rede não deu o número, não que foi zero.
 */
export function KpiStrip({ report }: { report: Report }) {
  const { kpis } = report;
  const count = (v: number | null) => formatCount(v, true);
  const signed = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : ''}${formatCount(v)}`);
  return (
    <dl className="grid shrink-0 grid-cols-2 divide-x divide-border rounded-xl border border-border bg-surface sm:grid-cols-4 xl:grid-cols-7">
      <Tile label="Posts publicados" kpi={kpis.posts} format={count} hint={`${report.measuredPosts} com métricas`} />
      <Tile label="Impressões" kpi={kpis.impressions} format={count} hint="Quantas vezes os posts foram mostrados" />
      <Tile label="Alcance" kpi={kpis.reach} format={count} hint="Contas únicas que viram os posts" />
      <Tile label="Interações" kpi={kpis.interactions} format={count} hint="Reações + comentários + partilhas + guardados" />
      <Tile label="Taxa de engagement" kpi={kpis.engagementRate} format={formatRate} hint="Interações ÷ impressões × 100" />
      <Tile label="Cliques" kpi={kpis.clicks} format={count} hint="Cliques no post ou no link (só onde a rede dá)" />
      <Tile label="Novos seguidores" kpi={kpis.newFollowers} format={signed} hint={report.followers === null ? 'Sem histórico de seguidores' : `${formatCount(report.followers)} seguidores hoje`} />
    </dl>
  );
}
