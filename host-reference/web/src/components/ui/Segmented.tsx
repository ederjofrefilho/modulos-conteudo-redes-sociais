import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Com `href` o segmento é um link (troca refletida na URL, navegação do servidor). */
  href?: string;
}

const ITEM =
  'flex h-7 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-150';
const ACTIVE = 'bg-surface text-foreground shadow-[var(--shadow-sm)]';
const IDLE = 'text-muted hover:text-foreground';

/**
 * Controle segmentado (Todos | Meus, Dia | Semana | Mês): o único jeito de
 * alternar entre poucas visões da MESMA lista. O segmento ativo é sempre uma
 * "ficha" clara sobre a trilha recuada — antes cada tela escrevia o seu e em
 * duas delas o ativo tinha a mesma cor da trilha (invisível).
 * A trilha tem 32px de altura; a área clicável de cada segmento, 28px + o
 * respiro da trilha.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  /** Nome acessível do grupo (ex.: "Filtrar por responsável"). */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        if (opt.href) {
          return (
            <Link
              key={opt.value}
              href={opt.href}
              aria-current={active ? 'page' : undefined}
              className={cn(ITEM, active ? ACTIVE : IDLE)}
            >
              {opt.label}
            </Link>
          );
        }
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(opt.value)}
            className={cn(ITEM, active ? ACTIVE : IDLE)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
