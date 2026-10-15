'use client';

import { Trash2 } from 'lucide-react';
import { Select } from '@/components/ui';
import { BLOCK_WIDTHS, type BlockWidth } from '@app/content-contract';

const WIDTH_LABEL: Record<BlockWidth, string> = { content: 'largura do texto', wide: 'larga', full: 'tela cheia' };

/**
 * Chip flutuante de excluir — todo nó atômico/contêiner usa o mesmo.
 * `contentEditable={false}` pra nunca virar texto editável dentro do
 * ProseMirror. Não tem mais o ícone de arraste: isso é o `<DragHandle>`
 * (`@tiptap/extension-drag-handle-react`, montado uma vez em
 * `PostBodyEditor`) — uma alça só, que segue o bloco sob o cursor e arrasta
 * QUALQUER bloco (inclusive parágrafo/título/lista, que antes não se
 * moviam). Um `data-drag-handle` por NodeView aqui competiria com esse
 * mecanismo (dois sistemas de arraste tentando reagir ao mesmo gesto).
 */
export function NodeToolbar({ onDelete }: { onDelete: () => void }) {
  return (
    <div
      contentEditable={false}
      className="absolute -top-3 right-2 z-10 flex items-center gap-1 rounded-lg bg-surface p-0.5 opacity-0 shadow-[var(--shadow-md)] transition-opacity group-hover:opacity-100 focus-within:opacity-100"
    >
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"
        title="Remover bloco"
        aria-label="Remover bloco"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Seletor de largura (content/wide/full) reaproveitado por image/gallery/table. */
export function WidthSelect({ value, onChange }: { value: BlockWidth; onChange: (width: BlockWidth) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as BlockWidth)}>
      {BLOCK_WIDTHS.map((w) => (
        <option key={w} value={w}>
          {WIDTH_LABEL[w]}
        </option>
      ))}
    </Select>
  );
}

const NODE_HTML_TAG: Record<string, string> = {
  image: 'image-block',
  callout: 'callout-block',
  stat: 'stat-block',
  embed: 'embed-block',
  divider: 'divider-block',
  gallery: 'gallery-block',
  table: 'table-block',
  button: 'button-block',
  code: 'code-block-atom',
  quote: 'quote-block',
  toc: 'toc-block',
  columns: 'columns-block',
  column: 'column-block',
  accordion: 'accordion-block',
  accordionItem: 'accordion-item-block',
};

/**
 * `parseHTML`/`renderHTML` nunca são exercitados pela persistência de
 * verdade (`adapter.ts` nunca roda `generateHTML`/`generateJSON` do doc
 * inteiro — só da prosa, que não contém nós atômicos/contêiner) — existem só
 * porque o Tiptap exige alguma serialização DOM para operações internas
 * (ex.: recorte/cópia). Um elemento opaco com `data-type` é suficiente.
 */
export function domTag(name: string) {
  return NODE_HTML_TAG[name] ?? 'div';
}
