'use client';

import { useEffect, useId, useMemo, useState, type ChangeEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { FloatingPanel, useFloating } from './select/floating';
import { Listbox } from './select/Listbox';
import { SelectTrigger, type SelectOption, type SelectSize } from './select/parts';

type Fake = ChangeEvent<HTMLInputElement>;
const fake = (value: string, name = '') => ({ target: { value, name }, currentTarget: { value, name } }) as unknown as Fake;

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface CommonProps {
  value?: string;
  onChange?: (e: Fake) => void;
  inputSize?: SelectSize;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  className?: string;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

const TIME_OPTIONS: SelectOption[] = Array.from({ length: 96 }, (_, i) => {
  const v = `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`;
  return { value: v, label: v };
});

/** "9", "930", "9h30", "09:30" → "09:30"; inválido → null. */
function parseTime(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\s*[:h.]?\s*(\d{2})?$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  return h > 23 || min > 59 ? null : `${pad(h)}:${pad(min)}`;
}

/**
 * Hora (HH:MM): o mesmo gatilho e painel dos seletores, de 15 em 15 minutos;
 * digitar "9h40" ou "0940" aceita um horário fora da lista.
 */
export function TimePicker({
  value = '',
  onChange,
  inputSize,
  disabled,
  name,
  className,
  placeholder = '--:--',
  required: _required,
  ...aria
}: CommonProps) {
  const listId = useId();
  const { open, setOpen, anchorRef, panelRef, style, close } = useFloating({ matchWidth: true });
  const options = useMemo(
    () => (value && !TIME_OPTIONS.some((o) => o.value === value) ? [{ value, label: value }, ...TIME_OPTIONS] : TIME_OPTIONS),
    [value],
  );
  const commit = (v: string) => {
    close();
    if (v !== value) onChange?.(fake(v, name));
  };
  return (
    <div className={cn('relative min-w-0', !/(^|\s)w-/.test(className ?? '') && 'w-full', className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <SelectTrigger
        {...aria}
        ref={anchorRef}
        size={inputSize}
        open={open}
        disabled={disabled}
        placeholder={placeholder}
        lead={<Clock className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
        chevron={false}
        onClick={() => setOpen((v) => !v)}
        className="tabular-nums"
      >
        {value || undefined}
      </SelectTrigger>
      {open && (
        <FloatingPanel panelRef={panelRef} style={style} className="min-w-32">
          <Listbox
            id={listId}
            options={options}
            selected={value ? [value] : []}
            searchable
            searchPlaceholder="Ex.: 9h30"
            emptyLabel="Digite um horário, como 14:45."
            onCreate={(text) => {
              const t = parseTime(text);
              if (t) commit(t);
            }}
            createLabel={(text) => (parseTime(text) ? `Usar ${parseTime(text)}` : 'Horário inválido')}
            onPick={(o) => commit(o.value)}
            onTab={() => close()}
          />
        </FloatingPanel>
      )}
    </div>
  );
}

/**
 * Data (ou data e hora, com `type="datetime-local"`) no sistema de seletores:
 * atalhos Hoje / Amanhã / Próxima semana, calendário do mês navegável por
 * setas e, quando há hora, um `TimePicker` no rodapé. Mesma API do campo
 * nativo: `value` em "AAAA-MM-DD" ou "AAAA-MM-DDTHH:MM" e `onChange(e)` com
 * `e.target.value`.
 */
export function DatePicker({
  value = '',
  onChange,
  type = 'date',
  min,
  max,
  inputSize,
  disabled,
  required,
  name,
  className,
  placeholder,
  ...aria
}: CommonProps & { type?: 'date' | 'datetime-local'; min?: string; max?: string }) {
  const withTime = type === 'datetime-local';
  const [dateKey = '', timePart = ''] = value.split('T');
  const time = timePart.slice(0, 5);
  const { open, setOpen, anchorRef, panelRef, style, close } = useFloating();
  const today = new Date();
  const [cursor, setCursor] = useState(() => (dateKey ? fromKey(dateKey) : today));
  useEffect(() => {
    if (open) setCursor(dateKey ? fromKey(dateKey) : new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const emit = (d: string, t: string) => onChange?.(fake(d ? (withTime ? `${d}T${t || '09:00'}` : d) : '', name));
  const minKey = min?.slice(0, 10);
  const maxKey = max?.slice(0, 10);
  const blocked = (k: string) => Boolean((minKey && k < minKey) || (maxKey && k > maxKey));

  function pickDay(k: string) {
    if (blocked(k)) return;
    emit(k, time);
    if (!withTime) close();
  }

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const todayKey = key(today);
  const nextMonday = addDays(today, ((8 - today.getDay()) % 7) || 7);
  const shortcuts = [
    { label: 'Hoje', k: todayKey },
    { label: 'Amanhã', k: key(addDays(today, 1)) },
    { label: 'Próxima semana', k: key(nextMonday) },
  ];

  const label = dateKey
    ? fromKey(dateKey).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      (withTime && time ? `, ${time}` : '')
    : undefined;

  function onGridKey(e: React.KeyboardEvent) {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const from = (e.target as HTMLElement).dataset.day;
    if (!from) return;
    const next = addDays(fromKey(from), delta);
    setCursor(next);
    requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>(`[data-day="${key(next)}"]`)?.focus({ preventScroll: true }),
    );
  }

  return (
    <div className={cn('relative min-w-0', !/(^|\s)w-/.test(className ?? '') && 'w-full', className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <SelectTrigger
        {...aria}
        ref={anchorRef}
        aria-haspopup="dialog"
        size={inputSize}
        open={open}
        disabled={disabled}
        placeholder={placeholder ?? (withTime ? 'Escolha data e hora' : 'Escolha uma data')}
        lead={<CalendarDays className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
        chevron={false}
        onClear={required ? undefined : () => emit('', '')}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && e.key === 'ArrowDown') (e.preventDefault(), setOpen(true));
        }}
      >
        {label}
      </SelectTrigger>
      {open && (
        <FloatingPanel panelRef={panelRef} style={style} aria-label="Escolher data" className="w-72 overflow-y-auto p-3">
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {shortcuts.map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={blocked(s.k)}
                onClick={() => pickDay(s.k)}
                className={cn(
                  'h-7 rounded-md px-2 text-xs font-medium ring-1 ring-inset ring-border transition-colors duration-150 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40',
                  s.k === dateKey ? 'bg-surface-2 text-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex shrink-0 items-center justify-between">
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
          <div role="grid" onKeyDown={onGridKey} className="mt-1 grid shrink-0 grid-cols-7 gap-y-0.5 text-center">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="flex h-7 items-center justify-center text-xs font-medium text-muted">
                {w}
              </span>
            ))}
            {days.map((d) => {
              const k = key(d);
              const outside = d.getMonth() !== cursor.getMonth();
              const isSelected = k === dateKey;
              return (
                <button
                  key={k}
                  type="button"
                  data-day={k}
                  disabled={blocked(k)}
                  tabIndex={isSelected || (!dateKey && k === todayKey) ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-label={d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  onClick={() => pickDay(k)}
                  className={cn(
                    'mx-auto flex h-8 w-8 items-center justify-center rounded-md text-sm tabular-nums outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-[var(--ring-field)] disabled:cursor-not-allowed disabled:opacity-30',
                    isSelected
                      ? 'bg-primary font-semibold text-primary-foreground'
                      : cn('hover:bg-surface-2', outside ? 'text-muted/60' : 'text-foreground'),
                    !isSelected && k === todayKey && 'font-semibold ring-1 ring-inset ring-field-border',
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          {withTime && (
            <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-border pt-3">
              <span className="text-xs font-medium text-muted">Hora</span>
              <TimePicker
                inputSize="sm"
                aria-label="Hora"
                value={time}
                onChange={(e) => emit(dateKey || todayKey, e.target.value)}
                className="w-28"
              />
              <button
                type="button"
                onClick={() => close()}
                className="ml-auto h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover"
              >
                Pronto
              </button>
            </div>
          )}
        </FloatingPanel>
      )}
    </div>
  );
}
