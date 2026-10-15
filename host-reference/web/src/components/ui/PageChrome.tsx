'use client';

import { useEffect } from 'react';
import { publishPageChrome, type PageTab } from '@/lib/page-chrome';

/**
 * Entrega à barra superior as abas e a descrição da página atual. Não
 * desenha nada: a `Topbar` é quem mostra (ver `lib/page-chrome.ts`).
 */
export function PageChrome({ tabs, description }: { tabs?: PageTab[]; description?: string }) {
  const key = JSON.stringify([tabs ?? null, description ?? null]);
  useEffect(() => {
    const [t, d] = JSON.parse(key) as [PageTab[] | null, string | null];
    return publishPageChrome({ tabs: t ?? undefined, description: d ?? undefined });
  }, [key]);
  return null;
}
