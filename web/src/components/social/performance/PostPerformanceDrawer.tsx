'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { socialMetrics } from '@app/social';
import { PROVIDER_LABEL } from '@app/social/rules';
import { FORMAT_LABEL, METRIC_KEYS, METRIC_LABEL, type MetricKey } from '@app/social/metrics';
import { Drawer, LinkButton, Select, Skeleton } from '@/components/ui';
import { getPostPerformanceAction } from '@/app/(app)/social/actions';
import { REMOTE_TYPE_LABEL } from '@app/social/remote';
import { dateTimeLabel, formatCount, formatRate } from '../PostBits';
import { SocialPreview } from '../SocialPreview';

type Detail = Awaited<ReturnType<typeof socialMetrics.getSocialPostPerformance>>;
type Series = MetricKey | 'interactions';

const SERIES_LABEL: Record<Series, string> = { ...METRIC_LABEL, interactions: 'Interações' };

/** Detalhe de um post: todas as métricas, a ligação ao CRM (UTM) e a evolução recolha a recolha. */
export function PostPerformanceDrawer({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<Series>('interactions');

  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    setDetail(null);
    setError(null);
    getPostPerformanceAction(postId)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setError('Não foi possível carregar este post. Feche e tente de novo.'));
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const post = detail?.post;
  const available: Series[] = post?.metrics
    ? [...(post.interactions !== null ? (['interactions'] as Series[]) : []), ...METRIC_KEYS.filter((k) => post.metrics![k] !== null)]
    : [];
  const active = available.includes(series) ? series : (available[0] ?? 'interactions');
  const points = (detail?.snapshots ?? []).map((s) => ({ at: s.capturedAt, value: s[active] }));

  return (
    <Drawer open={postId !== null} title="Desempenho do post" onClose={onClose}>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !post ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-1">
            <p className="text-xs text-muted">
              {PROVIDER_LABEL[post.provider]} · {post.accountName} ·{' '}
              {detail.preview.remoteType ? REMOTE_TYPE_LABEL[detail.preview.remoteType] : FORMAT_LABEL[post.format]}
              {post.topic ? ` · ${post.topic}` : ''}
            </p>
            <p className="text-xs text-muted">
              Publicado em {dateTimeLabel(post.publishedAt)} · {post.origin === 'imported' ? 'publicado direto na rede' : 'publicado pelo CRM'}
            </p>
          </header>
          {/* A publicação como aparece na rede (media sincronizada com cópia no CRM). */}
          <SocialPreview
            provider={post.provider}
            accountName={post.accountName}
            avatarUrl={detail.preview.avatarUrl}
            text={detail.preview.text}
            media={detail.preview.media}
            linkUrl={detail.preview.linkUrl}
          />

          {post.externalUrl && !post.simulated && (
            <LinkButton href={post.externalUrl} target="_blank" rel="noreferrer" size="sm" variant="secondary" className="self-start">
              <ExternalLink className="h-3.5 w-3.5" /> Ver na rede
            </LinkButton>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-foreground">Métricas</h3>
            {post.metrics ? (
              <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
                {METRIC_KEYS.map((k) => (
                  <div key={k}>
                    <dt className="text-xs text-muted">{METRIC_LABEL[k]}</dt>
                    <dd className="text-sm tabular-nums text-foreground">{formatCount(post.metrics![k])}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-xs text-muted">Interações</dt>
                  <dd className="text-sm tabular-nums text-foreground">{formatCount(post.interactions)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Taxa de engagement</dt>
                  <dd className="text-sm tabular-nums text-foreground">
                    {formatRate(post.rate)}
                    {post.rateBasis === 'reach' && <span className="text-xs text-muted"> (sobre alcance)</span>}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted">
                {post.simulated ? 'Publicação simulada: não existe na rede, por isso não tem métricas.' : 'Ainda sem métricas recolhidas.'}
              </p>
            )}
            <p className="text-xs text-muted">
              {post.metricsAt ? `Última recolha: ${dateTimeLabel(post.metricsAt)}. ` : ''}
              “–” quer dizer que a rede não dá esse número a esta conta.
            </p>
            {post.metricsError && <p className="text-xs text-warning">{post.metricsError}</p>}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-foreground">Ligação ao CRM (pelo UTM do link)</h3>
            <dl className="grid grid-cols-3 gap-x-4">
              <div>
                <dt className="text-xs text-muted">Visitas ao site</dt>
                <dd className="text-sm tabular-nums text-foreground">{formatCount(post.visits)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Viraram contato</dt>
                <dd className="text-sm tabular-nums text-foreground">{formatCount(post.leads)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Reuniões marcadas</dt>
                <dd className="text-sm tabular-nums text-foreground">{formatCount(post.meetings)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">Só conta visitas de quem aceitou os cookies no site e chegou por um link com UTM deste post.</p>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-foreground">Evolução ({points.length} recolha(s))</h3>
              {available.length > 1 && (
                <Select inputSize="sm" aria-label="Métrica do gráfico" className="w-48" value={active} onChange={(e) => setSeries(e.target.value as Series)}>
                  {available.map((k) => (
                    <option key={k} value={k}>
                      {SERIES_LABEL[k]}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            {points.length < 2 ? (
              <p className="text-sm text-muted">A evolução aparece a partir da segunda recolha deste post.</p>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="at"
                      tickFormatter={(iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      tick={{ fill: 'var(--muted)', fontSize: 12 }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      minTickGap={28}
                    />
                    <YAxis width={44} tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v: number) => formatCount(v, true)} />
                    <Tooltip
                      cursor={{ stroke: 'var(--border-strong)' }}
                      content={({ active: on, payload }) => {
                        const point = on ? (payload?.[0]?.payload as { at: string; value: number | null } | undefined) : undefined;
                        if (!point) return null;
                        return (
                          <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-[var(--shadow-md)]">
                            <p className="text-muted">{dateTimeLabel(point.at)}</p>
                            <p className="font-semibold tabular-nums text-foreground">
                              {formatCount(point.value)} {SERIES_LABEL[active].toLowerCase()}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.1} connectNulls isAnimationActive={false} dot={{ r: 2.5, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 1.5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
