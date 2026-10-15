'use client';

import type { socialMetrics } from '@app/social';
import { FORMAT_LABEL, type PostFormat } from '@app/social/metrics';
import { EmptyState } from '@/components/ui';
import { Layers, Trophy } from 'lucide-react';
import { NetworkIcon, formatCount, formatRate, snippet } from '../PostBits';

type Report = socialMetrics.SocialReport;
type Group = Report['byFormat'][number];
type Post = Report['posts'][number];

function GroupBars({ title, groups, labelOf }: { title: string; groups: Group[]; labelOf: (key: string) => string }) {
  const max = Math.max(1, ...groups.map((g) => g.interactions ?? 0));
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-1 font-medium">&nbsp;</th>
            <th className="w-[38%] pb-1 font-medium">Interações</th>
            <th className="pb-1 text-right font-medium">Posts</th>
            <th className="pb-1 text-right font-medium">Impressões</th>
            <th className="pb-1 text-right font-medium">Taxa</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <td className="max-w-0 truncate py-1 pr-2 text-foreground">{labelOf(g.key)}</td>
              <td className="py-1 pr-3">
                <span className="flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${((g.interactions ?? 0) / max) * 100}%` }} />
                  </span>
                  <span className="w-10 text-right text-xs tabular-nums text-foreground">{formatCount(g.interactions, true)}</span>
                </span>
              </td>
              <td className="py-1 text-right tabular-nums text-muted">{g.posts}</td>
              <td className="py-1 text-right tabular-nums text-muted">{formatCount(g.metrics.impressions, true)}</td>
              <td className="py-1 text-right tabular-nums text-foreground">{formatRate(g.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Desempenho por formato e por tema: barras de interações com a tabela ao lado (a taxa é a do grupo inteiro). */
export function Breakdown({ byFormat, byTopic }: { byFormat: Group[]; byTopic: Group[] }) {
  if (byFormat.length === 0) {
    return <EmptyState size="inline" icon={Layers} title="Sem posts publicados neste período" description="Alargue o período ou tire filtros." />;
  }
  return (
    <div className="flex flex-col gap-5">
      <GroupBars title="Por formato" groups={byFormat} labelOf={(k) => FORMAT_LABEL[k as PostFormat] ?? k} />
      <GroupBars title="Por tema" groups={byTopic} labelOf={(k) => k} />
    </div>
  );
}

function RankList({ title, posts, onOpen }: { title: string; posts: Post[]; onOpen: (id: string) => void }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <ol className="flex flex-col gap-1">
        {posts.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onOpen(p.id)} className="flex w-full min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-[var(--hover)]">
              {p.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- host do Blob é dinâmico
                <img src={p.thumbUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted">
                  <NetworkIcon provider={p.provider} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{snippet(p.text, 70)}</span>
                <span className="block truncate text-xs tabular-nums text-muted">
                  {formatRate(p.rate)} · {formatCount(p.interactions)} interações · {formatCount(p.metrics?.impressions, true)} impressões
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Melhores e piores do período pela taxa de engagement (sem taxa, pelas
 * interações). Só entram posts com métricas; com menos de 4 não há "piores"
 * (seriam os mesmos).
 */
export function Rankings({ posts, onOpen }: { posts: Post[]; onOpen: (id: string) => void }) {
  const measured = posts.filter((p) => p.interactions !== null);
  if (measured.length === 0) {
    return (
      <EmptyState
        size="inline"
        icon={Trophy}
        title="Ainda não há posts com métricas neste período"
        description="Assim que a recolha guardar números de posts publicados, o ranking aparece aqui."
      />
    );
  }
  const score = (p: Post) => (p.rate !== null ? p.rate : (p.interactions ?? 0) / 1000);
  const sorted = [...measured].sort((a, b) => score(b) - score(a));
  const top = sorted.slice(0, 5);
  const bottom = measured.length >= 4 ? sorted.slice(-Math.min(5, Math.floor(measured.length / 2))).reverse() : [];
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <RankList title="Melhores" posts={top} onOpen={onOpen} />
      {bottom.length > 0 && <RankList title="Piores" posts={bottom} onOpen={onOpen} />}
    </div>
  );
}
