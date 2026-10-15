'use client';

import { Node, mergeAttributes, type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { ImagePlus } from 'lucide-react';
import { Input, Select, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { CALLOUT_VARIANTS, EMBED_PROVIDERS, type CalloutVariant, type EmbedProvider } from '@app/content-contract';
import { usePostBodyEditorContext } from './context';
import { NodeToolbar, WidthSelect, domTag } from './nodeShared';
import { EXTRA_ATOMIC_NODES } from './nodesExtra';
import { CONTAINER_NODES } from './containerNodes';

const VARIANT_LABEL: Record<CalloutVariant, string> = { info: 'Informativo', success: 'Positivo', warning: 'Atenção' };
const VARIANT_STYLE: Record<CalloutVariant, string> = {
  info: 'bg-primary/10',
  success: 'bg-accent/10',
  warning: 'bg-warning/10',
};
const PROVIDER_LABEL: Record<EmbedProvider, string> = { youtube: 'YouTube', vimeo: 'Vimeo', loom: 'Loom', link: 'Link/painel' };

function ImageNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { assetsById, onRequestImage } = usePostBodyEditorContext();
  const assetId = node.attrs.assetId as string | null;
  const asset = assetId ? assetsById[assetId] : null;

  return (
    <NodeViewWrapper
      className={cn('group relative my-3 rounded-lg', selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}
    >
      <NodeToolbar onDelete={deleteNode} />
      <button
        type="button"
        contentEditable={false}
        onClick={() => onRequestImage((picked) => updateAttributes({ assetId: picked.id }))}
        aria-label={asset ? 'Trocar imagem' : 'Escolher imagem'}
        className="block w-full overflow-hidden rounded-lg bg-surface-2 text-muted hover:bg-border"
      >
        {asset ? (
          // eslint-disable-next-line @next/next/no-img-element -- host do Blob é dinâmico
          <img src={asset.url} alt={asset.alt} className="h-auto max-h-[28rem] w-full object-cover" />
        ) : (
          <span className="flex h-40 items-center justify-center gap-2 text-sm">
            <ImagePlus className="h-4 w-4" /> Escolher imagem
          </span>
        )}
      </button>
      {node.attrs.caption && !selected && <p className="mt-1.5 text-center text-xs text-muted">{node.attrs.caption}</p>}
      {selected && (
        <div contentEditable={false} className="mt-2 flex flex-col gap-2 rounded-lg bg-surface p-3 shadow-[var(--shadow-sm)] sm:flex-row">
          <Input
            className="flex-1"
            value={node.attrs.caption ?? ''}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
            placeholder="Legenda (opcional)"
          />
          <div className="w-40 shrink-0">
            <WidthSelect value={node.attrs.width} onChange={(width) => updateAttributes({ width })} />
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

function CalloutNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const variant = node.attrs.variant as CalloutVariant;
  return (
    <NodeViewWrapper
      className={cn(
        'group relative my-3 rounded-xl p-4',
        VARIANT_STYLE[variant],
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <NodeToolbar onDelete={deleteNode} />
      {node.attrs.title && <p className="mb-1 font-semibold text-foreground">{node.attrs.title}</p>}
      <p className="whitespace-pre-wrap text-sm text-foreground">{node.attrs.text || 'Texto do banner...'}</p>
      {node.attrs.ctaLabel && (
        <span className="mt-2 inline-block text-sm font-medium text-primary underline">{node.attrs.ctaLabel}</span>
      )}
      {selected && (
        <div contentEditable={false} className="mt-3 flex flex-col gap-2 pt-3">
          <div className="flex gap-2">
            <div className="w-40 shrink-0">
              <Select value={variant} onChange={(e) => updateAttributes({ variant: e.target.value })}>
                {CALLOUT_VARIANTS.map((v) => (
                  <option key={v} value={v}>
                    {VARIANT_LABEL[v]}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              className="flex-1"
              value={node.attrs.title ?? ''}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              placeholder="Título (opcional)"
            />
          </div>
          <Textarea
            rows={2}
            value={node.attrs.text ?? ''}
            onChange={(e) => updateAttributes({ text: e.target.value })}
            placeholder="Texto do banner"
          />
          <div className="flex gap-2">
            <Input
              className="flex-1"
              value={node.attrs.ctaLabel ?? ''}
              onChange={(e) => updateAttributes({ ctaLabel: e.target.value })}
              placeholder="Texto do botão (opcional)"
            />
            <Input
              className="flex-1"
              value={node.attrs.ctaHref ?? ''}
              onChange={(e) => updateAttributes({ ctaHref: e.target.value })}
              placeholder="Link do botão (opcional)"
            />
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

function StatNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper
      className={cn(
        'group relative my-3 rounded-xl bg-surface-2/50 p-5 text-center',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <NodeToolbar onDelete={deleteNode} />
      <p className="font-mono text-3xl font-semibold text-primary">{node.attrs.value || '—'}</p>
      <p className="mt-1 text-sm text-muted">{node.attrs.label || 'Rótulo do número em destaque'}</p>
      {selected && (
        <div contentEditable={false} className="mt-3 flex justify-center gap-2 pt-3">
          <Input
            className="w-32"
            value={node.attrs.value ?? ''}
            onChange={(e) => updateAttributes({ value: e.target.value })}
            placeholder="Ex.: 40%"
          />
          <Input
            className="max-w-xs flex-1"
            value={node.attrs.label ?? ''}
            onChange={(e) => updateAttributes({ label: e.target.value })}
            placeholder="Rótulo (ex.: redução no tempo de fechamento)"
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

function EmbedNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper
      className={cn(
        'group relative my-3 rounded-xl bg-surface-2/50 p-4',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <NodeToolbar onDelete={deleteNode} />
      <p className="truncate text-sm font-medium text-foreground">{node.attrs.url || 'Vídeo ou painel embutível'}</p>
      {node.attrs.caption && <p className="mt-1 text-xs text-muted">{node.attrs.caption}</p>}
      {selected && (
        <div contentEditable={false} className="mt-3 flex flex-col gap-2 pt-3">
          <Input
            value={node.attrs.url ?? ''}
            onChange={(e) => updateAttributes({ url: e.target.value })}
            placeholder="https://... (vídeo ou painel embutível)"
          />
          <div className="flex gap-2">
            <div className="w-36 shrink-0">
              <Select value={node.attrs.provider ?? ''} onChange={(e) => updateAttributes({ provider: e.target.value || null })}>
                <option value="">Detectar automaticamente</option>
                {EMBED_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABEL[p]}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              className="flex-1"
              value={node.attrs.caption ?? ''}
              onChange={(e) => updateAttributes({ caption: e.target.value })}
              placeholder="Legenda (opcional)"
            />
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

function DividerNodeView({ deleteNode, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className="group relative my-4 py-2">
      <NodeToolbar onDelete={deleteNode} />
      <div className={cn('h-1 rounded-full bg-surface-2', selected && 'bg-primary')} />
    </NodeViewWrapper>
  );
}

export const ImageBlockNode = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { assetId: { default: null }, caption: { default: null }, width: { default: 'content' } };
  },
  parseHTML() {
    return [{ tag: domTag('image') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('image'), mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

export const CalloutBlockNode = Node.create({
  name: 'callout',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      variant: { default: 'info' },
      title: { default: null },
      text: { default: '' },
      ctaLabel: { default: null },
      ctaHref: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: domTag('callout') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('callout'), mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
  },
});

export const StatBlockNode = Node.create({
  name: 'stat',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { value: { default: '' }, label: { default: '' } };
  },
  parseHTML() {
    return [{ tag: domTag('stat') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('stat'), mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(StatNodeView);
  },
});

export const EmbedBlockNode = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { url: { default: '' }, caption: { default: null }, provider: { default: null }, ratio: { default: null } };
  },
  parseHTML() {
    return [{ tag: domTag('embed') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('embed'), mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(EmbedNodeView);
  },
});

export const DividerBlockNode = Node.create({
  name: 'divider',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  parseHTML() {
    return [{ tag: domTag('divider') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('divider'), mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DividerNodeView);
  },
});

export const atomicNodeExtensions = [
  ImageBlockNode,
  CalloutBlockNode,
  StatBlockNode,
  EmbedBlockNode,
  DividerBlockNode,
  ...EXTRA_ATOMIC_NODES,
  ...CONTAINER_NODES,
];
