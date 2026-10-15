import { cn } from '@/lib/cn';

/**
 * Etapa de pipeline como badge: ponto cheio na cor da etapa (`Stage.color`,
 * definida em /settings/pipelines) sobre um fundo tonal da mesma cor. O texto
 * fica sempre em `--foreground` — a cor vem do banco e pode ser qualquer uma,
 * então ela nunca é a cor do texto (contraste garantido em qualquer tema).
 * Sem cor no banco, cai em `--stage-fallback`.
 */
export function StageBadge({
  name,
  color,
  size = 'sm',
  className,
}: {
  name: string;
  color?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full font-medium text-foreground',
        'bg-[color-mix(in_srgb,var(--stage)_14%,transparent)] dark:bg-[color-mix(in_srgb,var(--stage)_24%,transparent)]',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        className,
      )}
      style={{ '--stage': color ?? 'var(--stage-fallback)' } as React.CSSProperties}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--stage)]" />
      <span className="truncate">{name}</span>
    </span>
  );
}
