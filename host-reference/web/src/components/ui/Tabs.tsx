'use client';

import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  idPrefix: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error(`<${component}> precisa estar dentro de <Tabs>`);
  return ctx;
}

export function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  className,
  children,
}: {
  defaultValue?: string;
  /** Modo controlado (ex.: aba refletida na URL via searchParams) — se omitido, o estado fica interno. */
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const idPrefix = useId();
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const value = controlledValue ?? internalValue;

  function setValue(next: string) {
    if (controlledValue === undefined) setInternalValue(next);
    onValueChange?.(next);
  }

  return (
    <TabsContext.Provider value={{ value, setValue, idPrefix }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  sticky = false,
  children,
}: {
  className?: string;
  /** Fixa a barra de abas no topo da região de rolagem (fichas). */
  sticky?: boolean;
  children: ReactNode;
}) {
  const list = (
    <div
      role="tablist"
      className={cn(
        // Rola na horizontal quando as abas não cabem (fichas no celular) —
        // nunca quebra o rótulo em várias linhas.
        'flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-surface-2 p-0.5 [scrollbar-width:none]',
        className,
      )}
    >
      {children}
    </div>
  );
  if (!sticky) return list;
  return <div className="sticky top-0 z-10 bg-background pb-2">{list}</div>;
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const { value: active, setValue, idPrefix } = useTabsContext('TabsTrigger');
  const selected = active === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${idPrefix}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${idPrefix}-panel-${value}`}
      onClick={() => setValue(value)}
      className={cn(
        'flex h-8 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-150',
        selected
          ? 'bg-surface text-foreground shadow-[var(--shadow-sm)]'
          : 'text-muted hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const { value: active, idPrefix } = useTabsContext('TabsContent');
  if (active !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-tab-${value}`}
      className={cn('animate-content-enter', className)}
    >
      {children}
    </div>
  );
}
