'use client';

import { useEffect, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/core';
import { Plus, Type } from 'lucide-react';
import { Menu, MenuItem } from '@/components/ui';
import { emptyBlock } from '@app/content-contract';
import { blockToInsertableNode } from './adapter';
import { SLASH_MENU_ITEMS, type InsertableBlockType } from './SlashMenuList';

/**
 * O "+" persistente na margem esquerda — segue o bloco onde está o cursor
 * (recalcula a cada mudança de seleção/doc) e insere um bloco novo LOGO
 * DEPOIS dele. Complementa o comando "/" (`slashCommand.ts`): quem prefere
 * clicar a digitar tem exatamente a mesma lista de tipos aqui. Antes (editor
 * antigo, `PostBlocksEditor.tsx`), o "+" só aparecia num hover entre blocos
 * (`opacity-0 group-hover:opacity-100`) — baixo achado; este fica sempre
 * visível, só se move.
 */
export function InsertControl({
  editor,
  containerRef,
}: {
  editor: Editor;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const [top, setTop] = useState<number | null>(null);
  const [insertPos, setInsertPos] = useState<number | null>(null);

  useEffect(() => {
    function recompute() {
      const container = containerRef.current;
      if (!container) return;
      const { state, view } = editor;
      const resolved = state.doc.resolve(state.selection.from);
      if (resolved.depth < 1) return;
      const topLevelStart = resolved.before(1);
      const topLevelNode = resolved.node(1);
      const dom = view.nodeDOM(topLevelStart) as HTMLElement | null;
      if (!dom || typeof dom.getBoundingClientRect !== 'function') return;

      const containerRect = container.getBoundingClientRect();
      const domRect = dom.getBoundingClientRect();
      setTop(domRect.top - containerRect.top);
      setInsertPos(topLevelStart + topLevelNode.nodeSize);
    }

    recompute();
    editor.on('selectionUpdate', recompute);
    editor.on('transaction', recompute);
    window.addEventListener('resize', recompute);
    return () => {
      editor.off('selectionUpdate', recompute);
      editor.off('transaction', recompute);
      window.removeEventListener('resize', recompute);
    };
  }, [editor, containerRef]);

  if (top === null || insertPos === null) return null;

  function insertAtCursorBlock(type: InsertableBlockType | 'richText') {
    if (insertPos === null) return;
    if (type === 'richText') {
      editor.chain().focus().insertContentAt(insertPos, { type: 'paragraph' }).run();
      return;
    }
    const node = blockToInsertableNode(emptyBlock(type));
    editor.chain().focus().insertContentAt(insertPos, node).run();
  }

  return (
    <div className="pointer-events-none absolute left-0 top-0 w-full" style={{ transform: `translateY(${top}px)` }}>
      <div className="pointer-events-auto absolute -left-9 -top-0.5">
        <Menu
          label="Inserir bloco"
          trigger={() => (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-muted shadow-[var(--shadow-sm)] transition-colors hover:bg-border hover:text-foreground">
              <Plus className="h-3.5 w-3.5" />
            </span>
          )}
        >
          <MenuItem>
            <button type="button" onClick={() => insertAtCursorBlock('richText')}>
              <Type className="h-3.5 w-3.5" /> Texto
            </button>
          </MenuItem>
          {SLASH_MENU_ITEMS.map((item) => (
            <MenuItem key={item.type}>
              <button type="button" onClick={() => insertAtCursorBlock(item.type)}>
                <item.icon className="h-3.5 w-3.5" /> {item.label}
              </button>
            </MenuItem>
          ))}
        </Menu>
      </div>
    </div>
  );
}
