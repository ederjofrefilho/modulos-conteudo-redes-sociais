'use client';

import { useSyncExternalStore } from 'react';

/** Aba de página irmã, mostrada na barra superior junto à trilha. */
export interface PageTab {
  href: string;
  label: string;
  active?: boolean;
}

/**
 * O que a página atual pede à barra superior: abas das páginas irmãs e a
 * descrição (ícone de informação ao lado da trilha). Quem escreve é o
 * `<PageHeader>` (via `PageChrome`); quem lê é a `Topbar`.
 */
export interface PageChromeState {
  tabs?: PageTab[];
  description?: string;
}

const EMPTY: PageChromeState = {};
let state: PageChromeState = EMPTY;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Publica o estado e devolve a função que o retira (só se ainda for o atual). */
export function publishPageChrome(next: PageChromeState): () => void {
  state = next;
  listeners.forEach((l) => l());
  return () => {
    if (state !== next) return;
    state = EMPTY;
    listeners.forEach((l) => l());
  };
}

export function usePageChrome(): PageChromeState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}
