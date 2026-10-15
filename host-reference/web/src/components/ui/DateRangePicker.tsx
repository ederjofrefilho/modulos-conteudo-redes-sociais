'use client';

import { useEffect, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { FloatingPanel, useFloating } from './select/floating';
import { SelectTrigger, type SelectSize } from './select/parts';

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const short = (k: string, year: boolean) =>
  fromKey(k).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', ...(year ? { year: 'numeric' } : {}) });

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Intervalo de datas num só campo (sistema de seletores): o primeiro clique
 * marca o início, o segundo fecha o intervalo — na ordem que for. Valores em
 * "AAAA-MM-DD"; vazio nos dois = sem intervalo. Substitui o par de campos
 * "De" / "Até" nas linhas de ferramentas.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  min,
  max,
  inputSize,
  clearable = false,
  className,
  placeholder = 'Intervalo de datas',
  'aria-label': ariaLabel = 'Intervalo de datas',
}: {
  from: string;
  to: string;
  onChange: (range: DateRange) => void;
  min?: string;
  max?: string;
  inputSize?: SelectSize;
  /** Mostra o "x" que limpa o intervalo (filtro opcional). */
  clearable?: boolean;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
}) {
  const { open, setOpen, anchorRef, panelRef, style, close } = useFloating();
  const [cursor, setCursor] = useState(() => (to ? fromKey(to) : new Date()));
  // Início escolhido à espera do fim; `hover` desenha a prévia do intervalo.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setCursor(to ? fromKey(to) : new Date());
    setAnchor(null);
    setHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const blocked = (k: string) => Boolean((min && k < min) || (max && k > max));

  function pick(k: string) {
    if (blocked(k)) return;
    if (!anchor) {
      setAnchor(k);
      return;
    }
    const [a, b] = anchor <= k ? [anchor, k] : [k, anchor];
    onChange({ from: a, to: b });
    close();
  }

  const end = anchor ? (hover ?? anchor) : to;
  const lo = anchor ? (anchor <= end ? anchor : end) : from;
  const hi = anchor ? (anchor <= end ? end : anchor) : to;

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const todayKey = key(new Date());

  const label =
    from && to
      ? from === to
        ? short(from, true)
        : `${short(from, from.slice(0, 4) !== to.slice(0, 4))} – ${short(to, true)}`
      : undefined;

  function onGridKey(e: React.KeyboardEvent) {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const at = (e.target as HTMLElement).dataset.day;
    if (!at) return;
    const next = addDays(fromKey(at), delta);
    setCursor(next);
    if (anchor) setHover(key(next));
    requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>(`[data-day="${key(next)}"]`)?.focus({ preventScroll: true }),
    );
  }

  return (
    <div className={cn('relative min-w-0 shrink-0', className)}>
      <SelectTrigger
        ref={anchorRef}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        size={inputSize}
        open={open}
        placeholder={placeholder}
        lead={<CalendarRange className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
        chevron={false}
        onClear={clearable && from && to ? () => onChange({ from: '', to: '' }) : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && e.key === 'ArrowDown') (e.preventDefault(), setOpen(true));
        }}
        className="tabular-nums"
      >
        {label}
      </SelectTrigger>
      {open && (
        <FloatingPanel
          panelRef={panelRef}
          style={style}
          aria-label="Escolher intervalo de datas"
          className="w-72 overflow-y-auto p-3"
        >
          <div className="flex shrink-0 items-center justify-between">
            <span className="inline-block pl-1 text-sm font-semibold text-foreground first-letter:uppercase">
              {cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <span className="flex gap-0.5">
              {[-1, 1].map((step) => (
                <button
                  key={step}
                  type="button"
                  aria-label={step < 0 ? 'Mês anterior' : 'Próximo mês'}
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + step, 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground"
                >
                  {step < 0 ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ))}
            </span>
          </div>
          <div
            role="grid"
            onKeyDown={onGridKey}
            onMouseLeave={() => setHover(null)}
            className="mt-1 grid shrink-0 grid-cols-7 gap-y-0.5 text-center"
          >
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="flex h-7 items-center justify-center text-xs font-medium text-muted">
                {w}
              </span>
            ))}
            {days.map((d) => {
              const k = key(d);
              const outside = d.getMonth() !== cursor.getMonth();
              const edge = Boolean(lo && hi) && (k === lo || k === hi);
              const inside = Boolean(lo && hi) && k > lo && k < hi;
              return (
                <button
                  key={k}
                  type="button"
                  data-day={k}
                  disabled={blocked(k)}
                  tabIndex={k === (hi || todayKey) ? 0 : -1}
                  aria-pressed={edge || inside}
                  aria-label={d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  onClick={() => pick(k)}
                  onMouseEnter={() => anchor && setHover(k)}
                  className={cn(
                    'flex h-8 w-full items-center justify-center text-sm tabular-nums outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-[var(--ring-field)] disabled:cursor-not-allowed disabled:opacity-30',
                    edge
                      ? 'rounded-md bg-primary font-semibold text-primary-foreground'
                      : inside
                        ? 'bg-surface-2 text-foreground'
                        : cn('rounded-md hover:bg-surface-2', outside ? 'text-muted/60' : 'text-foreground'),
                    !edge && k === todayKey && 'font-semibold underline underline-offset-4',
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <p className="mt-2 shrink-0 text-xs text-muted" aria-live="polite">
            {anchor ? 'Agora escolha o último dia.' : 'Escolha o primeiro e o último dia.'}
          </p>
        </FloatingPanel>
      )}
    </div>
  );
}
