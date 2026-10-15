'use client';

import { FloatingPanel, useFloating } from './select/floating';
import { OPTION_CLASS } from './select/parts';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Columns3 } from 'lucide-react';
import { Checkbox } from './Checkbox';
import { EditableCell } from './DataTableEditableCell';
import { navigateWithViewTransition } from '@/lib/view-transition';
import { cn } from '@/lib/cn';
import type { ActionResult } from '@/lib/action-result';

export interface DataTableColumn {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  headerClassName?: string;
  /** Rótulo curto pro seletor de colunas (ex.: header é um <SortHeader/>, não texto puro) — cai no `key` se omitido. */
  label?: string;
  /** Nunca pode ser ocultada pelo seletor de colunas (ex.: a coluna com o nome/link da linha). */
  essential?: boolean;
  /** Começa oculta até o usuário optar por mostrar (colunas secundárias, ex.: Porte/País). */
  hiddenByDefault?: boolean;
}

export interface DataTableEditable {
  type: 'text' | 'number' | 'select' | 'date';
  /** Valor bruto atual (string) — computado no servidor, não uma função. */
  value: string;
  options?: { value: string; label: string }[];
  /**
   * Server Action "presa" ao registro (ex.: `updateAccountFieldAction.bind(null, row.id, 'industry')`)
   * — só assim uma função cruza a fronteira Server->Client Component.
   */
  onSave: (value: string) => Promise<ActionResult<unknown>>;
}

export interface DataTableRow {
  id: string;
  href?: string;
  /** Conteúdo de cada célula, já renderizado no servidor — chave = DataTableColumn.key. */
  cells: Record<string, ReactNode>;
  /** Célula editável, se houver, por coluna. */
  editable?: Record<string, DataTableEditable>;
  /** Kebab de ações da linha (ex.: `<RowActionsMenu .../>`, `Menu` com `portal`) — coluna extra ao final, só aparece se ALGUMA linha tiver `actions`. */
  actions?: ReactNode;
}

export interface DataTableProps {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  selectable?: boolean;
  /** Barra de ações em massa, JÁ renderizada (ex.: <BulkDeleteButton .../>) — os
   * componentes dentro dela leem a seleção via `useDataTableSelection()`. */
  bulkActionsSlot?: ReactNode;
  /**
   * Habilita o seletor de colunas (mostrar/ocultar) e persiste a escolha em
   * localStorage sob esta chave — precisa ser única por tabela (ex.:
   * "accounts-list"). Sem isto, todas as colunas passadas sempre aparecem
   * (comportamento de antes, sem o seletor).
   */
  storageKey?: string;
}

interface SelectionContextValue {
  selectedIds: string[];
  clearSelection: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

/** Usado pelos botões dentro de `bulkActionsSlot` para saber o que está selecionado. */
export function useDataTableSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useDataTableSelection só funciona dentro do bulkActionsSlot do DataTable.');
  return ctx;
}

/**
 * Tabela genérica que substitui o `<table>` cru reimplementado em accounts/
 * contacts/deals. Recebe células e ações JÁ RENDERIZADAS pelo Server
 * Component chamador (funções não podem cruzar a fronteira RSC — só Server
 * Actions "presas" com `.bind`, usadas em `editable.onSave`). Não reimplementa
 * busca/paginação/ordenação (isso continua em `ListControls.tsx`, via URL).
 */
