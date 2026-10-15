import { Eyebrow } from './Eyebrow';
import { cn } from '@/lib/cn';

/**
 * Agrupa um bloco de campos relacionados dentro de um formulário, com um
 * label de seção (Eyebrow) — substitui o Card único e plano com todos os
 * campos misturados.
 */
export function FormSection({
  eyebrow,
  title,
  description,
  className,
  children,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      {(eyebrow || title || description) && (
        <div>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          {title && <h3 className="mt-1 text-sm font-semibold text-foreground">{title}</h3>}
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      )}
      <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>{children}</div>
    </section>
  );
}
