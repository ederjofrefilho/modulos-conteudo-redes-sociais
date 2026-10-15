'use client';

import {
  Children,
  Fragment,
  isValidElement,
  useId,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';
import { FloatingPanel, useFloating } from './floating';
import { Listbox } from './Listbox';
import { OptionLead, SelectTrigger, type SelectOption, type SelectSize } from './parts';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'multiple'> {
  inputSize?: SelectSize;
  placeholder?: string;
  /** Opções como dados (com avatar, cor, linha secundária); alternativa aos `<option>` filhos. */
  options?: SelectOption[];
  /** Campo de busca no painel. Padrão: liga sozinho acima de 8 opções. */
  searchable?: boolean;
  variant?: 'field' | 'ghost';
  align?: 'left' | 'right';
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

type OptionProps = { value?: string | number; disabled?: boolean; label?: string; children?: ReactNode };

/** Lê `<option>`/`<optgroup>` filhos como dados, para a API ficar igual à do select nativo. */
function parseOptions(children: ReactNode, group?: string, out: SelectOption[] = []): SelectOption[] {
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionProps>(child)) return;
    if (child.type === Fragment) parseOptions(child.props.children, group, out);
    else if (child.type === 'optgroup') parseOptions(child.props.children, child.props.label, out);
    else if (child.type === 'option') {
      const label = textOf(child.props.children);
      out.push({
        value: child.props.value === undefined ? label : String(child.props.value),
        label,
        disabled: child.props.disabled,
        group,
      });
    }
  });
  return out;
}

/**
 * Seleção simples: substitui o `<select>` nativo com a MESMA API
 * (`value`/`defaultValue`, `onChange(e)` com `e.target.value`, `<option>`
 * filhos, `name` para formulários), mas com o gatilho e o painel do sistema
 * único de seletores. Uma `<option value="" disabled>` vira o placeholder.
 */
export function Select({
  inputSize = 'md',
  placeholder,
  options: optionsProp,
  searchable,
  variant,
  align,
  value,
  defaultValue,
  onChange,
  name,
  disabled,
  className,
  children,
  id,
  required: _required,
  ...triggerProps
}: SelectProps) {
  const listId = useId();
  const parsed = optionsProp ?? parseOptions(children);
  const hole = parsed.find((o) => o.value === '' && o.disabled);
  const options = hole ? parsed.filter((o) => o !== hole) : parsed;
  const [inner, setInner] = useState(defaultValue === undefined ? undefined : String(defaultValue));
  const current = value !== undefined ? String(value) : (inner ?? (hole ? '' : (options[0]?.value ?? '')));
  const selected = options.find((o) => o.value === current);
  const { open, setOpen, anchorRef, panelRef, style, close } = useFloating({ matchWidth: true, align });

  function pick(option: SelectOption) {
    close();
    if (option.value === current) return;
    setInner(option.value);
    const target = { value: option.value, name: name ?? '' };
    onChange?.({ target, currentTarget: target } as unknown as ChangeEvent<HTMLSelectElement>);
  }

  return (
    <div className={cn('relative min-w-0', !/(^|\s)w-/.test(className ?? '') && 'w-full', className)}>
      {name && <input type="hidden" name={name} value={current} />}
      <SelectTrigger
        {...(triggerProps as object)}
        ref={anchorRef}
        id={id}
        size={inputSize}
        variant={variant}
        open={open}
        disabled={disabled}
        placeholder={placeholder ?? hole?.label ?? 'Selecione...'}
        lead={selected && <OptionLead option={selected} />}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selected?.label}
      </SelectTrigger>
      {open && (
        <FloatingPanel panelRef={panelRef} style={style} className="min-w-40 max-w-[min(28rem,calc(100vw-1rem))]">
          <Listbox
            id={listId}
            options={options}
            selected={[current]}
            searchable={searchable ?? options.length > 8}
            onPick={pick}
            onTab={() => close()}
          />
        </FloatingPanel>
      )}
    </div>
  );
}
