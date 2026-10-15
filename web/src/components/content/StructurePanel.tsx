'use client';

import { AlertTriangle, ListTree } from 'lucide-react';
import { cn } from '@/lib/cn';
import { extractHeadings } from './structure';
import type { ContentBlock } from '@app/content-contract';

const INDENT: Record<2 | 3 | 4, string> = { 2: 'pl-0', 3: 'pl-3', 4: 'pl-6' };

/**
 * Hierarquia de títulos do post (H2-H4), com rolagem ao clicar e aviso de
 * nível pulado (ex.: H4 sem H3 antes) — qualidade estrutural/SEO que hoje
 * ninguém confere. A rolagem funciona por ÍNDICE: consulta o DOM real
 * (`.prose-post h2,h3,h4`, na mesma ordem em que `extractHeadings` percorre
 * `blocks`) em vez de manter uma referência própria — mais simples que
 * prop-drilling um ref do editor até aqui, e sempre correto porque as duas
 * travessias andam na mesma ordem document.
 */
export function StructurePanel({ blocks }: { blocks: ContentBlock[] }) {
  const headings = extractHeadings(blocks);

  function scrollTo(index: number) {
    const els = document.querySelectorAll('.prose-post h2, .prose-post h3, .prose-post h4');
    els[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (headings.length === 0) {
    return <p className="px-1 text-xs text-muted">Nenhum título (H2-H4) ainda — a estrutura aparece aqui conforme você escreve.</p>;
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {headings.map((h, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => scrollTo(i)}
            className={cn(
              'flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-surface-2',
              INDENT[h.level],
            )}
          >
            {h.skipped ? (
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
            ) : (
              <ListTree className="mt-0.5 h-3 w-3 shrink-0 text-muted" />
            )}
            <span className={cn('truncate', h.level === 2 ? 'font-medium text-foreground' : 'text-muted')}>{h.text}</span>
          </button>
          {h.skipped && (
            <p className="px-1 pl-6 text-xs text-warning">Pula um nível — falta um H{h.level - 1} antes deste.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
