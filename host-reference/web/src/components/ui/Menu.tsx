'use client';

import { useEffect, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { FloatingPanel, useFloating } from './select/floating';
import { GROUP_LABEL_CLASS, SEPARATOR_CLASS } from './select/parts';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex="0"]';

/**
 * Menu de ações (variante do sistema de seletores): mesmo painel flutuante,
 * mesma altura/hover de opção. Fecha com Esc (devolve o foco ao gatilho),
 * clique fora ou ao clicar num item; setas, Home e End percorrem os itens.
 */
export function Menu({
  label = 'Mais ações',
  trigger,
  triggerClassName,
  align = 'right',
  placement = 'bottom',
  panelClassName,
  children,
}: {
  label?: string;
  /** Substitui o botão kebab padrão (ex.: avatar do usuário) — recebe {open} pra estilizar o estado ativo. */
  trigger?: (state: { open: boolean }) => ReactNode;
  /** Classes extras no `<button>` do gatilho (ex.: `w-full` quando `trigger` já preenche a largura disponível). */
  triggerClassName?: string;
  align?: 'left' | 'right';
  /** 'right' abre o painel ao lado direito do gatilho (ex.: rail estreito) — `align` é ignorado nesse modo. */
  placement?: 'bottom' | 'right';
  /** Sobrescreve a largura padrão do painel (`min-w-44`) — ex.: painel de notificações. */
  panelClassName?: string;
  /** Mantido por compatibilidade: o painel agora é sempre um portal posicionado. */
  portal?: boolean;
  children: ReactNode;
}) {
  const { open, setOpen, anchorRef, panelRef, style, close } = useFloating({ align, placement });

  useEffect(() => {
    if (!open) return;
    // O painel monta invisível até ser posicionado; foca o 1º item no quadro seguinte.
    const frame = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, panelRef]);

  function onKeyDown(e: React.KeyboardEvent) {
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % items.length;
    else if (e.key === 'ArrowUp') next = at <= 0 ? items.length - 1 : at - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Tab') {
      e.preventDefault();
      close();
      return;
    } else return;
    e.preventDefault();
    items[next]?.focus();
  }

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          !trigger &&
            'flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-[var(--hover)] hover:text-foreground aria-expanded:bg-[var(--hover)] aria-expanded:text-foreground',
          triggerClassName,
        )}
      >
        {trigger ? trigger({ open }) : <MoreHorizontal className="h-4 w-4" />}
      </button>
      {open && (
        <FloatingPanel
          panelRef={panelRef}
          style={style}
          role="menu"
          tabIndex={-1}
          aria-label={label}
          onClick={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={cn('overflow-y-auto overscroll-contain p-1 outline-none', panelClassName ?? 'min-w-44')}
        >
          {children}
        </FloatingPanel>
      )}
    </div>
  );
}

/** Item do menu — envolve links, botões ou forms com server action. */
export function MenuItem({
  children,
  destructive = false,
}: {
  children: ReactNode;
  destructive?: boolean;
}) {
  return (
    <div
      role="menuitem"
      className={cn(
        'shrink-0 rounded-md text-sm transition-colors duration-100 focus-within:bg-surface-2',
        '[&>*]:flex [&>*]:min-h-8 [&>*]:w-full [&>*]:items-center [&>*]:gap-2.5 [&>*]:rounded-md [&>*]:px-2.5 [&>*]:py-1.5 [&>*]:text-left [&>*]:outline-none',
        destructive ? 'text-danger hover:bg-danger/10 focus-within:bg-danger/10' : 'text-foreground hover:bg-surface-2',
      )}
    >
      {children}
    </div>
  );
}

/** Título de grupo dentro de um menu. */
export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className={cn(GROUP_LABEL_CLASS, 'shrink-0')}>{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className={cn(SEPARATOR_CLASS, 'shrink-0')} />;
}
