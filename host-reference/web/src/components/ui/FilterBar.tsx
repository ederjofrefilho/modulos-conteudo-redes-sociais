'use client';

import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from './Button';
import { Popover } from './Popover';

/**
 * Botão "Filtros (n)" da linha de ferramentas: guarda num painel os filtros
 * que não cabem (ou que a maioria das visitas não usa). `count` é quantos
 * estão ativos; os ativos aparecem na linha como `<FilterChip>`.
 */
export function FiltersPopover({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear?: () => void;
  children: ReactNode;
}) {
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <Button variant="secondary" size="sm" onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
          {count > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs tabular-nums text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      )}
    >
      <div className="flex w-64 flex-col gap-3">
        {children}
        {onClear && count > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="self-start text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
          >
            Limpar filtros
          </button>
        )}
      </div>
    </Popover>
  );
}

/** Um filtro dentro do `<FiltersPopover>`: rótulo em cima, controle embaixo. */
export function FilterField({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}

/** Filtro ativo como chip removível, na própria linha de ferramentas. */
export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remover filtro: ${label}`}
      className="flex h-7 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-full bg-accent/10 pl-3 pr-2 text-xs font-medium text-accent transition-colors duration-150 hover:bg-accent/20 dark:bg-accent/20"
    >
      <span className="truncate">{label}</span>
      <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
    </button>
  );
}
