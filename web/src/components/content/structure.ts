import { walkBlocks, type ContentBlock } from '@app/content-contract';

export interface HeadingOutlineItem {
  level: 2 | 3 | 4;
  text: string;
  /** Verdadeiro se este título aprofunda mais de um nível de uma vez (ex.: H4 logo após um H2, sem H3 no meio) — sinal de estrutura que confunde leitor e SEO, não travado, só avisado. */
  skipped: boolean;
}

const HEADING_TAGS: Record<string, 2 | 3 | 4> = { H2: 2, H3: 3, H4: 4 };

/**
 * Extrai a hierarquia de títulos (H2/H3/H4) de um post, em qualquer
 * profundidade (dentro de `columns`/`accordion` também) — usados pelo painel
 * de estrutura do editor e pelo bloco `toc`. Só roda no navegador: usa
 * `DOMParser`, que não existe no Node durante SSR (mesma restrição já
 * documentada em `tiptap/adapter.ts`).
 */
export function extractHeadings(blocks: ContentBlock[]): HeadingOutlineItem[] {
  const items: HeadingOutlineItem[] = [];
  let lastLevel = 1; // H1 é o título da página, sempre "já visto" antes do corpo

  walkBlocks(blocks, (block) => {
    if (block.type !== 'richText') return;
    const doc = new DOMParser().parseFromString(block.html, 'text/html');
    for (const el of Array.from(doc.body.children)) {
      const level = HEADING_TAGS[el.tagName];
      if (!level) continue;
      const text = el.textContent?.trim() ?? '';
      if (!text) continue;
      items.push({ level, text, skipped: level > lastLevel + 1 });
      lastLevel = level;
    }
  });

  return items;
}
