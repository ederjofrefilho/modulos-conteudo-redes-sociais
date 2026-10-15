// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import type { ContentBlock } from '@app/content-contract';
import { richTextExtensions } from './richTextExtensions';
import { atomicNodeExtensions } from './nodes';
import { blocksToTiptapDoc, tiptapDocToBlocks } from './adapter';
import { evenSplit, applyColumnDrop, type ColumnDropTarget } from './columnsDragDrop';

const schema = getSchema([...richTextExtensions(), ...atomicNodeExtensions]);

function buildDoc(blocks: ContentBlock[]): PMNode {
  return PMNode.fromJSON(schema, blocksToTiptapDoc(blocks));
}

/** Posição (`nodeAt`-compatível) do bloco de topo de índice `index` — os blocos de teste são todos de 1 "unidade" de topo cada (sem prosa que se funda em mais de um nó), então basta somar `nodeSize`. */
function topLevelPos(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

describe('evenSplit', () => {
  it('distribui igualmente quando divide certo', () => {
    expect(evenSplit(12, 2)).toEqual([6, 6]);
    expect(evenSplit(12, 3)).toEqual([4, 4, 4]);
    expect(evenSplit(12, 4)).toEqual([3, 3, 3, 3]);
  });
  it('sobra vai pros primeiros quando não divide certo', () => {
    expect(evenSplit(12, 5)).toEqual([3, 3, 2, 2, 2]); // 12/5 = 2 resto 2
  });
});

describe('applyColumnDrop — wrap (cria colunas novas)', () => {
  it('soltar na borda ESQUERDA do alvo: origem vira a coluna da esquerda', () => {
    const doc = buildDoc([
      { type: 'stat', value: '40%', label: 'A' },
      { type: 'stat', value: '60%', label: 'B' },
    ]);
    const sourcePos = topLevelPos(doc, 0); // "A"
    const target: ColumnDropTarget = { kind: 'wrap', blockPos: topLevelPos(doc, 1), side: 'left' };
    const next = applyColumnDrop(schema, doc, sourcePos, target);
    expect(next).not.toBeNull();

    const blocks = tiptapDocToBlocks(next!.toJSON());
    expect(blocks).toHaveLength(1);
    const col = blocks[0]!;
    if (col.type !== 'columns') throw new Error('esperava columns');
    expect(col.columns).toHaveLength(2);
    expect(col.columns[0]!.span).toBe(6);
    expect(col.columns[1]!.span).toBe(6);
    expect(col.columns[0]!.blocks[0]).toMatchObject({ type: 'stat', label: 'A' });
    expect(col.columns[1]!.blocks[0]).toMatchObject({ type: 'stat', label: 'B' });
  });

  it('soltar na borda DIREITA do alvo: origem vira a coluna da direita', () => {
    const doc = buildDoc([
      { type: 'stat', value: '40%', label: 'A' },
      { type: 'stat', value: '60%', label: 'B' },
    ]);
    const sourcePos = topLevelPos(doc, 0);
    const target: ColumnDropTarget = { kind: 'wrap', blockPos: topLevelPos(doc, 1), side: 'right' };
    const next = applyColumnDrop(schema, doc, sourcePos, target)!;
    const blocks = tiptapDocToBlocks(next.toJSON());
    const col = blocks[0]!;
    if (col.type !== 'columns') throw new Error('esperava columns');
    expect(col.columns[0]!.blocks[0]).toMatchObject({ label: 'B' });
    expect(col.columns[1]!.blocks[0]).toMatchObject({ label: 'A' });
  });

  it('preserva um terceiro bloco que não participa da operação', () => {
    const doc = buildDoc([
      { type: 'stat', value: '1', label: 'A' },
      { type: 'stat', value: '2', label: 'B' },
      { type: 'stat', value: '3', label: 'C' },
    ]);
    const sourcePos = topLevelPos(doc, 2); // "C"
    const target: ColumnDropTarget = { kind: 'wrap', blockPos: topLevelPos(doc, 0), side: 'left' };
    const next = applyColumnDrop(schema, doc, sourcePos, target)!;
    const blocks = tiptapDocToBlocks(next.toJSON());
    expect(blocks).toHaveLength(2); // [columns(C,A), B]
    const col = blocks[0]!;
    if (col.type !== 'columns') throw new Error('esperava columns');
    expect(col.columns[0]!.blocks[0]).toMatchObject({ label: 'C' });
    expect(col.columns[1]!.blocks[0]).toMatchObject({ label: 'A' });
    expect(blocks[1]).toMatchObject({ type: 'stat', label: 'B' });
  });

  it('recusa (null) quando o alvo é o próprio bloco de origem', () => {
    const doc = buildDoc([{ type: 'stat', value: '1', label: 'A' }, { type: 'divider' }]);
    const sourcePos = topLevelPos(doc, 0);
    const target: ColumnDropTarget = { kind: 'wrap', blockPos: sourcePos, side: 'left' };
    expect(applyColumnDrop(schema, doc, sourcePos, target)).toBeNull();
  });

  it('recusa (null) quando a origem já é um columns/accordion — nunca aninha contêiner', () => {
    const doc = buildDoc([
      {
        type: 'columns',
        width: 'content',
        stackBelow: 'md',
        columns: [
          { span: 6, blocks: [{ type: 'divider' }] },
          { span: 6, blocks: [{ type: 'divider' }] },
        ],
      },
      { type: 'stat', value: '1', label: 'A' },
    ]);
    const sourcePos = topLevelPos(doc, 0); // o columns inteiro
    const target: ColumnDropTarget = { kind: 'wrap', blockPos: topLevelPos(doc, 1), side: 'left' };
    expect(applyColumnDrop(schema, doc, sourcePos, target)).toBeNull();
  });
});

describe('applyColumnDrop — add-column (estende um columns existente)', () => {
  function docWithTwoColumnsPlusExtra() {
    return buildDoc([
      {
        type: 'columns',
        width: 'content',
        stackBelow: 'md',
        columns: [
          { span: 6, blocks: [{ type: 'stat', value: '1', label: 'esquerda' }] },
          { span: 6, blocks: [{ type: 'stat', value: '2', label: 'direita' }] },
        ],
      },
      { type: 'stat', value: '3', label: 'solto' },
    ]);
  }

  it('solto à direita da última coluna vira uma 3ª coluna, spans rebalanceados', () => {
    const doc = docWithTwoColumnsPlusExtra();
    const columnsPos = topLevelPos(doc, 0);
    const sourcePos = topLevelPos(doc, 1); // "solto"
    const target: ColumnDropTarget = { kind: 'add-column', columnsPos, columnIndex: 1, side: 'right' };
    const next = applyColumnDrop(schema, doc, sourcePos, target)!;
    const blocks = tiptapDocToBlocks(next.toJSON());
    expect(blocks).toHaveLength(1);
    const col = blocks[0]!;
    if (col.type !== 'columns') throw new Error('esperava columns');
    expect(col.columns).toHaveLength(3);
    expect(col.columns.map((c) => c.span)).toEqual([4, 4, 4]);
    expect(col.columns.map((c) => (c.blocks[0] as { label: string }).label)).toEqual(['esquerda', 'direita', 'solto']);
  });

  it('solto à esquerda da PRIMEIRA coluna vira a nova 1ª coluna', () => {
    const doc = docWithTwoColumnsPlusExtra();
    const columnsPos = topLevelPos(doc, 0);
    const sourcePos = topLevelPos(doc, 1);
    const target: ColumnDropTarget = { kind: 'add-column', columnsPos, columnIndex: 0, side: 'left' };
    const next = applyColumnDrop(schema, doc, sourcePos, target)!;
    const blocks = tiptapDocToBlocks(next.toJSON());
    const col = blocks[0]!;
    if (col.type !== 'columns') throw new Error('esperava columns');
    expect(col.columns.map((c) => (c.blocks[0] as { label: string }).label)).toEqual(['solto', 'esquerda', 'direita']);
  });

  it('recusa (null) quando o columns já tem 4 colunas', () => {
    const doc = buildDoc([
      {
        type: 'columns',
        width: 'content',
        stackBelow: 'md',
        columns: [
          { span: 3, blocks: [{ type: 'divider' }] },
          { span: 3, blocks: [{ type: 'divider' }] },
          { span: 3, blocks: [{ type: 'divider' }] },
          { span: 3, blocks: [{ type: 'divider' }] },
        ],
      },
      { type: 'stat', value: '1', label: 'solto' },
    ]);
    const target: ColumnDropTarget = { kind: 'add-column', columnsPos: topLevelPos(doc, 0), columnIndex: 3, side: 'right' };
    expect(applyColumnDrop(schema, doc, topLevelPos(doc, 1), target)).toBeNull();
  });
});

describe('applyColumnDrop — remoção/colapso automático ao arrastar para FORA de uma coluna', () => {
  it('remove um bloco de uma coluna com vários blocos e o leva pra um OUTRO columns, sem desfazer nenhum dos dois layouts', () => {
    const doc = buildDoc([
      {
        type: 'columns',
        width: 'content',
        stackBelow: 'md',
        columns: [
          { span: 6, blocks: [{ type: 'stat', value: '1', label: 'fica' }, { type: 'stat', value: '2', label: 'sai' }] },
          { span: 6, blocks: [{ type: 'divider' }] },
        ],
      },
      {
        type: 'columns',
        width: 'content',
        stackBelow: 'md',
        columns: [
          { span: 6, blocks: [{ type: 'divider' }] },
          { span: 6, blocks: [{ type: 'divider' }] },
        ],
      },
    ]);
    // posição do 2º bloco (index 1) dentro da 1ª coluna do PRIMEIRO columns: doc(0) > columns(0) > column(0) > stat(0), stat(1)
    const firstColumnsNode = doc.child(0);
    const firstColumn = firstColumnsNode.child(0);
    const sourcePos = 1 /* entra no columns */ + 1 /* entra na column */ + firstColumn.child(0).nodeSize;
    // alvo: a última coluna do SEGUNDO columns (outro bloco de nível superior).
    const secondColumnsPos = topLevelPos(doc, 1);
    const target: ColumnDropTarget = { kind: 'add-column', columnsPos: secondColumnsPos, columnIndex: 1, side: 'right' };
    const next = applyColumnDrop(schema, doc, sourcePos, target)!;
    expect(next).not.toBeNull();
    const blocks = tiptapDocToBlocks(next.toJSON());
    expect(blocks).toHaveLength(2);

    const first = blocks[0]!;
    if (first.type !== 'columns') throw new Error('esperava columns');
    expect(first.columns).toHaveLength(2); // "sai" saiu, mas "fica" segurou a coluna (não colapsou)
    expect(first.columns[0]!.blocks).toHaveLength(1);
    expect(first.columns[0]!.blocks[0]).toMatchObject({ label: 'fica' });

    const second = blocks[1]!;
    if (second.type !== 'columns') throw new Error('esperava columns');
    expect(second.columns).toHaveLength(3); // ganhou "sai" como 3ª coluna
    expect(second.columns[2]!.blocks[0]).toMatchObject({ label: 'sai' });
  });

  it('esvaziar a última coluna de um layout de 2 desfaz aquele layout (unwrap) e ainda cria o novo columns do drop', () => {
    const doc = buildDoc([
      {
        type: 'columns',
        width: 'content',
        stackBelow: 'md',
        columns: [
          { span: 6, blocks: [{ type: 'stat', value: '1', label: 'única-da-esquerda' }] },
          { span: 6, blocks: [{ type: 'stat', value: '2', label: 'direita' }] },
        ],
      },
      { type: 'divider' },
    ]);
    // posição do único bloco da 1ª coluna: doc(0) > columns(0) > column(0) > stat(0)
    const sourcePos = 1 + 1;
    const target: ColumnDropTarget = { kind: 'wrap', blockPos: topLevelPos(doc, 1), side: 'left' };
    const next = applyColumnDrop(schema, doc, sourcePos, target)!;
    expect(next).not.toBeNull();
    const blocks = tiptapDocToBlocks(next.toJSON());

    // O columns ORIGINAL desfez (só sobrou "direita", que volta pro nível
    // superior) — mas um columns NOVO nasce da própria operação de wrap
    // (origem + divider). Os dois "columns" na saída não são o mesmo: um é o
    // remanescente desfeito virando texto solto, o outro é o destino do drop.
    expect(blocks).toHaveLength(2);
    expect(blocks.some((b) => b.type === 'stat' && (b as { label: string }).label === 'direita')).toBe(true);
    const newColumns = blocks.find((b) => b.type === 'columns');
    if (!newColumns || newColumns.type !== 'columns') throw new Error('esperava um columns novo no resultado');
    expect(newColumns.columns).toHaveLength(2);
    expect(newColumns.columns[0]!.blocks[0]).toMatchObject({ label: 'única-da-esquerda' });
    expect(newColumns.columns[1]!.blocks[0]).toMatchObject({ type: 'divider' });
  });
});
