'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import Placeholder from '@tiptap/extension-placeholder';
import { GripVertical } from 'lucide-react';
import type { ContentBlock } from '@app/content-contract';
import { richTextExtensions } from './tiptap/richTextExtensions';
import { atomicNodeExtensions } from './tiptap/nodes';
import { SlashCommand } from './tiptap/slashCommand';
import { InsertControl } from './tiptap/InsertControl';
import { blocksToTiptapDoc, tiptapDocToBlocks } from './tiptap/adapter';
import { PostBodyEditorContext } from './tiptap/context';
import { BubbleMenuBar } from './tiptap/BubbleMenuBar';
import { ColumnsDragDrop } from './tiptap/columnsDragDrop';
import { MediaPicker, type PickedAsset } from './MediaPicker';

/**
 * Corpo do post — substitui `RichTextEditor`+`BlockCard`+`PostBlocksEditor`
 * (contentEditable/execCommand cru + array de cards) por um único documento
 * Tiptap contínuo: prosa (parágrafo/H2-H3/lista/citação) e blocos atômicos
 * (imagem/banner/número/vídeo/divisória) editados no mesmo lugar, na
 * aparência final de verdade. `blocksToTiptapDoc`/`tiptapDocToBlocks`
 * (tiptap/adapter.ts) fazem a ponte com o contrato `ContentBlock[]` que o
 * resto do sistema (publishPost, o site) espera — nada nesse contrato muda.
 *
 * Não é controlado por `value` a cada tecla: o editor Tiptap é dono do
 * documento enquanto montado (`content` inicial só na criação); `onChange`
 * dispara a cada `onUpdate` com os blocos já convertidos, pro autosave do
 * `PostEditor` pegar.
 */
export function PostBodyEditor({
  initialBlocks,
  onChange,
  assetsById,
  onAssetPicked,
}: {
  initialBlocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  assetsById: Record<string, PickedAsset>;
  onAssetPicked: (asset: PickedAsset) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pickCallbackRef = useRef<((asset: PickedAsset) => void) | null>(null);
  const pickManyCallbackRef = useRef<((assets: PickedAsset[]) => void) | null>(null);
  const [pickerMode, setPickerMode] = useState<'closed' | 'single' | 'multiple'>('closed');
  const [pickerInitialIds, setPickerInitialIds] = useState<string[]>([]);

  const editor = useEditor({
    extensions: [
      ...richTextExtensions(),
      ...atomicNodeExtensions,
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === 'paragraph' ? 'Escreva, ou digite “/” para inserir um bloco...' : '',
      }),
      SlashCommand,
      ColumnsDragDrop,
    ],
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(tiptapDocToBlocks(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        // Foco: filete de tinta à esquerda do canvas (o contorno global
        // não se aplica ao `.ProseMirror` — ver globals.css).
        class:
          'prose-post min-h-[16rem] outline-none pl-3 focus-visible:shadow-[inset_1.5px_0_0_var(--ring-field)]',
        'aria-label': 'Corpo do post',
      },
    },
  });

  // `blocksToTiptapDoc` chama `generateJSON` do Tiptap, que precisa de
  // `DOMParser` — não existe no Node durante o SSR. Passá-lo direto como
  // `content` de `useEditor` (mesmo com `immediatelyRender: false`, que só
  // adia a renderização, não a avaliação da prop) derrubava a renderização
  // do servidor nesta página inteira. Hidratar o conteúdo real só aqui, num
  // efeito (nunca roda no servidor), resolve — `setContent` sem `emitUpdate`
  // não dispara `onUpdate`, então não conta como uma edição do usuário.
  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(blocksToTiptapDoc(initialBlocks), { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  function onRequestImage(onPicked: (asset: PickedAsset) => void) {
    pickCallbackRef.current = onPicked;
    setPickerMode('single');
  }

  function onRequestImages(initialIds: string[], onPicked: (assets: PickedAsset[]) => void) {
    pickManyCallbackRef.current = onPicked;
    setPickerInitialIds(initialIds);
    setPickerMode('multiple');
  }

  function closePicker() {
    setPickerMode('closed');
    pickCallbackRef.current = null;
    pickManyCallbackRef.current = null;
  }

  if (!editor) return null;

  return (
    <PostBodyEditorContext.Provider value={{ assetsById, onRequestImage, onRequestImages }}>
      <div ref={containerRef} className="relative">
        <EditorContent editor={editor} />
        <InsertControl editor={editor} containerRef={containerRef} />
        <BubbleMenuBar editor={editor} />
        {/* Alça única que segue o bloco sob o cursor — arrasta QUALQUER
            bloco (parágrafo, título, lista, atômico, coluna...), diferente
            do grip antigo por NodeView, que só existia nos 5 blocos
            atômicos originais. `nested`: sem isto, blocos DENTRO de uma
            coluna/item de acordeão não ganham alça nenhuma e ficam presos lá
            — nem reordenam entre si, nem saem de volta pro fluxo normal. */}
        <DragHandle editor={editor} nested>
          <span className="flex h-6 w-4 cursor-grab items-center justify-center text-muted hover:text-foreground active:cursor-grabbing">
            <GripVertical className="h-4 w-4" />
          </span>
        </DragHandle>
      </div>
      <MediaPicker
        open={pickerMode === 'single'}
        onClose={closePicker}
        onSelect={(asset) => {
          onAssetPicked(asset);
          pickCallbackRef.current?.(asset);
          closePicker();
        }}
      />
      <MediaPicker
        open={pickerMode === 'multiple'}
        onClose={closePicker}
        initialSelectedIds={pickerInitialIds}
        onSelectMultiple={(pickedAssets) => {
          pickedAssets.forEach(onAssetPicked);
          pickManyCallbackRef.current?.(pickedAssets);
          closePicker();
        }}
      />
    </PostBodyEditorContext.Provider>
  );
}
