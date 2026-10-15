import type { LucideIcon } from 'lucide-react';

/**
 * Estado vazio. `size="inline"` é a versão de uma linha para seções DENTRO de
 * uma ficha (`DESIGN.md` §4: seção sem dado colapsa para uma linha, nunca um
 * bloco vazio grande dominando a primeira dobra); o padrão, centralizado e
 * alto, fica para listas e telas inteiras sem dado.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'default',
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: 'default' | 'inline';
}) {
  if (size === 'inline') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 text-sm">
        <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <p className="min-w-0 flex-1 text-muted">
          <span className="font-medium text-foreground">{title}</span>
          {description && <> · {description}</>}
        </p>
        {action}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
