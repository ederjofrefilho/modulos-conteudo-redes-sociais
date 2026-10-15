import { PageShell } from './PageShell';
import { cn } from '@/lib/cn';

/** Placeholder de carregamento com shimmer, usando os tokens do tema. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('rounded-lg', className)}
      style={{
        background:
          'linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s linear infinite',
      }}
    />
  );
}

/** Esqueleto de tabela (listas de contas/contatos). */
/** Mesma altura do `<PageHeader>` (uma linha de 56px), para os `loading.tsx`. */
export function PageHeaderSkeleton() {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3">
      <Skeleton className="h-8 w-64 max-w-[50%]" />
      <Skeleton className="h-8 w-28" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl bg-surface p-4">
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Esqueleto de página de detalhe (header + cards). */
export function DetailSkeleton() {
  return (
    <PageShell width="content">
      <div className="flex h-14 items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-5 w-56" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-40" />
      </div>
      <Skeleton className="mb-4 h-44 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </PageShell>
  );
}
