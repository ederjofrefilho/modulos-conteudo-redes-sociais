'use client';

import {
  FileText,
  ImagePlus,
  Images,
  Megaphone,
  Minus,
  SquareStack,
  Video,
  Table,
  MousePointerClick,
  Code2,
  Quote,
  ListTree,
  ListCollapse,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { BlockType } from '@app/content-contract';

export type InsertableBlockType = Exclude<BlockType, 'richText'>;

export interface SlashMenuItem {
  type: InsertableBlockType;
  label: string;
  hint: string;
  icon: typeof SquareStack;
}

export const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  { type: 'image', label: 'Imagem', hint: 'Enviar ou escolher uma imagem', icon: ImagePlus },
  { type: 'gallery', label: 'Galeria', hint: '2 ou mais imagens em grade', icon: Images },
  { type: 'callout', label: 'Banner', hint: 'Destaque com fundo e CTA opcional', icon: Megaphone },
  { type: 'stat', label: 'Número em destaque', hint: 'Um valor grande + rótulo', icon: SquareStack },
  { type: 'embed', label: 'Vídeo / painel', hint: 'Link de vídeo ou painel embutível', icon: Video },
  { type: 'table', label: 'Tabela', hint: 'Linhas e colunas', icon: Table },
  { type: 'button', label: 'Botão', hint: 'Chamada para ação com link', icon: MousePointerClick },
  { type: 'code', label: 'Código', hint: 'Bloco monoespaçado', icon: Code2 },
  { type: 'quote', label: 'Citação em destaque', hint: 'Texto grande, com atribuição opcional', icon: Quote },
  { type: 'toc', label: 'Sumário', hint: 'Lista automática de títulos', icon: ListTree },
  { type: 'accordion', label: 'Acordeão', hint: 'Itens que expandem/recolhem', icon: ListCollapse },
  { type: 'divider', label: 'Divisória', hint: 'Linha separadora', icon: Minus },
];

/** Dropdown do comando "/" — controlado de fora (índice ativo vem do plugin, ver slashCommand.ts). */
export function SlashMenuList({
  items,
  selectedIndex,
  onSelect,
}: {
  items: SlashMenuItem[];
  selectedIndex: number;
  onSelect: (item: SlashMenuItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="w-64 rounded-xl bg-surface p-3 text-sm text-muted shadow-[var(--shadow-md)]">
        Nada encontrado.
      </div>
    );
  }

  return (
    <div className="max-h-80 w-72 overflow-y-auto rounded-xl bg-surface p-1 shadow-[var(--shadow-md)]">
      {items.map((item, i) => (
        <button
          key={item.type}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
            i === selectedIndex ? 'bg-surface-2' : 'hover:bg-surface-2/60',
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
            <item.icon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">{item.label}</span>
            <span className="block truncate text-xs text-muted">{item.hint}</span>
          </span>
        </button>
      ))}
      <div className="mt-0.5 flex items-center gap-1 bg-surface-2/70 px-2.5 py-1.5 text-xs text-muted">
        <FileText className="h-3 w-3" /> ↑↓ navegar · Enter inserir · Esc cancelar
      </div>
    </div>
  );
}