export function DataTable({ columns, rows, selectable = false, bulkActionsSlot, storageKey }: DataTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();

  // Roving tabindex: só a linha "atual" fica no fluxo do Tab (as demais
  // ficam com tabIndex=-1) — sem isso, Tab parava em TODAS as N linhas uma
  // por uma pra sair da tabela. `j`/`k` movem o foco real entre linhas
  // (rastreado por id, não índice — a lista vem do servidor e pode mudar
  // de ordem/página sem remontar o componente).
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const focusableRows = useMemo(() => rows.filter((r) => r.href), [rows]);
  const activeRowId = focusedRowId ?? focusableRows[0]?.id;

  function focusRowAt(delta: 1 | -1, fromId: string) {
    const idx = focusableRows.findIndex((r) => r.id === fromId);
    const next = focusableRows[idx + delta];
    if (!next) return;
    rowRefs.current.get(next.id)?.focus();
  }

  // Estado inicial (SSR-safe): só o que `hiddenByDefault` já marca — o
  // localStorage só é lido depois de montar (client-only), pra não haver
  // divergência entre o HTML do servidor e a 1ª renderização do cliente.
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.hiddenByDefault).map((c) => c.key)),
  );

  useEffect(() => {
    if (!storageKey) return;
    const raw = window.localStorage.getItem(`datatable-columns:${storageKey}`);
    if (raw == null) return;
    try {
      const saved: string[] = JSON.parse(raw);
      setHidden(new Set(saved));
    } catch {
      // preferência corrompida/antiga — ignora, cai no padrão.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function toggleColumn(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (storageKey) {
        window.localStorage.setItem(`datatable-columns:${storageKey}`, JSON.stringify(Array.from(next)));
      }
      return next;
    });
  }

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.essential || !hidden.has(c.key)),
    [columns, hidden],
  );

  const hasActions = useMemo(() => rows.some((r) => r.actions), [rows]);

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  return (
    <SelectionContext.Provider value={{ selectedIds: Array.from(selected), clearSelection }}>
      <div className="flex min-h-0 flex-1 flex-col">
        {storageKey && !(selectable && selected.size > 0 && bulkActionsSlot) && (
          <div className="flex shrink-0 items-center justify-end bg-surface-2/60 px-3 py-2">
            <ColumnPickerButton columns={columns} hidden={hidden} onToggle={toggleColumn} />
          </div>
        )}
        {selectable && selected.size > 0 && bulkActionsSlot && (
          <div className="flex shrink-0 items-center gap-3 bg-surface-2 px-4 py-2.5 text-sm">
            <span className="font-medium text-foreground">{selected.size} selecionado(s)</span>
            <div className="flex items-center gap-2">{bulkActionsSlot}</div>
            <button
              type="button"
              onClick={clearSelection}
              className="ml-auto text-xs text-muted transition-colors hover:text-foreground"
            >
              Limpar seleção
            </button>
          </div>
        )}
        {/* min-h-0 é o que faz este flex-1 realmente respeitar a altura do pai
            e rolar por dentro (rolar a tabela) em vez de esticar e empurrar o
            scroll pra seção inteira (rolar a página/bloco) — pegadinha clássica
            de flexbox (min-height:auto por padrão). Cabeçalho sticky (nos <th>,
            não no <thead> — mais confiável entre navegadores) continua visível
            durante a rolagem. `scroll-pt-11`: ao navegar por Tab, a linha
            focada para abaixo do cabeçalho fixo, nunca escondida atrás dele. */}
        <div className="min-h-0 flex-1 scroll-pt-11 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted">
                {selectable && (
                  <th className="sticky top-0 z-10 w-10 bg-surface-2 px-4 py-2.5">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={toggleAll}
                      aria-label="Selecionar todos"
                    />
                  </th>
                )}
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'sticky top-0 z-10 bg-surface-2 px-4 py-2.5',
                      col.align === 'right' && 'text-right',
                      col.headerClassName,
                    )}
                  >
                    {col.header}
                  </th>
                ))}
                {hasActions && (
                  <th className="sticky top-0 z-10 w-10 bg-surface-2 px-2 py-2.5" aria-hidden />
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(row.id, el);
                    else rowRefs.current.delete(row.id);
                  }}
                  data-href={row.href}
                  tabIndex={row.href ? (row.id === activeRowId ? 0 : -1) : undefined}
                  onFocus={() => row.href && setFocusedRowId(row.id)}
                  onClick={(e) => {
                    if (!row.href) return;
                    if ((e.target as HTMLElement).closest('a, button, input')) return;
                    navigateWithViewTransition(router, row.href);
                  }}
                  onKeyDown={(e) => {
                    if (!row.href) return;
                    const inField = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]');
                    if (!inField && (e.key === 'j' || e.key === 'k')) {
                      e.preventDefault();
                      focusRowAt(e.key === 'j' ? 1 : -1, row.id);
                      return;
                    }
                    if ((e.key !== 'Enter' && e.key !== ' ') || (e.target as HTMLElement).closest('a, button, input')) return;
                    e.preventDefault();
                    navigateWithViewTransition(router, row.href);
                  }}
                  className={cn(
                    'scroll-mt-10 transition-colors odd:bg-surface-2/30 hover:bg-surface-2/70',
                    row.href && 'cursor-pointer',
                  )}
                >
                  {selectable && (
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                        aria-label="Selecionar linha"
                      />
                    </td>
                  )}
                  {visibleColumns.map((col) => {
                    const editable = row.editable?.[col.key];
                    return (
                      <td key={col.key} className={cn('px-4 py-2.5', col.align === 'right' && 'text-right')}>
                        {editable ? (
                          <EditableCell editable={editable} fallback={row.cells[col.key]} />
                        ) : (
                          row.cells[col.key]
                        )}
                      </td>
                    );
                  })}
                  {hasActions && (
                    <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      {row.actions}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SelectionContext.Provider>
  );
}

/**
 * Botão "Colunas" com painel de checkboxes — não reusa `ui/Menu.tsx` de
 * propósito: aquele fecha o dropdown em QUALQUER clique dentro dele (bom
 * pra itens de ação única, ruim aqui — marcar 3 colunas fecharia o painel a
 * cada clique). Fecha só em Esc ou clique fora, igual ao `Combobox`.
 */
function ColumnPickerButton({
  columns,
  hidden,
  onToggle,
}: {
  columns: DataTableColumn[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
}) {
  const { open, setOpen, anchorRef, panelRef, style } = useFloating({ align: 'right' });
  const toggleable = columns.filter((c) => !c.essential);

  if (toggleable.length === 0) return null;

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors duration-150 hover:bg-[var(--hover)] hover:text-foreground aria-expanded:bg-[var(--hover)] aria-expanded:text-foreground"
      >
        <Columns3 className="h-3.5 w-3.5" /> Colunas
      </button>
      {open && (
        <FloatingPanel panelRef={panelRef} style={style} aria-label="Colunas visíveis" className="min-w-48 overflow-y-auto p-1">
          {toggleable.map((col) => (
            <label key={col.key} className={cn(OPTION_CLASS, 'shrink-0 hover:bg-surface-2')}>
              <Checkbox checked={!hidden.has(col.key)} onChange={() => onToggle(col.key)} />
              {col.label ?? col.key}
            </label>
          ))}
        </FloatingPanel>
      )}
    </div>
  );
}
