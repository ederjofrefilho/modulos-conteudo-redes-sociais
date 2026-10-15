'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { FloatingPanel, useDismiss, useFloatingPosition } from './select/floating';

/**
 * Painel flutuante genérico ancorado a um trigger — mesma base dos seletores
 * e do `Menu` (portal posicionado, nunca sai do ecrã, fecha em clique-fora e
 * Esc), mas sem opinião sobre o conteúdo: filtro avançado, mini-formulário.
 */
export function Popover({
  trigger,
  align = 'left',
  panelClassName,
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode;
  align?: 'left' | 'right';
  panelClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const style = useFloatingPosition(open, anchorRef, panelRef, { align });

  function setOpen(next: boolean) {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }
  useDismiss(open, anchorRef, panelRef, () => setOpen(false));

  // Ao abrir, o foco entra no painel (primeiro campo), para o teclado seguir daí.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('input, button, textarea, [tabindex="0"]');
      first?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div ref={anchorRef} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen(!open) })}
      {open && (
        <FloatingPanel
          panelRef={panelRef}
          style={style}
          role="dialog"
          className={cn('overflow-y-auto overscroll-contain p-3', panelClassName ?? 'min-w-56')}
        >
          {children}
        </FloatingPanel>
      )}
    </div>
  );
}
