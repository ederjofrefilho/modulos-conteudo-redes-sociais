'use client';

import { useId } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { FloatingPanel, useFloating } from './floating';
import { Listbox } from './Listbox';
import type { SelectOption } from './parts';

/**
 * Multi-seleção com chips: o gatilho mostra cada escolha como chip removível
 * e o painel mantém-se aberto enquanto se marcam opções (caixa de seleção à
 * direita de cada uma). Backspace no gatilho remove o último chip.
 */
export function MultiSelect({
  value,
  onChange,
  options,
  loadOptions,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
  emptyLabel = 'Nada encontrado.',
  disabled,
  className,
  ...aria
}: {
  value: SelectOption[];
  onChange: (next: SelectOption[]) => void;
  options?: SelectOption[];
  loadOptions?: (query: string) => Promise<SelectOption[]>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const listId = useId();
  const { open, setOpen, anchorRef, panelRef, style, close } = useFloating<HTMLDivElement>({ matchWidth: true });
  const toggle = (option: SelectOption) =>
    onChange(
      value.some((v) => v.value === option.value) ? value.filter((v) => v.value !== option.value) : [...value, option],
    );

  return (
    <div className={cn('relative min-w-0', !/(^|\s)w-/.test(className ?? '') && 'w-full', className)}>
      <div
        {...aria}
        ref={anchorRef}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (disabled || e.target !== e.currentTarget) return;
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === 'Backspace' && value.length) onChange(value.slice(0, -1));
        }}
        className={cn(
          'flex min-h-9 w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-lg bg-surface px-2 py-1 text-sm outline-none ring-1 ring-inset ring-field-border transition-shadow duration-150 hover:ring-foreground/60 focus-visible:ring-2 focus-visible:ring-[var(--ring-field)] aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger',
          open && 'ring-2 ring-[var(--ring-field)]',
          disabled && 'cursor-not-allowed bg-surface-2 text-muted',
        )}
      >
        {value.length === 0 && <span className="flex-1 px-1 text-muted">{placeholder}</span>}
        {value.map((option) => (
          <span
            key={option.value}
            className="inline-flex h-6 max-w-full items-center gap-1 rounded-md bg-surface-2 pl-2 pr-0.5 text-xs font-medium text-foreground"
          >
            <span className="truncate">{option.label}</span>
            {!disabled && (
              <button
                type="button"
                aria-label={`Remover ${option.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(option);
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-muted transition-colors duration-150 hover:bg-border hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <ChevronDown
          aria-hidden
          className={cn('ml-auto h-4 w-4 shrink-0 text-muted transition-transform duration-150', open && 'rotate-180')}
        />
      </div>
      {open && (
        <FloatingPanel panelRef={panelRef} style={style} className="min-w-56 max-w-[min(28rem,calc(100vw-1rem))]">
          <Listbox
            id={listId}
            options={options}
            loadOptions={loadOptions}
            selected={value.map((v) => v.value)}
            multiple
            searchable={Boolean(loadOptions) || (options?.length ?? 0) > 8}
            searchPlaceholder={searchPlaceholder}
            emptyLabel={emptyLabel}
            onPick={toggle}
            onTab={() => close()}
          />
        </FloatingPanel>
      )}
    </div>
  );
}
