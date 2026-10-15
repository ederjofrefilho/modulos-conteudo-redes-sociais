import { describe, expect, it } from 'vitest';
import {
  contentBlockSchema,
  contentBlocksSchema,
  walkBlocks,
  imageAssetIdsIn,
  emptyBlock,
  safeHrefSchema,
  safeEmbedUrlSchema,
} from './blocks.js';

describe('contentBlockSchema — colunas', () => {
  it('aceita quando a soma dos spans dá 12', () => {
    const block = {
      type: 'columns',
      columns: [
        { span: 6, blocks: [{ type: 'divider' }] },
        { span: 6, blocks: [] },
      ],
    };
    expect(contentBlockSchema.safeParse(block).success).toBe(true);
  });

  it('rejeita quando a soma dos spans não dá 12', () => {
    const block = {
      type: 'columns',
      columns: [
        { span: 5, blocks: [] },
        { span: 5, blocks: [] },
      ],
    };
    const result = contentBlockSchema.safeParse(block);
    expect(result.success).toBe(false);
  });

  it('rejeita menos de 2 colunas', () => {
    const block = { type: 'columns', columns: [{ span: 12, blocks: [] }] };
    expect(contentBlockSchema.safeParse(block).success).toBe(false);
  });

  it('rejeita mais de 4 colunas', () => {
    const block = {
      type: 'columns',
      columns: Array.from({ length: 5 }, () => ({ span: 2, blocks: [] })),
    };
    expect(contentBlockSchema.safeParse(block).success).toBe(false);
  });

  it('NUNCA aceita columns dentro de uma coluna — nem em tempo de execução, não só de tipo', () => {
    const block = {
      type: 'columns',
      columns: [
        { span: 6, blocks: [{ type: 'columns', columns: [{ span: 12, blocks: [] }] }] },
        { span: 6, blocks: [] },
      ],
    };
    expect(contentBlockSchema.safeParse(block).success).toBe(false);
  });

  it('NUNCA aceita accordion dentro de uma coluna', () => {
    const block = {
      type: 'columns',
      columns: [
        { span: 6, blocks: [{ type: 'accordion', items: [{ title: 'x', blocks: [] }] }] },
        { span: 6, blocks: [] },
      ],
    };
    expect(contentBlockSchema.safeParse(block).success).toBe(false);
  });
});

describe('contentBlockSchema — tabela', () => {
  it('rejeita linhas com número de colunas diferente entre si', () => {
    const block = {
      type: 'table',
      rows: [[{ html: 'a' }, { html: 'b' }], [{ html: 'c' }]],
    };
    expect(contentBlockSchema.safeParse(block).success).toBe(false);
  });

  it('aceita tabela sem nenhuma linha ainda (rascunho)', () => {
    const block = { type: 'table', rows: [] };
    expect(contentBlockSchema.safeParse(block).success).toBe(true);
  });
});

describe('defaults', () => {
  it('preenche width/variant/layout/etc. quando omitidos', () => {
    const result = contentBlockSchema.parse({ type: 'image', assetId: 'abc' });
    expect(result).toMatchObject({ type: 'image', width: 'content' });

    const gallery = contentBlockSchema.parse({ type: 'gallery' });
    expect(gallery).toMatchObject({ assetIds: [], layout: 'grid', columns: 3, width: 'content' });
  });

  it('emptyBlock produz algo que sempre passa no schema', () => {
    // `richText` fica de fora de propósito: `emptyBlock('richText')` existe
    // pra completude do switch, mas nada no editor a chama de verdade — a
    // opção "Texto" do InsertControl insere um `paragraph` do Tiptap
    // diretamente, nunca um bloco `richText` vazio (que o schema recusa por
    // `html.min(1)`, e corretamente: um richText vazio nunca deveria existir
    // gravado, é sempre filtrado no adapter antes de virar bloco).
    const types = [
      'image',
      'callout',
      'stat',
      'embed',
      'divider',
      'gallery',
      'table',
      'button',
      'code',
      'quote',
      'toc',
      'columns',
      'accordion',
    ] as const;
    for (const type of types) {
      const result = contentBlockSchema.safeParse(emptyBlock(type));
      expect(result.success, `emptyBlock('${type}') deveria ser válido`).toBe(true);
    }
  });
});

describe('safeHrefSchema / safeEmbedUrlSchema', () => {
  it('aceita http(s), mailto e caminho relativo', () => {
    for (const v of ['https://example.com', 'http://x.com', 'mailto:a@b.com', '/contato', '']) {
      expect(safeHrefSchema.safeParse(v).success, v).toBe(true);
    }
  });

  it('recusa javascript: e outros esquemas perigosos', () => {
    for (const v of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)']) {
      expect(safeHrefSchema.safeParse(v).success, v).toBe(false);
    }
  });

  it('embed não aceita mailto (não faz sentido incorporar um link de e-mail)', () => {
    expect(safeEmbedUrlSchema.safeParse('mailto:a@b.com').success).toBe(false);
    expect(safeEmbedUrlSchema.safeParse('https://youtube.com/watch?v=x').success).toBe(true);
  });

  it('button.href e callout.ctaHref recusam javascript: na validação do bloco inteiro', () => {
    expect(contentBlockSchema.safeParse({ type: 'button', label: 'Ir', href: 'javascript:alert(1)' }).success).toBe(false);
    expect(
      contentBlockSchema.safeParse({ type: 'callout', text: 'x', ctaLabel: 'Ir', ctaHref: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });
});

describe('walkBlocks / imageAssetIdsIn — recursivo', () => {
  const nested = contentBlocksSchema.parse([
    { type: 'richText', html: '<p>oi</p>' },
    {
      type: 'columns',
      columns: [
        { span: 6, blocks: [{ type: 'image', assetId: 'img-1' }] },
        { span: 6, blocks: [{ type: 'gallery', assetIds: ['img-2', 'img-3'] }] },
      ],
    },
    {
      type: 'accordion',
      items: [{ title: 'Item', blocks: [{ type: 'image', assetId: 'img-4' }] }],
    },
  ]);

  it('acha bloco de imagem dentro de coluna e de acordeão', () => {
    const types: string[] = [];
    walkBlocks(nested, (b) => types.push(b.type));
    expect(types).toContain('image');
    expect(types.filter((t) => t === 'image')).toHaveLength(2); // um em columns, um em accordion
  });

  it('imageAssetIdsIn coleta ids de image E gallery em qualquer profundidade', () => {
    expect(imageAssetIdsIn(nested).sort()).toEqual(['img-1', 'img-2', 'img-3', 'img-4'].sort());
  });
});
