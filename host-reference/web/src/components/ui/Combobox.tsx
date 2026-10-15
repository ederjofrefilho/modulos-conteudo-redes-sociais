'use client';

import { useEffect, useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { FloatingPanel, useFloating } from './select/floating';
import { Listbox } from './select/Listbox';
import { OptionLead, SelectTrigger, type SelectOption, type SelectSize } from './select/parts';
import { pushRecent, readRecents } from './select/recents';

export type ComboboxOption = SelectOption;

/**
 * Seleção com busca (variante de ENTIDADES do sistema de seletores): lista
 * estática (`options`, filtrada no cliente) ou busca assíncrona
 * (`loadOptions`, tipicamente uma server action, com debounce e trecho
 * destacado). Avatar + nome + linha secundária, recentes no topo com o campo
 * vazio (`recentKey`), "Criar «texto»" no fim (`onCreate`) e limpar com um
 * clique (`clearable`).
 */
export function Combobox({
  value,
  onChange,
  options,
  loadOptions,
  initialSelected,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
  emptyLabel = 'Nada encontrado.',
  disabled,
  className,
  allowCustomValue = false,
  clearable = true,
  recentKey,
  onCreate,
  createLabel,
  inputSize = 'md',
  ...triggerProps
}: {
  value: string;
  onChange: (value: string, option: ComboboxOption | null) => void;
  options?: ComboboxOption[];
  loadOptions?: (query: string) => Promise<ComboboxOption[]>;
  /** Rótulo do valor pré-selecionado no modo `loadOptions` (a busca só roda ao abrir). */
  initialSelected?: ComboboxOption;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Aceita o texto digitado como valor ("Usar «texto»") quando não bate com nenhuma opção. */
  allowCustomValue?: boolean;
  clearable?: boolean;
  /** Chave das escolhas recentes (ex.: "account", "contact", "user"). */
  recentKey?: string;
  /** Cria o registro com o texto digitado e devolve a opção já selecionável. */
  onCreate?: (text: string) => Promise<ComboboxOption | null | undefined>;
  createLabel?: (text: string) => string;
  inputSize?: SelectSize;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const listId = useId();
  const resolve = (v: string): ComboboxOption | null =>
    options?.find((o) => o.value === v) ??
    (initialSelected && initialSelected.value === v ? initialSelected : null) ??
    (allowCustomValue && v ? { value: v, label: v } : null);

  const [selected, setSelected] = useState<ComboboxOption | null>(resolve(value));
  const [recents, setRecents] = useState<ComboboxOption[]>([]);
  const [creating, setCreating] = useState(false);
  const { open, setOpen, anchorRef, panelRef, style, close } = useFloating({ matchWidth: true });

  // Mantém o rótulo em sincronia se `value` mudar por fora (edição/reset).
  useEffect(() => {
    if (!value) setSelected(null);
    else if (selected?.value !== value) setSelected(resolve(value) ?? selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options, initialSelected]);

  useEffect(() => {
    if (open && recentKey) setRecents(readRecents(recentKey));
  }, [open, recentKey]);

  function pick(option: ComboboxOption) {
    setSelected(option);
    onChange(option.value, option);
    if (recentKey) pushRecent(recentKey, option);
    close();
  }

  function clear() {
    setSelected(null);
    onChange('', null);
  }

  async function create(text: string) {
    if (!onCreate) return pick({ value: text, label: text });
    close();
    setCreating(true);
    try {
      const created = await onCreate(text);
      if (created) pick(created);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={cn('relative min-w-0', !/(^|\s)w-/.test(className ?? '') && 'w-full', className)}>
      <SelectTrigger
        {...triggerProps}
        ref={anchorRef}
        size={inputSize}
        open={open}
        disabled={disabled || creating}
        placeholder={creating ? 'Criando...' : placeholder}
        lead={selected && <OptionLead option={selected} />}
        onClear={clearable ? clear : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
          } else if (clearable && selected && (e.key === 'Delete' || e.key === 'Backspace')) clear();
        }}
      >
        {creating ? undefined : selected?.label}
      </SelectTrigger>
      {open && (
        <FloatingPanel panelRef={panelRef} style={style} className="min-w-64 max-w-[min(28rem,calc(100vw-1rem))]">
          <Listbox
            id={listId}
            options={options}
            loadOptions={loadOptions}
            selected={value ? [value] : []}
            searchable
            searchPlaceholder={searchPlaceholder}
            emptyLabel={emptyLabel}
            recents={recentKey ? recents : undefined}
            onCreate={onCreate || allowCustomValue ? create : undefined}
            createLabel={createLabel ?? (onCreate ? undefined : (text) => `Usar «${text}»`)}
            onPick={pick}
            onTab={() => close()}
          />
        </FloatingPanel>
      )}
    </div>
  );
}
