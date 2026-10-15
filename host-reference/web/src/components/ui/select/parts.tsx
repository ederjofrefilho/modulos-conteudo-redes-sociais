'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Avatar } from '../Avatar';
import { cn } from '@/lib/cn';

/** Uma opção de qualquer seletor (simples, com busca, múltiplo). */
export interface SelectOption {
  value: string;
  label: string;
  /** Linha secundária (domínio da empresa, e-mail, cargo...). */
  hint?: string;
  /** Nome para as iniciais do Avatar (pessoa = círculo). */
  avatarLabel?: string;
  /** Avatar quadrado (empresa). */
  avatarSquare?: boolean;
  /** Ponto de cor à esquerda (pipeline, etapa). Valor CSS vindo do dado. */
  color?: string | null;
  icon?: ReactNode;
  /** Texto discreto à direita (contagem, atalho). */
  trailing?: ReactNode;
  disabled?: boolean;
  /** Título do grupo; opções seguidas com o mesmo grupo ficam juntas. */
  group?: string;
}

export type SelectSize = 'sm' | 'md' | 'lg';

const HEIGHTS: Record<SelectSize, string> = {
  sm: 'h-8 text-xs',
  md: 'h-9 text-sm',
  lg: 'h-11 text-base',
};

/** Ícone, ponto de cor ou avatar à esquerda de uma opção (e do gatilho). */
export function OptionLead({ option }: { option: Pick<SelectOption, 'avatarLabel' | 'avatarSquare' | 'color' | 'icon'> }) {
  if (option.icon) return <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted">{option.icon}</span>;
  if (option.color !== undefined)
    return (
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: option.color ?? 'var(--stage-fallback)' }}
      />
    );
  if (option.avatarLabel) return <Avatar name={option.avatarLabel} size="sm" square={option.avatarSquare} />;
  return null;
}

export interface SelectTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  size?: SelectSize;
  open: boolean;
  /** Conteúdo quando há valor; sem ele mostra o `placeholder`. */
  children?: ReactNode;
  placeholder?: string;
  lead?: ReactNode;
  /** Mostra o "x" de limpar (um clique) quando há valor. */
  onClear?: () => void;
  /** `ghost`: sem contorno, para cabeçalhos e barras de ferramentas. */
  variant?: 'field' | 'ghost';
  /** `false` esconde a seta (data e hora: o ícone à esquerda já diz o que abre). */
  chevron?: boolean;
}

/**
 * Gatilho único dos seletores: mesma altura, raio, contorno, tipografia e
 * seta dos campos de texto (`inputBaseClass`), com os estados hover, foco,
 * aberto, desabilitado e erro (`aria-invalid`).
 */
export const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(function SelectTrigger(
  { size = 'md', open, children, placeholder, lead, onClear, variant = 'field', chevron = true, className, ...props },
  ref,
) {
  const empty = children === undefined || children === null || children === '';
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      className={cn(
        'group/trigger flex w-full min-w-0 items-center gap-2 rounded-lg px-3 text-left outline-none transition-shadow duration-150',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring-field)]',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted',
        variant === 'field'
          ? 'bg-surface ring-1 ring-inset ring-field-border hover:ring-foreground/60 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger'
          : 'font-medium hover:bg-[var(--hover)]',
        open && (variant === 'field' ? 'ring-2 ring-[var(--ring-field)]' : 'bg-[var(--hover)]'),
        HEIGHTS[size],
        className,
      )}
      {...props}
    >
      {lead}
      <span className={cn('min-w-0 flex-1 truncate', empty ? 'text-muted' : 'text-foreground')}>
        {empty ? placeholder : children}
      </span>
      {onClear && !empty && !props.disabled && (
        <span
          role="button"
          tabIndex={-1}
          aria-label="Limpar seleção"
          title="Limpar seleção"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </span>
      )}
      {chevron && (
        <ChevronDown
          aria-hidden
          className={cn('h-4 w-4 shrink-0 text-muted transition-transform duration-150', open && 'rotate-180')}
        />
      )}
    </button>
  );
});

/** Classe de UMA linha de opção: compartilhada por seletores e menu de ações. */
export const OPTION_CLASS =
  'flex min-h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground outline-none transition-colors duration-100';
export const OPTION_ACTIVE_CLASS = 'bg-surface-2';
export const GROUP_LABEL_CLASS = 'px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted';
export const SEPARATOR_CLASS = 'my-1 h-px bg-border';

/** Destaca o trecho encontrado pela busca. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-accent/20 text-foreground">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

export function OptionRow({
  id,
  option,
  active,
  selected,
  query = '',
  multiple = false,
  onPick,
  onHover,
}: {
  id: string;
  option: SelectOption;
  active: boolean;
  selected: boolean;
  query?: string;
  multiple?: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      data-active={active || undefined}
      onMouseMove={onHover}
      // mousedown não rouba o foco do campo de busca/lista.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => !option.disabled && onPick()}
      className={cn(OPTION_CLASS, active && OPTION_ACTIVE_CLASS, option.disabled && 'cursor-not-allowed opacity-50')}
    >
      <OptionLead option={option} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          <Highlight text={option.label} query={query} />
        </span>
        {option.hint && (
          <span className="block truncate text-xs text-muted">
            <Highlight text={option.hint} query={query} />
          </span>
        )}
      </span>
      {option.trailing !== undefined && <span className="shrink-0 text-xs tabular-nums text-muted">{option.trailing}</span>}
      {multiple ? (
        <span
          aria-hidden
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1 ring-inset',
            selected ? 'bg-primary text-primary-foreground ring-primary' : 'ring-field-border',
          )}
        >
          {selected && <Check className="h-3 w-3" />}
        </span>
      ) : (
        <Check aria-hidden className={cn('h-4 w-4 shrink-0 text-accent', !selected && 'invisible')} />
      )}
    </li>
  );
}
