'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { useFocusTrap, useBodyScrollLock } from '@/lib/useFocusTrap';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Diálogo modal leve (overlay + card). Fecha com Esc e clique fora, trava o
 * foco dentro do card (Tab/Shift+Tab não escapam) e o scroll do body enquanto
 * aberto — devolve o foco a quem abriu ao fechar.
 * Usado principalmente para confirmações destrutivas (substitui window.confirm).
 */
export function Dialog({
  open,
  title,
  children,
  onClose,
  size = 'md',
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** `lg` (768px) para formulários com um StepRail/painel de detalhe; default preserva os ~11 usos existentes em 448px. */
  size?: 'md' | 'lg';
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef, open);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 animate-overlay-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'flex max-h-full w-full flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-lg)] outline-none animate-content-enter',
          size === 'lg' ? 'max-w-3xl' : 'max-w-md',
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border pl-5 pr-2">
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-[var(--hover)] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Confirmação destrutiva pronta: mensagem + Cancelar/Confirmar. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Excluir',
  pendingLabel = 'Excluindo...',
  pending = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  /** Texto do botão enquanto a ação corre (padrão: "Excluindo..."). */
  pendingLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm} disabled={pending}>
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
