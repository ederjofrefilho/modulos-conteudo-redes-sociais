import { generateHTML, generateJSON, type JSONContent } from '@tiptap/core';
import type { ContentBlock, LeafBlock, BlockWidth, ColumnsStackBelow } from '@app/content-contract';
import { richTextExtensions } from './richTextExtensions';
import { isAtomicLeafType, leafBlockToNodeAttrs, nodeAttrsToLeafBlock } from './atomicBlocks';

/**
 * Conversão pura entre o documento Tiptap (contínuo, com nós atômicos e
 * contêineres intercalados) e `ContentBlock[]` (o formato gravado no banco —
 * ver `@app/content-contract`). O CONTRATO de dados não muda: só a
 * superfície de edição por cima dele.
 *
 * Recursivo em dois níveis, espelhando a mesma regra do schema: `columns`/
 * `accordion` são resolvidos chamando `blocksToNodes`/`nodesToBlocks` de novo
 * sobre o conteúdo de cada coluna/item — nunca um terceiro nível, porque
 * `column.blocks`/`item.blocks` só podem conter folhas (garantia do
 * `content-contract`, não deste arquivo).
 */

function isEmptyProseNode(node: JSONContent): boolean {
  if (node.type !== 'paragraph') return false;
  if (!node.content || node.content.length === 0) return true;
  return node.content.every((c) => c.type === 'text' && !(c.text ?? '').trim());
}

/** Sentido blocos -> nós Tiptap. Cada bloco não-`richText` vira exatamente UM nó; um `richText` vira zero ou mais nós de prosa (parágrafo/heading/lista/citação). */
function blocksToNodes(blocks: ContentBlock[]): JSONContent[] {
  const content: JSONContent[] = [];

  function nonEmptyOrPlaceholder(nodes: JSONContent[]): JSONContent[] {
    return nodes.length > 0 ? nodes : [{ type: 'paragraph' }];
  }

  for (const block of blocks) {
    if (block.type === 'richText') {
      const json = generateJSON(block.html || '<p></p>', richTextExtensions()) as JSONContent;
      content.push(...(json.content ?? []));
    } else if (block.type === 'columns') {
      content.push({
        type: 'columns',
        attrs: { width: block.width, stackBelow: block.stackBelow },
        content: block.columns.map((col) => ({
          type: 'column',
          attrs: { span: col.span },
          content: nonEmptyOrPlaceholder(blocksToNodes(col.blocks)),
        })),
      });
    } else if (block.type === 'accordion') {
      content.push({
        type: 'accordion',
        content: block.items.map((item) => ({
          type: 'accordionItem',
          attrs: { title: item.title },
          content: nonEmptyOrPlaceholder(blocksToNodes(item.blocks)),
        })),
      });
    } else {
      content.push({ type: block.type, attrs: leafBlockToNodeAttrs(block) });
    }
  }

  return content;
}

/** Sentido nós Tiptap -> blocos. Nós de prosa consecutivos coalescem num único `richText`; a mesma lógica roda recursivamente dentro de cada coluna/item. */
function nodesToBlocks(nodes: JSONContent[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let proseBuffer: JSONContent[] = [];

  function flushProse() {
    const meaningful = proseBuffer.filter((n) => !isEmptyProseNode(n));
    if (meaningful.length > 0) {
      const html = generateHTML({ type: 'doc', content: meaningful }, richTextExtensions()).trim();
      if (html) blocks.push({ type: 'richText', html });
    }
    proseBuffer = [];
  }

  for (const node of nodes) {
    const type = node.type;
    if (!type) continue;

    if (type === 'columns') {
      flushProse();
      blocks.push({
        type: 'columns',
        width: (node.attrs?.width as BlockWidth) ?? 'content',
        stackBelow: (node.attrs?.stackBelow as ColumnsStackBelow) ?? 'md',
        columns: (node.content ?? []).map((col) => ({
          span: typeof col.attrs?.span === 'number' ? col.attrs.span : 6,
          blocks: nodesToBlocks(col.content ?? []) as LeafBlock[],
        })),
      });
    } else if (type === 'accordion') {
      flushProse();
      blocks.push({
        type: 'accordion',
        items: (node.content ?? []).map((item) => ({
          title: typeof item.attrs?.title === 'string' ? item.attrs.title : '',
          blocks: nodesToBlocks(item.content ?? []) as LeafBlock[],
        })),
      });
    } else if (isAtomicLeafType(type)) {
      flushProse();
      blocks.push(nodeAttrsToLeafBlock(type, node.attrs ?? {}));
    } else {
      proseBuffer.push(node);
    }
  }
  flushProse();

  return blocks;
}

export function tiptapDocToBlocks(doc: JSONContent): ContentBlock[] {
  return nodesToBlocks(doc.content ?? []);
}

export function blocksToTiptapDoc(blocks: ContentBlock[]): JSONContent {
  const content = blocksToNodes(blocks);
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

/**
 * Nó Tiptap pronto pra inserir (comando "/" ou "+") a partir de um bloco
 * vazio (`emptyBlock(type)` do content-contract) — reaproveita `blocksToNodes`
 * pra containers (`columns`/`accordion`) já nascerem com os filhos
 * estruturalmente exigidos (2 colunas, 1 item), em vez de um `{type, attrs}`
 * raso que o ProseMirror rejeitaria por faltar conteúdo obrigatório.
 */
export function blockToInsertableNode(block: ContentBlock): JSONContent {
  const [node] = blocksToNodes([block]);
  if (!node) throw new Error(`blockToInsertableNode: bloco "${block.type}" não produziu nó nenhum.`);
  return node;
}
