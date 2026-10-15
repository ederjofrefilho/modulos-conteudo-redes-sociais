import type { PageTab } from '@/lib/page-chrome';

/** Páginas irmãs de Redes sociais, como abas na barra superior. */
export function socialTabs(active: '/social' | '/social/desempenho'): PageTab[] {
  return [
    { href: '/social', label: 'Publicações', active: active === '/social' },
    { href: '/social/desempenho', label: 'Desempenho', active: active === '/social/desempenho' },
  ];
}
