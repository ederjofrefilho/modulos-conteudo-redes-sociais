import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { emptyBlock } from '@app/content-contract';
import { blockToInsertableNode } from './adapter';
import { SlashMenuList, SLASH_MENU_ITEMS, type SlashMenuItem } from './SlashMenuList';

/**
 * Comando "/" — insere um bloco atômico (imagem/banner/número/vídeo/
 * divisória) na posição do cursor. Texto corrido continua sendo só digitar
 * normalmente (parágrafos/H2-H3/listas/citação já vêm do StarterKit) — "/"
 * é só para as inserções que não são prosa. Ver também `InsertControl.tsx`
 * (o "+" persistente na margem) para quem prefere clicar a digitar.
 */
export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }: { query: string }) =>
          SLASH_MENU_ITEMS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
        command: ({ editor, range, props }: { editor: any; range: any; props: SlashMenuItem }) => {
          const node = blockToInsertableNode(emptyBlock(props.type));
          editor.chain().focus().deleteRange(range).insertContent(node).run();
        },
        render: () => {
          let component: ReactRenderer<unknown, { items: SlashMenuItem[]; selectedIndex: number; onSelect: (item: SlashMenuItem) => void }>;
          let unmount: (() => void) | undefined;
          let latest: SuggestionProps<SlashMenuItem>;
          let selectedIndex = 0;

          function sync() {
            component.updateProps({
              items: latest.items,
              selectedIndex,
              onSelect: (item: SlashMenuItem) => latest.command(item),
            });
          }

          return {
            onStart: (props) => {
              latest = props;
              selectedIndex = 0;
              component = new ReactRenderer(SlashMenuList, {
                editor: props.editor,
                props: { items: props.items, selectedIndex, onSelect: (item: SlashMenuItem) => props.command(item) },
              });
              if (!props.clientRect) return;
              unmount = props.mount(component.element);
            },
            onUpdate: (props) => {
              latest = props;
              selectedIndex = 0;
              sync();
            },
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') {
                unmount?.();
                return true;
              }
              const items = latest.items;
              if (items.length === 0) return false;
              if (event.key === 'ArrowDown') {
                selectedIndex = (selectedIndex + 1) % items.length;
                sync();
                return true;
              }
              if (event.key === 'ArrowUp') {
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                sync();
                return true;
              }
              if (event.key === 'Enter') {
                const item = items[selectedIndex];
                if (item) latest.command(item);
                return true;
              }
              return false;
            },
            onExit: () => {
              unmount?.();
              component.destroy();
            },
          };
        },
      }),
    ];
  },
});
