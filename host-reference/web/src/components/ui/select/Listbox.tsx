'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { GROUP_LABEL_CLASS, OPTION_ACTIVE_CLASS, OPTION_CLASS, OptionRow, SEPARATOR_CLASS, type SelectOption } from './parts';

type Entry =
  | { kind: 'label'; key: string; text: string }
  | { kind: 'option'; key: string; option: SelectOption; index: number }
  | { kind: 'create'; key: string; text: string; index: number };

/**
 * Conteúdo do painel de qualquer seletor: busca opcional (filtro local ou
 * assíncrono com debounce), grupos, recentes, "Criar «texto»", estados de
 * carregando e vazio, e toda a navegação por teclado (setas, Home/End,
 * Enter, digitar para saltar). O foco fica no campo de busca ou na lista;
 * a opção ativa é anunciada por `aria-activedescendant`.
 */
export function Listbox({
  id,
  options,
  loadOptions,
  selected,
  multiple = false,
  searchable = false,
  searchPlaceholder = 'Buscar...',
  emptyLabel = 'Nada encontrado.',
  recents,
  createLabel,
  onCreate,
  footer,
  onPick,
  onTab,
}: {
  id: string;
  options?: SelectOption[];
  loadOptions?: (query: string) => Promise<SelectOption[]>;
  selected: string[];
  multiple?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Mostradas no topo, sob "Recentes", enquanto o campo de busca está vazio. */
  recents?: SelectOption[];
  /** Texto da linha de criar; recebe o que foi digitado. */
  createLabel?: (text: string) => string;
  onCreate?: (text: string) => void;
  footer?: ReactNode;
  onPick: (option: SelectOption) => void;
  onTab: () => void;
}) {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(Boolean(loadOptions));
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });

  // O painel monta invisível até ser posicionado (elemento invisível não
  // recebe foco): foca no quadro seguinte, já visível.
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      (searchable ? inputRef.current : listRef.current)?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [searchable]);

  // Busca assíncrona com debounce; respostas fora de ordem são descartadas.
  useEffect(() => {
    if (!loadOptions) return;
    let alive = true;
    setLoading(true);
    const timer = setTimeout(
      () => {
        loadOptions(query)
          .then((r) => alive && setRemote(r))
          .catch(() => alive && setRemote([]))
          .finally(() => alive && setLoading(false));
      },
      query ? 250 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, loadOptions]);

  const q = query.trim();
  const items = useMemo(() => {
    if (loadOptions) return remote;
    const all = options ?? [];
    if (!q) return all;
    const needle = q.toLowerCase();
    return all.filter((o) => o.label.toLowerCase().includes(needle) || o.hint?.toLowerCase().includes(needle));
  }, [loadOptions, remote, options, q]);

  const entries = useMemo(() => {
    const out: Entry[] = [];
    let index = 0;
    const seen = new Set<string>();
    if (!q && recents?.length) {
      out.push({ kind: 'label', key: 'g:recentes', text: 'Recentes' });
      for (const option of recents) {
        seen.add(option.value);
        out.push({ kind: 'option', key: `r:${option.value}`, option, index: index++ });
      }
    }
    let group: string | undefined = seen.size ? '\u0000' : undefined;
    for (const option of items) {
      if (seen.has(option.value)) continue;
      const g = option.group ?? (seen.size ? 'Todos' : undefined);
      if (g !== group) {
        group = g;
        if (g) out.push({ kind: 'label', key: `g:${g}:${out.length}`, text: g });
      }
      out.push({ kind: 'option', key: `o:${option.value}`, option, index: index++ });
    }
    const exact = items.some((o) => o.label.toLowerCase() === q.toLowerCase());
    if (onCreate && q && !exact && !loading) out.push({ kind: 'create', key: 'create', text: q, index: index++ });
    return out;
  }, [items, recents, q, onCreate, loading]);

  const selectable = entries.filter((e): e is Exclude<Entry, { kind: 'label' }> => e.kind !== 'label');

  // Ao abrir (ou mudar a lista), a opção ativa é a selecionada, senão a primeira.
  useEffect(() => {
    const at = selectable.findIndex((e) => e.kind === 'option' && selected.includes(e.option.value));
    setActive(q ? 0 : at >= 0 ? at : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, q, loading]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [active, entries.length]);

  function choose(entry: (typeof selectable)[number] | undefined) {
    if (!entry) return;
    if (entry.kind === 'create') onCreate?.(entry.text);
    else if (!entry.option.disabled) onPick(entry.option);
  }

  function move(delta: number) {
    if (selectable.length === 0) return;
    setActive((i) => Math.max(0, Math.min(selectable.length - 1, i + delta)));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
    else if (e.key === 'PageDown') (e.preventDefault(), move(8));
    else if (e.key === 'PageUp') (e.preventDefault(), move(-8));
    else if (e.key === 'Home' && !searchable) (e.preventDefault(), setActive(0));
    else if (e.key === 'End' && !searchable) (e.preventDefault(), setActive(selectable.length - 1));
    else if (e.key === 'Enter' || (e.key === ' ' && !searchable)) {
      e.preventDefault();
      choose(selectable[active]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onTab();
    } else if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Digitar para saltar: letras seguidas em menos de 600ms formam um prefixo.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const at = selectable.findIndex(
        (s) => s.kind === 'option' && s.option.label.toLowerCase().startsWith(typed.current.text),
      );
      if (at >= 0) setActive(at);
    }
  }

  const activeEntry = selectable[active];
  const activeId = activeEntry ? `${id}-opt-${activeEntry.index}` : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      {searchable && (
        <div className="relative shrink-0 border-b border-border">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            role="combobox"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-activedescendant={activeId}
            autoComplete="off"
            className="h-9 w-full bg-transparent pl-9 pr-8 text-sm text-foreground outline-none placeholder:text-muted"
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
        </div>
      )}
      <ul
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        aria-multiselectable={multiple || undefined}
        aria-activedescendant={searchable ? undefined : activeId}
        tabIndex={-1}
        className="max-h-72 min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 outline-none"
      >
        {loading && selectable.length === 0 && (
          <li className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Buscando...
          </li>
        )}
        {!loading && selectable.length === 0 && <li className="px-2.5 py-2 text-sm text-muted">{emptyLabel}</li>}
        {entries.map((entry) => {
          if (entry.kind === 'label')
            return (
              <li key={entry.key} role="presentation" className={GROUP_LABEL_CLASS}>
                {entry.text}
              </li>
            );
          const isActive = entry.index === active;
          if (entry.kind === 'create')
            return (
              <li key={entry.key} role="presentation">
                {selectable.length > 1 && <div className={SEPARATOR_CLASS} />}
                <div
                  id={`${id}-opt-${entry.index}`}
                  role="option"
                  aria-selected={false}
                  data-active={isActive || undefined}
                  onMouseMove={() => setActive(entry.index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(entry)}
                  className={cn(OPTION_CLASS, 'font-medium', isActive && OPTION_ACTIVE_CLASS)}
                >
                  <Plus className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {createLabel ? createLabel(entry.text) : `Criar «${entry.text}»`}
                  </span>
                </div>
              </li>
            );
          return (
            <OptionRow
              key={entry.key}
              id={`${id}-opt-${entry.index}`}
              option={entry.option}
              active={isActive}
              selected={selected.includes(entry.option.value)}
              query={searchable ? q : ''}
              multiple={multiple}
              onPick={() => choose(entry)}
              onHover={() => setActive(entry.index)}
            />
          );
        })}
      </ul>
      {footer && <div className="shrink-0 border-t border-border p-1">{footer}</div>}
    </div>
  );
}
