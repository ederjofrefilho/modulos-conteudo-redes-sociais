'use client';

import { Node, mergeAttributes, type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { ListTree, Quote as QuoteIcon } from 'lucide-react';
import { Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { NodeToolbar, domTag } from './nodeShared';

// Blocos de texto do editor de post: código, citação e sumário.

function CodeNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper
      className={cn(
        'group relative my-3 overflow-hidden rounded-xl bg-code',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <NodeToolbar onDelete={deleteNode} />
      <div
        contentEditable={false}
        className="flex items-center justify-between bg-code-foreground/[0.04] px-3 py-1.5"
      >
        <input
          value={node.attrs.language ?? ''}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          placeholder="linguagem (ex.: ts, sql, bash)"
          aria-label="Linguagem do código"
          className="rounded bg-transparent px-1 font-mono text-xs text-code-foreground/70 outline-none placeholder:text-code-foreground/50 focus-visible:ring-[1.5px] focus-visible:ring-code-foreground/60"
        />
      </div>
      <textarea
        contentEditable={false}
        value={node.attrs.code ?? ''}
        onChange={(e) => updateAttributes({ code: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart, selectionEnd, value } = el;
            const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
            updateAttributes({ code: next });
            requestAnimationFrame(() =>
              el.setSelectionRange(selectionStart + 2, selectionStart + 2),
            );
          }
        }}
        rows={Math.max(3, (node.attrs.code ?? '').split('\n').length)}
        spellCheck={false}
        placeholder="cole ou digite o código..."
        aria-label="Código"
        className="block w-full resize-none bg-transparent px-3 py-2 font-mono text-13 leading-relaxed text-code-foreground outline-none placeholder:text-code-foreground/50 focus-visible:ring-[1.5px] focus-visible:ring-inset focus-visible:ring-code-foreground/50"
      />
    </NodeViewWrapper>
  );
}

// --- Citação em destaque ----------------------------------------------------

function QuoteNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper
      className={cn(
        'group relative my-4 rounded-xl bg-primary/5 px-5 py-4',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <NodeToolbar onDelete={deleteNode} />
      <QuoteIcon className="mb-1 h-5 w-5 text-primary/40" />
      <p className="text-xl font-medium leading-snug text-foreground">
        {node.attrs.text || 'Texto da citação...'}
      </p>
      {node.attrs.attribution && (
        <p className="mt-2 text-sm text-muted">— {node.attrs.attribution}</p>
      )}
      {selected && (
        <div contentEditable={false} className="mt-3 flex flex-col gap-2 pt-3">
          <Textarea
            rows={2}
            value={node.attrs.text ?? ''}
            onChange={(e) => updateAttributes({ text: e.target.value })}
            placeholder="Texto da citação"
          />
          <Input
            value={node.attrs.attribution ?? ''}
            onChange={(e) => updateAttributes({ attribution: e.target.value })}
            placeholder="Atribuição (opcional) — ex.: Nome, cargo"
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

// --- Sumário (TOC) -------------------------------------------------------

function TocNodeView({ deleteNode, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper
      className={cn(
        'group relative my-3 rounded-xl bg-surface-2/50 p-4',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <NodeToolbar onDelete={deleteNode} />
      <div contentEditable={false} className="flex items-center gap-2 text-sm text-muted">
        <ListTree className="h-4 w-4" />
        Sumário — gerado automaticamente a partir dos títulos (H2, H3, H4) deste post.
      </div>
    </NodeViewWrapper>
  );
}

// --- Definições dos nós ----------------------------------------------------

export const CodeBlockAtomNode = Node.create({
  name: 'code',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { language: { default: '' }, code: { default: '' } };
  },
  parseHTML() {
    return [{ tag: domTag('code') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('code'), mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeNodeView);
  },
});

export const QuoteBlockNode = Node.create({
  name: 'quote',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { text: { default: '' }, attribution: { default: null } };
  },
  parseHTML() {
    return [{ tag: domTag('quote') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('quote'), mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(QuoteNodeView);
  },
});

export const TocBlockNode = Node.create({
  name: 'toc',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  parseHTML() {
    return [{ tag: domTag('toc') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('toc'), mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TocNodeView);
  },
});
