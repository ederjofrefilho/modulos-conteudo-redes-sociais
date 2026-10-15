'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3 } from 'lucide-react';
import type { socialMetrics } from '@app/social';
import { FORMAT_LABEL } from '@app/social/metrics';
import { EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';
import { NetworkIcon, formatCount, formatRate, snippet } from '../PostBits';

type Post = socialMetrics.SocialReport['posts'][number];

interface Column {
  key: string;
  label: string;
  title?: string;
  value: (p: Post) => number | string | null;
  render?: (p: Post) => string;
  text?: boolean;
}

const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const COLUMNS: Column[] = [
  { key: 'publishedAt', label: 'Data', value: (p) => p.publishedAt, render: (p) => date(p.publishedAt), text: true },
  { key: 'format', label: 'Formato', value: (p) => FORMAT_LABEL[p.format], text: true },
  { key: 'topic', label: 'Tema', value: (p) => p.topic, text: true },
  { key: 'impressions', label: 'Impr.', title: 'Impressões', value: (p) => p.metrics?.impressions ?? null },
  { key: 'reach', label: 'Alcance', value: (p) => p.metrics?.reach ?? null },
  { key: 'reactions', label: 'Reações', value: (p) => p.metrics?.reactions ?? null },
  { key: 'comments', label: 'Coment.', title: 'Comentários', value: (p) => p.metrics?.comments ?? null },
  { key: 'shares', label: 'Partilhas', value: (p) => p.metrics?.shares ?? null },
  { key: 'saves', label: 'Guard.', title: 'Guardados', value: (p) => p.metrics?.saves ?? null },
  { key: 'clicks', label: 'Cliques', value: (p) => p.metrics?.clicks ?? null },
  { key: 'videoViews', label: 'Vídeo', title: 'Visualizações de vídeo', value: (p) => p.metrics?.videoViews ?? null },
  { key: 'rate', label: 'Taxa', title: 'Taxa de engagement', value: (p) => p.rate, render: (p) => formatRate(p.rate) },
  { key: 'visits', label: 'Visitas', title: 'Visitas ao site vindas deste post (UTM)', value: (p) => p.visits },
  { key: 'leads', label: 'Contatos', title: 'Visitantes vindos deste post que viraram contato', value: (p) => p.leads },
  { key: 'meetings', label: 'Reuniões', title: 'Reuniões marcadas por esses contatos depois da visita', value: (p) => p.meetings },
];

const TH = 'sticky top-0 z-10 whitespace-nowrap bg-surface px-2.5 py-2 text-xs font-medium text-muted';
const TD = 'whitespace-nowrap border-t border-border px-2.5 py-1.5';

/**
 * Todos os posts publicados no período, ordenável por qualquer coluna. É a
 * única região do painel que rola (nos dois sentidos, com o cabeçalho e a
 * coluna do post fixos). Clicar numa linha abre o detalhe com a evolução.
 */
export function PostsTable({ posts, onOpen }: { posts: Post[]; onOpen: (id: string) => void }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'publishedAt', dir: -1 });

  const sorted = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sort.key)!;
    return [...posts].sort((a, b) => {
      const va = column.value(a);
      const vb = column.value(b);
      // Sem valor vai sempre para o fim, em qualquer sentido.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return cmp * sort.dir;
    });
  }, [posts, sort]);

  if (posts.length === 0) {
    return (
      <div className="flex min-h-0 items-center justify-center rounded-xl border border-border bg-surface">
        <EmptyState
          icon={BarChart3}
          title="Nenhum post publicado neste período"
          description="Alargue o período ou tire filtros. Posts só entram aqui depois de publicados."
        />
      </div>
    );
  }

  return (
    <div className="min-h-0 overflow-auto rounded-xl border border-border bg-surface">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={cn(TH, 'left-0 z-20 min-w-64 text-left')}>Post ({posts.length})</th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={cn(TH, c.text ? 'text-left' : 'text-right')}
                title={c.title}
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.text ? 1 : -1 }))}
                >
                  {c.label}
                  {sort.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="group cursor-pointer" onClick={() => onOpen(p.id)}>
              <td className={cn(TD, 'sticky left-0 z-[1] max-w-72 bg-surface group-hover:bg-surface-2')}>
                <button type="button" className="flex w-full min-w-0 items-center gap-2 text-left" onClick={() => onOpen(p.id)}>
                  {p.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- host do Blob é dinâmico
                    <img src={p.thumbUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-2 text-muted">
                      <NetworkIcon provider={p.provider} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{snippet(p.text, 60)}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-muted">
                      <NetworkIcon provider={p.provider} className="h-3 w-3" /> {p.accountName}
                      {p.simulated ? ' · simulação' : ''}
                    </span>
                  </span>
                </button>
              </td>
              {COLUMNS.map((c) => {
                const v = c.value(p);
                return (
                  <td key={c.key} className={cn(TD, 'group-hover:bg-surface-2', c.text ? 'text-muted' : 'text-right tabular-nums text-foreground')}>
                    {c.render ? c.render(p) : typeof v === 'number' ? formatCount(v) : (v ?? '–')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
