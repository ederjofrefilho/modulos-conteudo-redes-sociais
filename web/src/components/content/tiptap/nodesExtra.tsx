'use client';

import { Node, mergeAttributes, type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import {
  ImagePlus,
  Plus,
  Minus,
  Link2,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { GALLERY_LAYOUTS, BUTTON_VARIANTS, BUTTON_ALIGNS, type ButtonVariant, type ButtonAlign } from '@app/content-contract';
import { usePostBodyEditorContext } from './context';
import { NodeToolbar, WidthSelect, domTag } from './nodeShared';
import { CodeBlockAtomNode, QuoteBlockNode, TocBlockNode } from './nodesText';

const LAYOUT_LABEL: Record<string, string> = { grid: 'Grade', carousel: 'Carrossel' };
const BUTTON_VARIANT_LABEL: Record<ButtonVariant, string> = { primary: 'Primário', secondary: 'Secundário', ghost: 'Discreto' };
const BUTTON_ALIGN_ICON: Record<ButtonAlign, typeof AlignLeft> = { left: AlignLeft, center: AlignCenter, right: AlignRight };

// --- Galeria ---------------------------------------------------------------

function GalleryNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { assetsById, onRequestImages } = usePostBodyEditorContext();
  const assetIds: string[] = node.attrs.assetIds ?? [];
  const columns = node.attrs.columns ?? 3;

  return (
    <NodeViewWrapper
      className={cn('group relative my-3 rounded-lg', selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}
    >
      <NodeToolbar onDelete={deleteNode} />
      {assetIds.length === 0 ? (
        <button
          type="button"
          contentEditable={false}
          onClick={() => onRequestImages(assetIds, (picked) => updateAttributes({ assetIds: picked.map((a) => a.id) }))}
          className="flex h-40 w-full items-center justify-center gap-2 rounded-lg bg-surface-2 text-sm text-muted hover:bg-border"
        >
          <ImagePlus className="h-4 w-4" /> Escolher imagens (2 ou mais)
        </button>
      ) : (
        <div
          contentEditable={false}
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {assetIds.map((id) => {
            const asset = assetsById[id];
            return (
              <div key={id} className="aspect-square overflow-hidden rounded-md bg-surface-2">
                {asset && (
                  // eslint-disable-next-line @next/next/no-img-element -- host do Blob é dinâmico
                  <img src={asset.url} alt={asset.alt} className="h-full w-full object-cover" />
                )}
              </div>
            );
          })}
        </div>
      )}
      {node.attrs.caption && !selected && <p className="mt-1.5 text-center text-xs text-muted">{node.attrs.caption}</p>}
      {selected && (
        <div contentEditable={false} className="mt-2 flex flex-col gap-2 rounded-lg bg-surface p-3 shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onRequestImages(assetIds, (picked) => updateAttributes({ assetIds: picked.map((a) => a.id) }))}
            >
              <ImagePlus className="h-3.5 w-3.5" /> {assetIds.length === 0 ? 'Escolher imagens' : 'Editar seleção'}
            </Button>
            <div className="w-36 shrink-0">
              <Select value={node.attrs.layout} onChange={(e) => updateAttributes({ layout: e.target.value })}>
                {GALLERY_LAYOUTS.map((l) => (
                  <option key={l} value={l}>
                    {LAYOUT_LABEL[l]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-28 shrink-0">
              <Select value={String(columns)} onChange={(e) => updateAttributes({ columns: Number(e.target.value) })}>
                {[2, 3, 4].map((c) => (
                  <option key={c} value={c}>
                    {c} colunas
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40 shrink-0">
              <WidthSelect value={node.attrs.width} onChange={(width) => updateAttributes({ width })} />
            </div>
          </div>
          <Input
            value={node.attrs.caption ?? ''}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
            placeholder="Legenda (opcional)"
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

// --- Tabela ------------------------------------------------------------

type TableRow = { html: string }[];

function TableNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const rows: TableRow[] = node.attrs.rows ?? [];
  const colCount = rows[0]?.length ?? 0;

  function setCell(r: number, c: number, text: string) {
    const next = rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? { html: text } : cell)) : row));
    updateAttributes({ rows: next });
  }
  function addRow() {
    const width = colCount || 2;
    updateAttributes({ rows: [...rows, Array.from({ length: width }, () => ({ html: '' }))] });
  }
  function removeRow() {
    if (rows.length <= 1) return;
    updateAttributes({ rows: rows.slice(0, -1) });
  }
  function addColumn() {
    updateAttributes({ rows: rows.map((row) => [...row, { html: '' }]) });
  }
  function removeColumn() {
    if (colCount <= 1) return;
    updateAttributes({ rows: rows.map((row) => row.slice(0, -1)) });
  }

  return (
    <NodeViewWrapper
      className={cn('group relative my-3 rounded-lg', selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}
    >
      <NodeToolbar onDelete={deleteNode} />
      <div contentEditable={false} className="overflow-x-auto rounded-lg bg-surface-2/30">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={cn(r > 0 && 'odd:bg-surface-2/40')}>
                {row.map((cell, c) => (
                  <td key={c} className={cn('p-0', node.attrs.head && r === 0 && 'bg-surface-2')}>
                    <input
                      value={cell.html}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      className={cn(
                        'w-full bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_1.5px_var(--ring-field)]',
                        node.attrs.head && r === 0 && 'font-semibold',
                      )}
                      placeholder={node.attrs.head && r === 0 ? `Coluna ${c + 1}` : ''}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <div contentEditable={false} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface p-3 shadow-[var(--shadow-sm)]">
          <Button type="button" size="sm" variant="secondary" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Linha
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={removeRow} disabled={rows.length <= 1}>
            <Minus className="h-3.5 w-3.5" /> Linha
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={addColumn}>
            <Plus className="h-3.5 w-3.5" /> Coluna
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={removeColumn} disabled={colCount <= 1}>
            <Minus className="h-3.5 w-3.5" /> Coluna
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" checked={!!node.attrs.head} onChange={(e) => updateAttributes({ head: e.target.checked })} />
            Primeira linha é cabeçalho
          </label>
          <div className="w-40 shrink-0">
            <WidthSelect value={node.attrs.width} onChange={(width) => updateAttributes({ width })} />
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

// --- Botão ---------------------------------------------------------------

const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground',
  secondary: 'bg-surface-2 text-foreground',
  ghost: 'text-primary underline',
};
const ALIGN_CLASS: Record<ButtonAlign, string> = { left: 'justify-start', center: 'justify-center', right: 'justify-end' };

function ButtonNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const variant = (node.attrs.variant ?? 'primary') as ButtonVariant;
  const align = (node.attrs.align ?? 'left') as ButtonAlign;
  const label = node.attrs.label ?? '';
  return (
    <NodeViewWrapper
      className={cn('group relative my-3 rounded-lg p-1', selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}
    >
      <NodeToolbar onDelete={deleteNode} />
      <div contentEditable={false} className={cn('flex', ALIGN_CLASS[align])}>
        <input
          value={label}
          onChange={(e) => updateAttributes({ label: e.target.value })}
          placeholder="Texto do botão"
          aria-label="Texto do botão"
          size={Math.max(10, label.length + 1)}
          className={cn(
            'rounded-lg px-4 py-2 text-center text-sm font-medium outline-none placeholder:opacity-70 focus-visible:ring-[1.5px] focus-visible:ring-[var(--ring-field)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            BUTTON_VARIANT_CLASS[variant],
          )}
        />
      </div>
      {selected && (
        <div contentEditable={false} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface p-2 shadow-[var(--shadow-sm)]">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-muted" />
          <input
            value={node.attrs.href ?? ''}
            onChange={(e) => updateAttributes({ href: e.target.value })}
            placeholder="https://... ou /caminho"
            aria-label="Link do botão"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted focus-visible:shadow-[inset_0_-1.5px_0_var(--ring-field)]"
          />
          <div className="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
            {BUTTON_VARIANTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => updateAttributes({ variant: v })}
                title={BUTTON_VARIANT_LABEL[v]}
                aria-label={BUTTON_VARIANT_LABEL[v]}
                className={cn(
                  'rounded px-2 py-1 text-xs',
                  v === variant ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                {BUTTON_VARIANT_LABEL[v]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
            {BUTTON_ALIGNS.map((a) => {
              const Icon = BUTTON_ALIGN_ICON[a];
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => updateAttributes({ align: a })}
                  title={a === 'left' ? 'Esquerda' : a === 'center' ? 'Centro' : 'Direita'}
                  aria-label={a === 'left' ? 'Esquerda' : a === 'center' ? 'Centro' : 'Direita'}
                  className={cn(
                    'rounded p-1.5',
                    a === align ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

// --- Código --------------------------------------------------------------

export const GalleryBlockNode = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      assetIds: { default: [] },
      layout: { default: 'grid' },
      columns: { default: 3 },
      caption: { default: null },
      width: { default: 'content' },
    };
  },
  parseHTML() {
    return [{ tag: domTag('gallery') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('gallery'), mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(GalleryNodeView);
  },
});

export const TableBlockNode = Node.create({
  name: 'table',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      head: { default: true },
      rows: {
        default: [
          [{ html: '' }, { html: '' }],
          [{ html: '' }, { html: '' }],
        ],
      },
      width: { default: 'content' },
    };
  },
  parseHTML() {
    return [{ tag: domTag('table') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('table'), mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TableNodeView);
  },
});

export const ButtonBlockNode = Node.create({
  name: 'button',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { label: { default: '' }, href: { default: '' }, variant: { default: 'primary' }, align: { default: 'left' } };
  },
  parseHTML() {
    return [{ tag: domTag('button') }];
  },
  renderHTML({ HTMLAttributes }) {
    return [domTag('button'), mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ButtonNodeView);
  },
});

export const EXTRA_ATOMIC_NODES = [GalleryBlockNode, TableBlockNode, ButtonBlockNode, CodeBlockAtomNode, QuoteBlockNode, TocBlockNode];
