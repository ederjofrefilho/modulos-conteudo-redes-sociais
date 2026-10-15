'use client';

import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Link2, Heading2, Heading3, Heading4, List, ListOrdered, Quote } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Barra de seleção — aparece ao selecionar texto (o `BubbleMenu` do Tiptap
 * já esconde sozinho fora de uma seleção não vazia). Antes desta barra, o
 * editor de post não tinha NENHUMA ferramenta de formatação visível —
 * negrito/itálico/link/H2-H3 só existiam por atalho de teclado, ao contrário
 * do editor de e-mail (`RichTextEditor`), que sempre teve toolbar.
 */
function MenuButton({
  icon: Icon,
  title,
  active,
  onClick,
}: {
  icon: typeof Bold;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted hover:bg-surface-2 hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export function BubbleMenuBar({ editor }: { editor: Editor }) {
  function setLink() {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL do link (https://...)', previous ?? '');
    if (url === null) return;
    if (!url) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  }

  return (
    <BubbleMenu editor={editor} className="flex items-center gap-0.5 rounded-lg bg-surface p-1 shadow-[var(--shadow-md)]">
      <MenuButton icon={Bold} title="Negrito" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <MenuButton icon={Italic} title="Itálico" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <MenuButton icon={Link2} title="Link" active={editor.isActive('link')} onClick={setLink} />
      <MenuButton
        icon={Heading2}
        title="Título (H2)"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <MenuButton
        icon={Heading3}
        title="Subtítulo (H3)"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <MenuButton
        icon={Heading4}
        title="Subtítulo (H4)"
        active={editor.isActive('heading', { level: 4 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
      />
      <MenuButton
        icon={List}
        title="Lista"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <MenuButton
        icon={ListOrdered}
        title="Lista numerada"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <MenuButton
        icon={Quote}
        title="Citação"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
    </BubbleMenu>
  );
}
