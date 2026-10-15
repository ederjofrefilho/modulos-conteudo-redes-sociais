import { forwardRef, type InputHTMLAttributes, type MutableRefObject } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Estado visual "parcialmente selecionado" (ex.: cabeçalho de seleção em massa) — não é um atributo HTML nativo, precisa ser setado via ref. */
  indeterminate?: boolean;
}

/**
 * Checkbox estilizado (o nativo não é temável de forma consistente entre
 * navegadores). O `<input>` real fica visualmente escondido mas continua no
 * DOM (acessibilidade, formulários nativos, comportamento de foco/teclado).
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, checked, indeterminate, disabled, ...props },
  ref,
) {
  return (
    <span className={cn('relative inline-flex h-4 w-4 shrink-0 items-center justify-center', className)}>
      <input
        ref={(node) => {
          if (node) node.indeterminate = Boolean(indeterminate);
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as MutableRefObject<HTMLInputElement | null>).current = node;
        }}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="peer absolute inset-0 m-0 h-4 w-4 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none flex h-4 w-4 items-center justify-center rounded transition-colors',
          checked || indeterminate
            ? 'bg-primary text-primary-foreground'
            : 'bg-surface ring-1 ring-inset ring-field-border',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]',
          disabled && 'opacity-50',
        )}
      >
        {indeterminate ? <Minus className="h-3 w-3" /> : checked ? <Check className="h-3 w-3" /> : null}
      </span>
    </span>
  );
});
