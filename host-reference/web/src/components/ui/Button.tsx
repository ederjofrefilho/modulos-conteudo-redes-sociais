import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

// Um raio só (radius-lg) em todas as variantes; a hierarquia vem do
// preenchimento: primary = tinta cheia, secondary = superfície recuada,
// outline = contorno, ghost = sem fundo, danger = vermelho.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-[var(--shadow-sm)] hover:bg-primary-hover',
  secondary: 'bg-surface-2 text-foreground hover:bg-[var(--active)]',
  outline: 'bg-surface text-foreground ring-1 ring-inset ring-border-strong hover:bg-surface-2',
  ghost: 'text-muted hover:bg-[var(--hover)] hover:text-foreground',
  danger: 'bg-danger text-danger-foreground hover:bg-danger-hover',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  // CTA de destaque (ex.: ação primária de uma tela vazia, confirmação de
  // fluxo importante) — antes só existia sm/md, então todo CTA "grande"
  // reimplementava a altura na mão via className.
  lg: 'h-11 px-5 text-base gap-2',
};

const BASE =
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium transition-[background-color,box-shadow,color,opacity] duration-150 ease-premium disabled:cursor-not-allowed disabled:opacity-50';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Mostra um spinner e desabilita o botão — para ações assíncronas em voo. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
});

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: Variant;
  size?: Size;
  /** false para links que disparam um redirect de rota de API (ex.: início de OAuth). */
  prefetch?: boolean;
}

/** Mesma aparência do Button, mas navega — evita o padrão `<Link><Button/></Link>`. */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  { variant = 'primary', size = 'md', className, ...props },
  ref,
) {
  return (
    <Link ref={ref} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />
  );
});
