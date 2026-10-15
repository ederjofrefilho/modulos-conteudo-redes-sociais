import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

function buildHref(base: string, params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  return sp.size ? `${base}?${sp}` : base;
}

/** Cabeçalho de coluna ordenável (alterna asc/desc preservando busca/página). */
export function SortHeader({
  base,
  label,
  field,
  current,
  q,
  mine,
  extra,
}: {
  base: string;
  label: string;
  field: string;
  /** Valor atual de ?sort=, ex.: "name-asc". */
  current?: string;
  q?: string;
  /** Preserva ?mine=1 (filtro Todos|Meus) ao trocar de ordenação. */
  mine?: string;
  /** Outros filtros da URL a preservar ao trocar de ordenação (ex.: pipelineId, stageId). */
  extra?: Record<string, string | undefined>;
}) {
  const [curField, curDir] = (current ?? '').split('-');
  const active = curField === field;
  const nextDir = active && curDir === 'asc' ? 'desc' : 'asc';
  return (
    <Link
      href={buildHref(base, { q, mine, ...extra, sort: `${field}-${nextDir}` })}
      className={cn(
        'inline-flex items-center gap-1 transition-colors hover:text-foreground',
        active && 'text-foreground',
      )}
    >
      {label}
      {active &&
        (curDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </Link>
  );
}

/** Paginação Prev/Próx com contagem "X–Y de Z". */
export function Pagination({
  base,
  page,
  take,
  total,
  q,
  sort,
  mine,
  extra,
}: {
  base: string;
  page: number;
  take: number;
  total: number;
  q?: string;
  sort?: string;
  /** Preserva ?mine=1 (filtro Todos|Meus) ao trocar de página. */
  mine?: string;
  /** Outros filtros da URL a preservar ao trocar de página (ex.: stageId, minValue). */
  extra?: Record<string, string | undefined>;
}) {
  if (total <= take) return null;
  const pages = Math.max(1, Math.ceil(total / take));
  const from = (page - 1) * take + 1;
  const to = Math.min(page * take, total);

  const pageHref = (p: number) =>
    buildHref(base, { q, sort, mine, ...extra, page: p > 1 ? String(p) : undefined });

  const navClass = (enabled: boolean) =>
    cn(
      'inline-flex h-8 items-center gap-1 rounded-lg bg-surface px-2.5 text-xs font-medium shadow-[var(--shadow-sm)]',
      enabled ? 'text-foreground transition-colors hover:bg-surface-2' : 'pointer-events-none opacity-40',
    );

  return (
    <div className="mt-3 flex shrink-0 items-center justify-between text-xs text-muted">
      <span>
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-2">
        <Link href={pageHref(page - 1)} className={navClass(page > 1)} aria-label="Página anterior">
          <ChevronLeft className="h-3.5 w-3.5" /> Anterior
        </Link>
        <span>
          {page} / {pages}
        </span>
        <Link
          href={pageHref(page + 1)}
          className={navClass(page < pages)}
          aria-label="Próxima página"
        >
          Próxima <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
