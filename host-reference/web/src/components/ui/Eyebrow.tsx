import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Label "eyebrow": bolinha accent + texto mono tracked uppercase — o padrão de
 * cabeçalho de seção do example.com. Use acima de títulos de bloco/seção.
 */
export function Eyebrow({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-wider text-muted',
        className,
      )}
      {...props}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      {children}
    </span>
  );
}
