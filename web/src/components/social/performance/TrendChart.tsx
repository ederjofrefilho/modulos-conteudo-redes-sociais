'use client';

import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { socialMetrics } from '@app/social';
import { EmptyState, Segmented } from '@/components/ui';
import { LineChart as LineIcon } from 'lucide-react';
import { formatCount } from '../PostBits';

type Point = socialMetrics.SocialReport['series'][number];
type Metric = 'impressions' | 'interactions' | 'followers';

const METRICS: { value: Metric; label: string; note: string }[] = [
  { value: 'impressions', label: 'Impressões', note: 'Impressões ganhas por dia, somando todos os posts' },
  { value: 'interactions', label: 'Interações', note: 'Interações ganhas por dia, somando todos os posts' },
  { value: 'followers', label: 'Seguidores', note: 'Total de seguidores das contas no fim de cada dia' },
];

const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/**
 * O gráfico principal: UMA medida de cada vez (trocada no seletor), nunca dois
 * eixos. Impressões e interações são o ganho diário calculado a partir dos
 * snapshots guardados; seguidores é o total do dia.
 */
export function TrendChart({ series }: { series: Point[] }) {
  const [metric, setMetric] = useState<Metric>('impressions');
  const current = METRICS.find((m) => m.value === metric)!;
  const data = series.map((p) => ({ day: p.day, value: p[metric], posts: p.posts }));
  const hasData = data.some((d) => typeof d.value === 'number' && d.value > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{current.note}</p>
        <Segmented label="Medida do gráfico" value={metric} onChange={setMetric} options={METRICS.map(({ value, label }) => ({ value, label }))} />
      </div>
      {!hasData ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            size="inline"
            icon={LineIcon}
            title="Ainda sem histórico neste período"
            description="O gráfico enche-se à medida que as recolhas guardam os números de cada post publicado."
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="day"
                tickFormatter={dayLabel}
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                minTickGap={28}
              />
              <YAxis
                width={44}
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatCount(v, true)}
                allowDecimals={false}
                domain={metric === 'followers' ? ['auto', 'auto'] : [0, 'auto']}
              />
              <Tooltip
                cursor={{ stroke: 'var(--border-strong)' }}
                content={({ active, payload }) => {
                  const point = active ? (payload?.[0]?.payload as { day: string; value: number | null; posts: number } | undefined) : undefined;
                  if (!point) return null;
                  return (
                    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-[var(--shadow-md)]">
                      <p className="text-muted">{dayLabel(point.day)}</p>
                      <p className="font-semibold tabular-nums text-foreground">
                        {formatCount(point.value)} {current.label.toLowerCase()}
                      </p>
                      {point.posts > 0 && <p className="text-muted">{point.posts} post(s) publicado(s)</p>}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name={current.label}
                stroke="var(--accent)"
                strokeWidth={2}
                fill="var(--accent)"
                fillOpacity={0.1}
                connectNulls
                dot={data.length <= 31 ? { r: 2.5, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 1.5 } : false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
