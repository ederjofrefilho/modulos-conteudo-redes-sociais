'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

/**
 * Base de TODO painel flutuante da app (seletor, menu de ações, popover,
 * calendário): portal no `<body>`, posição `fixed` calculada a partir do
 * gatilho, vira para cima quando não cabe abaixo, nunca sai do ecrã e fica
 * acima de diálogos e drawers. Um painel só, para a sombra, o raio e a
 * animação serem os mesmos em todo o lado.
 */

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const MARGIN = 8;
const GAP = 4;

export type FloatingAlign = 'left' | 'right';
/** `right` alinha o fundo do painel ao do gatilho (menus no rodapé); `right-start`, o topo. */
export type FloatingPlacement = 'bottom' | 'right' | 'right-start';

interface Position {
  top: number;
  left: number;
  minWidth?: number;
  maxHeight: number;
  ready: boolean;
}

/** Pilha de painéis abertos: o Esc fecha só o de cima (o mais interno). */
const openStack: object[] = [];

const HIDDEN: Position = { top: 0, left: 0, maxHeight: 0, ready: false };

function compute(
  anchor: HTMLElement,
  panel: HTMLElement,
  opts: { align: FloatingAlign; placement: FloatingPlacement; matchWidth: boolean },
): Position {
  const a = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minWidth = opts.matchWidth ? a.width : undefined;
  const width = Math.max(panel.offsetWidth, minWidth ?? 0);
  // Altura natural do conteúdo (sem o teto que nós mesmos aplicamos).
  const natural = panel.scrollHeight + (panel.offsetHeight - panel.clientHeight);

  if (opts.placement === 'right' || opts.placement === 'right-start') {
    let left = a.right + MARGIN;
    if (left + width > vw - MARGIN) left = Math.max(MARGIN, a.left - width - MARGIN);
    const maxHeight = vh - MARGIN * 2;
    const height = Math.min(natural, maxHeight);
    const wanted = opts.placement === 'right' ? a.bottom - height : a.top;
    const top = Math.max(MARGIN, Math.min(wanted, vh - height - MARGIN));
    return { top, left, minWidth, maxHeight, ready: true };
  }

  const below = vh - a.bottom - GAP - MARGIN;
  const above = a.top - GAP - MARGIN;
  const openUp = natural > below && above > below;
  const maxHeight = Math.max(120, openUp ? above : below);
  const height = Math.min(natural, maxHeight);
  const top = openUp ? Math.max(MARGIN, a.top - GAP - height) : a.bottom + GAP;
  let left = opts.align === 'right' ? a.right - width : a.left;
  if (left + width > vw - MARGIN) left = vw - width - MARGIN;
  if (left < MARGIN) left = MARGIN;
  return { top, left, minWidth, maxHeight, ready: true };
}

/** Posição `fixed` do painel; recalcula ao rolar, redimensionar ou mudar o conteúdo. */
export function useFloatingPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  opts: { align?: FloatingAlign; placement?: FloatingPlacement; matchWidth?: boolean } = {},
): CSSProperties {
  const { align = 'left', placement = 'bottom', matchWidth = false } = opts;
  const [pos, setPos] = useState<Position>(HIDDEN);

  useIsoLayoutEffect(() => {
    if (!open) {
      setPos(HIDDEN);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const next = compute(anchor, panel, { align, placement, matchWidth });
      setPos((prev) =>
        prev.ready &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.minWidth === next.minWidth &&
        prev.maxHeight === next.maxHeight
          ? prev
          : next,
      );
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (panelRef.current) observer?.observe(panelRef.current);
    const content = panelRef.current?.firstElementChild;
    if (content) observer?.observe(content);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [open, align, placement, matchWidth, anchorRef, panelRef]);

  return {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    minWidth: pos.minWidth,
    maxHeight: pos.maxHeight || undefined,
    visibility: pos.ready ? 'visible' : 'hidden',
  };
}

/**
 * Fecha com Esc e com clique fora. Um painel aberto DENTRO de outro (um
 * seletor dentro de um popover) não conta como "fora" para o painel pai:
 * é fora só o que não está no gatilho, no próprio painel, nem num painel
 * flutuante filho (um que não contenha o nosso gatilho).
 */
export function useDismiss(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  onClose: (reason: 'escape' | 'outside') => void,
) {
  useEffect(() => {
    if (!open) return;
    const token = {};
    openStack.push(token);
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      const anchor = anchorRef.current;
      if (anchor?.contains(target) || panelRef.current?.contains(target)) return;
      if (target instanceof Element) {
        const floating = target.closest('[data-floating]');
        if (floating && !(anchor && floating.contains(anchor))) return;
        // Diálogo aberto por um item do painel (portal fora da nossa subárvore).
        const dialog = target.closest('[role="dialog"]');
        if (dialog && !(anchor && dialog.contains(anchor))) return;
      }
      onClose('outside');
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || openStack[openStack.length - 1] !== token) return;
      // Captura + stop: o Esc fecha só o painel, não o diálogo por baixo.
      e.stopImmediatePropagation();
      onClose('escape');
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      openStack.splice(openStack.indexOf(token), 1);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/** O painel em si: mesma sombra, raio, contorno e animação em toda a app. */
export function FloatingPanel({
  panelRef,
  style,
  className,
  children,
  ...rest
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'style' | 'className' | 'children'>) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={panelRef}
      data-floating=""
      style={style}
      className={cn(
        'z-[60] flex flex-col overflow-hidden rounded-xl bg-surface text-sm text-foreground shadow-[var(--shadow-lg)] ring-1 ring-border animate-pop-in',
        className,
      )}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Estado + refs + posição + fechar (devolvendo o foco ao gatilho) de um painel. */
export function useFloating<A extends HTMLElement = HTMLButtonElement>(
  opts: { align?: FloatingAlign; placement?: FloatingPlacement; matchWidth?: boolean } = {},
) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<A>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const style = useFloatingPosition(open, anchorRef, panelRef, opts);
  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) anchorRef.current?.focus({ preventScroll: true });
  };
  // Esc devolve o foco; clique fora deixa o foco onde o clique o pôs.
  useDismiss(open, anchorRef, panelRef, (reason) => close(reason === 'escape'));
  return { open, setOpen, anchorRef, panelRef, style, close };
}
