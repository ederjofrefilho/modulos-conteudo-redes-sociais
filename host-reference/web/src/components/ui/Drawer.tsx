'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useFocusTrap, useBodyScrollLock } from '@/lib/useFocusTrap';

// Duração da transição de saída — precisa bater com `duration-200` usado nas
// classes abaixo (o unmount real só acontece depois que ela termina). Curta
// de propósito: abrir/fechar o Drawer acontece em toda ação de criação.
const CLOSE_DURATION_MS = 200;

/**
 * Painel FLUTUANTE (Kanban/formulários de criação) — não ocupa a altura
 * inteira da tela: respiro nas margens superior/inferior/direita (`inset-y-4
 * right-4`), cantos arredondados e sombra discreta, como um cartão pousado
 * sobre o resto do app em vez de uma extensão dele. Molde: `Dialog`, com as
 * mesmas correções (focus trap + lock de scroll do body) e:
 * - mount-guard de hidratação (padrão do `Toast`);
 * - entrada animada via `.animate-drawer-in` (globals.css) — fade + leve
 *   deslize/escala, não mais um slide de 100% (o painel já nasce "pousado",
 *   não precisa atravessar a tela inteira pra chegar lá);
 * - saída animada: ao fechar, mantém o painel montado durante a transição
 *   reversa e só desmonta de verdade depois de `CLOSE_DURATION_MS` — sem
 *   isso o painel some sem a animação de saída, porque o pai deixaria de
 *   renderizá-lo na hora.
 */
export function Drawer({
  open,
  title,
  children,
  footer,
  onClose,
  size = 'md',
  bodyClassName,
  headerActions,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  /** `wide`: painel de trabalho com duas colunas (composer de post, detalhe com gráfico). */
  size?: 'md' | 'wide';
  /** Substitui o corpo padrão (uma região de rolagem com respiro) quando o conteúdo organiza as próprias colunas. */
  bodyClassName?: string;
  /** Controles à direita do título, antes do fechar (badge de estado, menu). */
  headerActions?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // `rendered` fica true durante toda a animação de saída; `closing` dispara
  // as classes de transição reversa. Só desmonta (rendered=false) ao fim.
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setClosing(false);
      setRendered(true);
    } else if (rendered) {
      setClosing(true);
      closeTimer.current = setTimeout(() => {
        setRendered(false);
        setClosing(false);
      }, CLOSE_DURATION_MS);
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const panelRef = useRef<HTMLDivElement>(null);
  // Ligado a `rendered`, não a `open`: numa reabertura (depois de um fechamento
  // anterior), o painel só existe de verdade no DOM um commit depois de `open`
  // virar true (por causa do estado `rendered` acima) — se o trap dependesse de
  // `open`, tentaria focar um container ainda null nesse commit e nunca mais
  // rodaria de novo (o efeito só reexecuta quando a dependência muda).
  useFocusTrap(panelRef, rendered);
  useBodyScrollLock(rendered);

  useEffect(() => {
    if (!rendered) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rendered, onClose]);

  if (!mounted || !rendered || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 bg-scrim',
        closing ? 'opacity-0 transition-opacity duration-200 ease-premium' : 'animate-overlay-in',
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'fixed inset-y-3 left-3 right-3 z-50 flex flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-lg)] outline-none md:left-auto md:w-full',
          size === 'wide' ? 'md:max-w-[min(76rem,calc(100vw-1.5rem))]' : 'md:max-w-xl',
          closing
            ? 'translate-x-4 scale-[0.98] opacity-0 transition-all duration-200 ease-premium'
            : 'animate-drawer-in',
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border pl-5 pr-2">
          <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h2>
          <div className="ml-auto flex shrink-0 items-center gap-2 pr-1">{headerActions}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-[var(--hover)] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={bodyClassName ?? 'flex-1 overflow-y-auto p-5'}>{children}</div>
        {footer && <div className="shrink-0 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
