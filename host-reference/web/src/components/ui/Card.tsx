import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type CardVariant = 'default' | 'interactive' | 'elevated';

const VARIANTS: Record<CardVariant, string> = {
  default: 'shadow-[var(--shadow-sm)]',
  // Elevação nasce da interação, não do repouso (ver globals.css) — em
  // repouso é igual ao default; hover/focus sobe pra --shadow-raised e o
  // fundo esquenta um pouco (sem borda — a distinção é só cor/sombra). Usar
  // em cards clicáveis (linha de lista reimplementada como card, atalho de
  // dashboard).
  interactive:
    'cursor-pointer shadow-[var(--shadow-sm)] transition-[box-shadow,background-color] duration-200 ease-premium hover:bg-surface-2 hover:shadow-[var(--shadow-raised)] focus-visible:bg-surface-2 focus-visible:shadow-[var(--shadow-raised)]',
  elevated: 'shadow-[var(--shadow-md)]',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

// Sem borda de propósito: a separação do card contra o fundo vem só de
// --surface contra --background/--surface-2 ao redor, mais a sombra quase
// nula em repouso (ver globals.css) — continuidade em vez de contorno.
export function Card({ variant = 'default', className, ...props }: CardProps) {
  return (
    <div
      className={cn('overflow-hidden rounded-xl bg-surface', VARIANTS[variant], className)}
      {...props}
    />
  );
}

// Header separa do corpo por um bloco de cor (surface-2) em vez de uma
// linha — mesmo princípio de continuidade do Card.
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between bg-surface-2/70 px-4 py-3', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}
