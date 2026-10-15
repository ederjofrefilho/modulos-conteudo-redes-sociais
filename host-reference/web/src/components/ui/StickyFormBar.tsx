import { cn } from '@/lib/cn';

/**
 * Barra de ação inferior de um formulário longo. `sticky` dentro do próprio
 * container de scroll — ao contrário de `fixed left-60`, não depende de saber
 * a largura da sidebar e não quebra quando ela colapsa em telas menores.
 */
export function StickyFormBar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 flex items-center justify-end gap-3 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-md)] ring-1 ring-inset ring-border',
        className,
      )}
    >
      {children}
    </div>
  );
}
