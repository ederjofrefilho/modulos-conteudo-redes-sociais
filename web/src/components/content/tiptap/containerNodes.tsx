'use client';

import { useRef, useState } from 'react';
import { Node, mergeAttributes, type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Input, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { BLOCK_WIDTHS, COLUMNS_STACK_BELOW, type BlockWidth, type ColumnsStackBelow } from '@app/content-contract';
import { ATOMIC_LEAF_TYPES } from './atomicBlocks';
import { domTag } from './nodeShared';

/**
 * `column`/`accordionItem` só podem conter os mesmos nós que um `richText`
 * viraria + os blocos atômicos — NUNCA `columns`/`accordion` de novo. É a
 * mesma garantia de "um nível só" do `content-contract`, imposta aqui
 * também, na expressão de conteúdo do próprio schema ProseMirror (não só na
 * validação de saída) — um `insertContent` que tentasse colar `columns`
 * dentro de `column` já falha na hora, não só ao salvar.
 */
const LEAF_NODE_NAMES = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', ...ATOMIC_LEAF_TYPES];
const LEAF_CONTENT_EXPR = `(${LEAF_NODE_NAMES.join('|')})+`;

const WIDTH_LABEL: Record<BlockWidth, string> = { content: 'largura do texto', wide: 'larga', full: 'tela cheia' };
const STACK_LABEL: Record<ColumnsStackBelow, string> = { sm: 'empilha no celular pequeno', md: 'empilha no celular/tablet' };
const GAP_PX = 16; // gap-4

// --- Colunas ---------------------------------------------------------------

/**
 * Não existe mais um botão "Colunas" pra clicar — o layout nasce arrastando
 * um bloco (pela alça de arraste) até a borda esquerda/direita de outro (ver
 * `columnsDragDrop.ts`), como no Notion. Este NodeView só edita o que já
 * existe: largura das colunas por arraste contínuo na divisa entre elas
 * (não mais um seletor de presets "6/6, 8/4..."), largura do bloco e
 * empilhamento no celular, e excluir.
 */
function ColumnsNodeView({ node, editor, getPos, updateAttributes, deleteNode }: NodeViewProps) {
  const width = (node.attrs.width ?? 'content') as BlockWidth;
  const stackBelow = (node.attrs.stackBelow ?? 'md') as ColumnsStackBelow;
  // `NodeViewContent` não é `forwardRef` (função simples, ref não chega no
  // elemento de verdade) — a referência vai no WRAPPER ao redor dela, e
  // achamos o grid de dentro por `[data-node-view-content]`, atributo que a
  // própria `NodeViewContent` sempre seta no elemento que ela renderiza.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [resizingAt, setResizingAt] = useState<number | null>(null);

  const spans: number[] = Array.from({ length: node.childCount }, (_, i) => (node.child(i).attrs.span as number) ?? 6);
  let cumulative = 0;
  const boundaries = spans.slice(0, -1).map((span) => (cumulative += span)); // linha de grade (1-indexada) logo após a coluna i

  function commitSpans(leftIndex: number, newLeftSpan: number, newRightSpan: number) {
    const pos = getPos();
    if (pos === undefined) return;
    const content: JSONContent[] = Array.from({ length: node.childCount }, (_, idx) => {
      const child = node.child(idx);
      const span = idx === leftIndex ? newLeftSpan : idx === leftIndex + 1 ? newRightSpan : (child.attrs.span as number);
      return { type: 'column', attrs: { ...child.attrs, span }, content: (child.toJSON() as JSONContent).content };
    });
    editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, { type: 'columns', attrs: node.attrs, content }).run();
  }

  function startResize(leftIndex: number, e: React.PointerEvent) {
    e.preventDefault();
    const grid = wrapperRef.current?.querySelector<HTMLElement>('[data-node-view-content]');
    if (!grid) return;
    const children = Array.from(grid.children) as HTMLElement[];
    const leftEl = children[leftIndex];
    const rightEl = children[leftIndex + 1];
    if (!leftEl || !rightEl) return;

    const startX = e.clientX;
    const leftSpan0 = spans[leftIndex]!;
    const rightSpan0 = spans[leftIndex + 1]!;
    const gridWidth = grid.getBoundingClientRect().width;
    const unit = (gridWidth - 11 * GAP_PX) / 12; // a grade sempre tem 12 trilhas, tem colunas ou não
    let finalLeft = leftSpan0;
    let finalRight = rightSpan0;
    setResizingAt(leftIndex);

    function clampPair(rawLeft: number): [number, number] {
      let left = Math.round(rawLeft);
      let right = leftSpan0 + rightSpan0 - left;
      if (left < 1) {
        right -= 1 - left;
        left = 1;
      }
      if (right < 1) {
        left -= 1 - right;
        right = 1;
      }
      return [Math.max(1, left), Math.max(1, right)];
    }

    function onMove(ev: PointerEvent) {
      const deltaSpan = (ev.clientX - startX) / unit;
      const [left, right] = clampPair(leftSpan0 + deltaSpan);
      finalLeft = left;
      finalRight = right;
      leftEl!.style.gridColumn = `span ${left} / span ${left}`;
      rightEl!.style.gridColumn = `span ${right} / span ${right}`;
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      setResizingAt(null);
      if (finalLeft !== leftSpan0 || finalRight !== rightSpan0) {
        commitSpans(leftIndex, finalLeft, finalRight);
      } else {
        // Não mudou nada — desfaz o estilo inline aplicado durante o preview.
        leftEl!.style.gridColumn = '';
        rightEl!.style.gridColumn = '';
      }
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  return (
    <NodeViewWrapper className="group relative my-4">
      <div
        contentEditable={false}
        className="mb-2 flex flex-wrap items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Select
          value={width}
          onChange={(e) => updateAttributes({ width: e.target.value })}
          inputSize="sm" className="w-40"
        >
          {BLOCK_WIDTHS.map((w) => (
            <option key={w} value={w}>
              {WIDTH_LABEL[w]}
            </option>
          ))}
        </Select>
        <Select
          value={stackBelow}
          onChange={(e) => updateAttributes({ stackBelow: e.target.value })}
          inputSize="sm" className="w-40"
        >
          {COLUMNS_STACK_BELOW.map((s) => (
            <option key={s} value={s}>
              {STACK_LABEL[s]}
            </option>
          ))}
        </Select>
        <button type="button" onClick={deleteNode} className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger" title="Remover colunas" aria-label="Remover colunas">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div ref={wrapperRef} className="relative">
        <NodeViewContent className="grid grid-cols-12 gap-4" />
        {/* Divisas de redimensionamento — uma por fronteira entre colunas, posicionada pela mesma matemática de 12 avos que os próprios spans usam (não depende de medir o DOM pra ficar no lugar certo; a medição real só entra no arraste, em `startResize`). */}
        <div contentEditable={false} className="pointer-events-none absolute inset-y-0 left-0 right-0">
          {boundaries.map((line, i) => (
            <div
              key={i}
              onPointerDown={(e) => startResize(i, e)}
              className={cn(
                'pointer-events-auto absolute -top-1 -bottom-1 z-10 w-3 -translate-x-1/2 cursor-col-resize',
                'flex justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 focus-within:opacity-100',
                resizingAt === i && 'opacity-100',
              )}
              style={{ left: `${((line - 1) / 12) * 100}%` }}
              title="Arrastar para redimensionar"
            >
              <div className={cn('w-0.5 rounded-full bg-border', resizingAt === i ? 'bg-primary' : 'group-hover:bg-border')} />
            </div>
          ))}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function ColumnNodeView({ node }: NodeViewProps) {
  const span = (node.attrs.span as number) ?? 6;
  return (
    <NodeViewWrapper className="min-w-0" style={{ gridColumn: `span ${span} / span ${span}` }}>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

// --- Acordeão --------------------------------------------------------------

function AccordionNodeView({ node, editor, getPos, deleteNode }: NodeViewProps) {
  function addItem() {
    const pos = getPos();
    if (pos === undefined) return;
    editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize - 1, {
        type: 'accordionItem',
        attrs: { title: '' },
        content: [{ type: 'paragraph' }],
      })
      .run();
  }

  return (
    <NodeViewWrapper className="group relative my-4 flex flex-col gap-2">
      <div
        contentEditable={false}
        className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs text-muted shadow-[var(--shadow-sm)] hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Item
        </button>
        <button type="button" onClick={deleteNode} className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger" title="Remover acordeão" aria-label="Remover acordeão">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <NodeViewContent className="flex flex-col gap-2" />
    </NodeViewWrapper>
  );
}

function AccordionItemNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  return (
    <NodeViewWrapper className="group/item overflow-hidden rounded-lg shadow-[var(--shadow-sm)]">
      <div contentEditable={false} className="flex items-center gap-2 bg-surface-2 px-3 py-2">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        <Input
          value={node.attrs.title ?? ''}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder="Título do item"
          aria-label="Título do item"
          className="h-7 flex-1 rounded-none border-none bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0 focus-visible:shadow-[inset_0_-1.5px_0_var(--ring-field)]"
        />
        <button
          type="button"
          onClick={deleteNode}
          className="rounded p-1 text-muted opacity-0 hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover/item:opacity-100"
          title="Remover item"
          aria-label="Remover item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <NodeViewContent className="p-3" />
    </NodeViewWrapper>
  );
}

// --- Definições dos nós ----------------------------------------------------

export const ColumnsBlockNode = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,4}',
  draggable: true,
  addAttributes() {
    return { width: { default: 'content' }, stackBelow: { default: 'md' } };
  },
  parseHTML() {
    return [{ tag: domTag('columns') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('columns'), mergeAttributes(HTMLAttributes), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ColumnsNodeView, { contentDOMElementTag: 'div' });
  },
});

export const ColumnNode = Node.create({
  name: 'column',
  content: LEAF_CONTENT_EXPR,
  isolating: true,
  addAttributes() {
    return { span: { default: 6 } };
  },
  parseHTML() {
    return [{ tag: domTag('column') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('column'), mergeAttributes(HTMLAttributes), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ColumnNodeView, { contentDOMElementTag: 'div' });
  },
});

export const AccordionBlockNode = Node.create({
  name: 'accordion',
  group: 'block',
  content: 'accordionItem+',
  draggable: true,
  parseHTML() {
    return [{ tag: domTag('accordion') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('accordion'), mergeAttributes(HTMLAttributes), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AccordionNodeView, { contentDOMElementTag: 'div' });
  },
});

export const AccordionItemNode = Node.create({
  name: 'accordionItem',
  content: LEAF_CONTENT_EXPR,
  isolating: true,
  addAttributes() {
    return { title: { default: '' } };
  },
  parseHTML() {
    return [{ tag: domTag('accordionItem') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('accordionItem'), mergeAttributes(HTMLAttributes), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AccordionItemNodeView, { contentDOMElementTag: 'div' });
  },
});

export const CONTAINER_NODES = [ColumnsBlockNode, ColumnNode, AccordionBlockNode, AccordionItemNode];
