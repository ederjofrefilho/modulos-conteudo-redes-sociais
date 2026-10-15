import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'crimson';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary/10 text-primary dark:bg-primary/20',
  success: 'bg-success/10 text-success dark:bg-success/20',
  info: 'bg-info/10 text-info dark:bg-info/20',
  warning: 'bg-warning/10 text-warning dark:bg-warning/20',
  danger: 'bg-danger/10 text-danger dark:bg-danger/20',
  // Atenção "de marca" (negócio parado há muito tempo, sync com erro) —
  // distinto de `danger`, que fica reservado pra erro de verdade (validação,
  // exclusão). Ver plano de design, "cor com intenção".
  crimson: 'bg-crimson/10 text-crimson dark:bg-crimson/20',
};

export type BadgeSize = 'sm' | 'md';

const SIZES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
}

export function Badge({ tone = 'neutral', size = 'sm', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium', TONES[tone], SIZES[size], className)}
      {...props}
    />
  );
}
