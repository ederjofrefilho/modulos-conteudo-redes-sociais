'use client';

import Link, { type LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';
import { onLinkClickWithTransition } from '@/lib/view-transition';

/**
 * Como next/link, mas usa a View Transitions API num clique simples (ver
 * lib/view-transition.ts) — pro elemento com o mesmo view-transition-name
 * (ex.: o Avatar de um contato) morfar da lista pro detalhe em vez de
 * cortar a tela. Ctrl/Cmd/clique do meio continuam abrindo em nova aba
 * normalmente.
 */
export function TransitionLink({
  href,
  className,
  prefetch,
  children,
}: {
  href: LinkProps['href'];
  className?: string;
  /** Repassado direto ao `next/link` — `true` pré-busca a rota inteira (inclusive dados
   * dinâmicos), não só o shell estático. Deixado como opt-in (sem default) porque forçar
   * isso em todo link do app multiplicaria consultas ao banco sem necessidade real. */
  prefetch?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      prefetch={prefetch}
      onClick={(e) => onLinkClickWithTransition(e, router, typeof href === 'string' ? href : href.toString())}
    >
      {children}
    </Link>
  );
}
