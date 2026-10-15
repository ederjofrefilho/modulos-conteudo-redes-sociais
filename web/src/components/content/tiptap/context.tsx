'use client';

import { createContext, useContext } from 'react';
import type { PickedAsset } from '../MediaPicker';

export interface PostBodyEditorContextValue {
  assetsById: Record<string, PickedAsset>;
  /** Abre o MediaPicker compartilhado (seleção única); `onPicked` roda quando o autor escolhe/envia uma imagem. */
  onRequestImage: (onPicked: (asset: PickedAsset) => void) => void;
  /** Mesma janela, em modo de seleção múltipla (galeria) — `initialIds` pré-marca o que já está no bloco. */
  onRequestImages: (initialIds: string[], onPicked: (assets: PickedAsset[]) => void) => void;
}

export const PostBodyEditorContext = createContext<PostBodyEditorContextValue | null>(null);

/**
 * As NodeViews React dos blocos atômicos (imagem/callout/stat/embed) são
 * montadas via portal pelo Tiptap, mas continuam DESCENDENTES do componente
 * React que chama `useEditor`/`EditorContent` — portais preservam Context,
 * então este hook funciona normalmente dentro delas sem precisar passar
 * `assetsById`/callbacks manualmente por prop através da config da extensão.
 */
export function usePostBodyEditorContext(): PostBodyEditorContextValue {
  const ctx = useContext(PostBodyEditorContext);
  if (!ctx) throw new Error('usePostBodyEditorContext só funciona dentro do PostBodyEditor.');
  return ctx;
}
