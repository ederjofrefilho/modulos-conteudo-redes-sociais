import sanitizeHtml from 'sanitize-html';
import type { ContentBlock, LeafBlock, Column, AccordionItem } from '@app/content-contract';

// Reexporta o contrato inteiro — este arquivo passa a ser a fronteira que
// acopla o contrato genérico (`@app/content-contract`, sem `sanitize-html`)
// à sanitização, que só faz sentido no servidor. Ver CLAUDE.md e o pacote
// para a razão da separação (bundle do navegador não pode puxar
// `sanitize-html`/jsdom).
export * from '@app/content-contract';

// Corpo do post = prosa contínua (richText) intercalada com inserções
// (image/callout/stat/embed/divider/...). H1 não entra na allow-list de
// propósito: o H1 da página é o título do post.
export const RICH_TEXT_TAGS = ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'a', 'br'];

const RICH_TEXT_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: RICH_TEXT_TAGS,
  allowedAttributes: { a: ['href', 'title'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};

/** Allow-list mais estreita que a de prosa — célula de tabela é rótulo curto, não parágrafo. */
export const TABLE_CELL_TAGS = ['strong', 'em', 'a', 'br'];

const TABLE_CELL_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: TABLE_CELL_TAGS,
  allowedAttributes: { a: ['href', 'title'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};

/**
 * Sanitiza o HTML de um bloco richText — allow-list estrita (ver
 * RICH_TEXT_TAGS). Roda no servidor antes de gravar: o editor é só
 * conveniência de digitação, nunca a fonte de verdade do que é seguro, e este
 * HTML vai parar numa página pública. `sanitize-html` (não
 * isomorphic-dompurify) pelo mesmo motivo já documentado em
 * packages/core/src/email-signatures.ts: DOMPurify no servidor depende de
 * jsdom, que falha de forma intermitente em produção na Vercel.
 */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, RICH_TEXT_CONFIG).trim();
}

function sanitizeTableCellHtml(html: string): string {
  return sanitizeHtml(html, TABLE_CELL_CONFIG).trim();
}

// `LeafBlock` (não `ContentBlock`) de propósito: `column.blocks`/`item.blocks`
// só podem conter folhas (garantia estrutural do schema, ver
// content-contract). Uma função separada preserva esse tipo mais estreito no
// retorno — se `sanitizeBlock` se chamasse a si mesma direto em `col.blocks`,
// o retorno alargaria para `ContentBlock[]` (que inclui `columns`/`accordion`)
// e pararia de bater com `Column['blocks']`.
function sanitizeLeaf(block: LeafBlock): LeafBlock {
  if (block.type === 'richText') return { ...block, html: sanitizeRichText(block.html) };
  if (block.type === 'table') {
    return { ...block, rows: block.rows.map((row) => row.map((cell) => ({ html: sanitizeTableCellHtml(cell.html) }))) };
  }
  return block;
}

function sanitizeBlock(block: ContentBlock): ContentBlock {
  if (block.type === 'columns') {
    return { ...block, columns: block.columns.map((col): Column => ({ ...col, blocks: col.blocks.map(sanitizeLeaf) })) };
  }
  if (block.type === 'accordion') {
    return { ...block, items: block.items.map((item): AccordionItem => ({ ...item, blocks: item.blocks.map(sanitizeLeaf) })) };
  }
  return sanitizeLeaf(block);
}

/**
 * Sanitiza todo HTML de uma lista de blocos, em qualquer profundidade —
 * `richText.html` pela allow-list de prosa, célula de `table` pela allow-list
 * estreita. Roda antes de gravar (create/update). Blocos que não carregam
 * HTML (imagem, callout com texto puro, etc.) passam intactos.
 */
export function sanitizeBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.map(sanitizeBlock);
}
