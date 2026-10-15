// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '@app/content-contract';
import { blocksToTiptapDoc, tiptapDocToBlocks } from './adapter';

/** `blocks -> doc -> blocks` — o invariante que importa é IDEMPOTÊNCIA: aplicar duas vezes dá o mesmo resultado, não que o objeto seja byte-a-byte igual à entrada bruta (o adapter normaliza, e isso é intencional). */
function roundTrip(blocks: ContentBlock[]): ContentBlock[] {
  return tiptapDocToBlocks(blocksToTiptapDoc(blocks));
}

describe('adapter — ida e volta plana (regressão do comportamento antigo)', () => {
  it('richText -> image -> richText -> callout -> richText mantém a sequência', () => {
    const blocks: ContentBlock[] = [
      { type: 'richText', html: '<p>abertura</p>' },
      { type: 'image', assetId: 'a1', width: 'content' },
      { type: 'richText', html: '<p>meio</p>' },
      { type: 'callout', variant: 'info', text: 'atenção' },
      { type: 'richText', html: '<p>fim</p>' },
    ];
    const once = roundTrip(blocks);
    expect(once.map((b) => b.type)).toEqual(['richText', 'image', 'richText', 'callout', 'richText']);
    expect(roundTrip(once)).toEqual(once); // idempotente
  });

  it('nó atômico no início e no fim do documento (sem prosa vizinha)', () => {
    const blocks: ContentBlock[] = [{ type: 'divider' }, { type: 'richText', html: '<p>meio</p>' }, { type: 'divider' }];
    const once = roundTrip(blocks);
    expect(once).toEqual(blocks);
  });
});

describe('adapter — colunas (recursivo)', () => {
  it('preserva conteúdo de cada coluna e é idempotente', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'columns',
        width: 'content',
        stackBelow: 'md',
        columns: [
          { span: 8, blocks: [{ type: 'richText', html: '<p>coluna esquerda</p>' }] },
          { span: 4, blocks: [{ type: 'image', assetId: 'a1', width: 'content' }] },
        ],
      },
    ];
    const once = roundTrip(blocks);
    expect(once).toHaveLength(1);
    const col = once[0]!;
    if (col.type !== 'columns') throw new Error('esperava columns');
    expect(col.columns).toHaveLength(2);
    expect(col.columns[0]!.span).toBe(8);
    expect(col.columns[0]!.blocks[0]).toMatchObject({ type: 'richText' });
    expect(col.columns[1]!.blocks[0]).toMatchObject({ type: 'image', assetId: 'a1' });

    expect(roundTrip(once)).toEqual(once);
  });

  it('coluna vazia sobrevive à ida e volta (não perde a contagem/spans)', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'columns',
        width: 'content',
        stackBelow: 'md',
        columns: [
          { span: 6, blocks: [{ type: 'richText', html: '<p>só a esquerda tem conteúdo</p>' }] },
          { span: 6, blocks: [] },
        ],
      },
    ];
    const once = roundTrip(blocks);
    const col = once[0]!;
    if (col.type !== 'columns') throw new Error('esperava columns');
    expect(col.columns).toHaveLength(2);
    expect(col.columns[1]!.blocks).toEqual([]);
  });

  it('coluna com só um parágrafo vazio normaliza para blocks: [] — idempotente depois disso', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'columns',
        width: 'content',
        stackBelow: 'md',
        columns: [
          { span: 6, blocks: [] },
          { span: 6, blocks: [] },
        ],
      },
    ];
    // blocksToTiptapDoc preenche coluna vazia com um parágrafo vazio (pro
    // autor conseguir clicar dentro) — tiptapDocToBlocks precisa filtrar
    // esse parágrafo de volta, não gravar um `richText` vazio.
    const once = roundTrip(blocks);
    const col = once[0]!;
    if (col.type !== 'columns') throw new Error('esperava columns');
    expect(col.columns[0]!.blocks).toEqual([]);
    expect(col.columns[1]!.blocks).toEqual([]);
    expect(roundTrip(once)).toEqual(once);
  });

  it('prosa consecutiva dentro de uma coluna coalesce num único richText', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'columns',
        width: 'content',
        stackBelow: 'md',
        columns: [
          {
            span: 6,
            blocks: [
              { type: 'richText', html: '<p>um</p>' },
              { type: 'richText', html: '<p>dois</p>' },
            ],
          },
          { span: 6, blocks: [] },
        ],
      },
    ];
    const back = roundTrip(blocks);
    const col = back[0]!;
    if (col.type !== 'columns') throw new Error('esperava columns');
    // As duas richText viraram uma só (mesmo comportamento do topo do documento).
    expect(col.columns[0]!.blocks).toHaveLength(1);
    expect(col.columns[0]!.blocks[0]).toMatchObject({ type: 'richText' });
  });
});

describe('adapter — tabela', () => {
  it('preserva células e a flag de cabeçalho', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'table',
        head: true,
        width: 'content',
        rows: [
          [{ html: 'Coluna A' }, { html: 'Coluna B' }],
          [{ html: '1' }, { html: '2' }],
        ],
      },
    ];
    const once = roundTrip(blocks);
    expect(once).toEqual(blocks);
    expect(roundTrip(once)).toEqual(once);
  });
});

describe('adapter — acordeão (recursivo)', () => {
  it('preserva título e conteúdo de cada item, idempotente', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'accordion',
        items: [
          { title: 'Pergunta 1', blocks: [{ type: 'richText', html: '<p>resposta 1</p>' }] },
          { title: 'Pergunta 2', blocks: [{ type: 'quote', text: 'citação', attribution: 'Fulano' }] },
        ],
      },
    ];
    const once = roundTrip(blocks);
    const acc = once[0]!;
    if (acc.type !== 'accordion') throw new Error('esperava accordion');
    expect(acc.items).toHaveLength(2);
    expect(acc.items[0]!.title).toBe('Pergunta 1');
    expect(acc.items[1]!.blocks[0]).toMatchObject({ type: 'quote', text: 'citação' });
    expect(roundTrip(once)).toEqual(once);
  });
});
