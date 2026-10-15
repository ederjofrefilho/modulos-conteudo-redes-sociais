import {
  cloneElement,
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

// Exportado para casos como SearchInput, que precisa do mesmo visual com um
// ícone à esquerda — evita duplicar a string e ter as duas divergirem.
// Campo = folha com contorno de 1px (`--field-border`, >= 3:1 — WCAG 1.4.11);
// foco e erro engrossam o anel em vez de trocar a cor do fundo.
export const inputBaseClass =
  'w-full rounded-lg bg-surface px-3 py-2 text-sm text-foreground ring-1 ring-inset ring-field-border placeholder:text-muted outline-none transition-shadow duration-150 hover:ring-foreground/60 focus-visible:ring-2 focus-visible:ring-[var(--ring-field)] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger';
const base = inputBaseClass;

export type InputSize = 'sm' | 'md' | 'lg';

// 'md' (h-9) é o tamanho de sempre — sm serve pra tabela densa (edição
// inline), lg pra formulário de destaque isolado (poucos campos, tela cheia).
const HEIGHTS: Record<InputSize, string> = {
  sm: 'h-8 text-xs',
  md: 'h-9',
  lg: 'h-11 text-base',
};

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: InputSize;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = 'md', className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(base, HEIGHTS[inputSize], className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(base, 'resize-y', className)} {...props} />;
  },
);

/**
 * Envolve um único controle (Input/Textarea/Select) com label, dica e erro.
 * `error` liga aria-invalid + aria-describedby no controle filho automaticamente
 * — não é preciso repassar id/aria manualmente em cada formulário.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; required?: boolean }>;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {cloneElement(children, {
        id,
        // Preserva um `required` já passado direto ao controle filho.
        required: required ?? children.props.required,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
      })}
      {error ? (
        <span id={errorId} className="text-xs text-danger">
          {error}
        </span>
      ) : (
        hint && (
          <span id={hintId} className="text-xs text-muted">
            {hint}
          </span>
        )
      )}
    </div>
  );
}
