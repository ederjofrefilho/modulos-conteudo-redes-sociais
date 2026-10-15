import { describe, expect, it } from 'vitest';
import { sanitizeBlocks, sanitizeRichText, contentBlocksSchema, type ContentBlock } from './blocks.js';

describe('sanitizeRichText', () => {
  it('remove tags fora da allow-list (script, div, style)', () => {
    const html = sanitizeRichText('<p>oi</p><script>alert(1)</script><div>fora</div>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<div>');
    expect(html).toContain('<p>oi</p>');
  });

  it('mantém h4 (novo na allow-list)', () => {
    expect(sanitizeRichText('<h4>título</h4>')).toBe('<h4>título</h4>');
  });
});

describe('sanitizeBlocks — recursivo', () => {
  it('sanitiza richText.html DENTRO de uma coluna, não só no topo', () => {
    const blocks = contentBlocksSchema.parse([
      {
        type: 'columns',
        columns: [
          { span: 6, blocks: [{ type: 'richText', html: '<p>seguro</p><script>alert(1)</script>' }] },
          { span: 6, blocks: [] },
        ],
      },
    ]) as ContentBlock[];

    const [sanitized] = sanitizeBlocks(blocks);
    expect(sanitized.type).toBe('columns');
    if (sanitized.type !== 'columns') throw new Error('unreachable');
    const richTextInColumn = sanitized.columns[0]!.blocks[0]!;
    expect(richTextInColumn.type).toBe('richText');
    if (richTextInColumn.type !== 'richText') throw new Error('unreachable');
    expect(richTextInColumn.html).not.toContain('<script>');
    expect(richTextInColumn.html).toContain('<p>seguro</p>');
  });

  it('sanitiza richText.html dentro de um item de acordeão', () => {
    const blocks = contentBlocksSchema.parse([
      {
        type: 'accordion',
        items: [{ title: 'Item', blocks: [{ type: 'richText', html: '<img src=x onerror=alert(1)><p>ok</p>' }] }],
      },
    ]) as ContentBlock[];

    const [sanitized] = sanitizeBlocks(blocks);
    if (sanitized.type !== 'accordion') throw new Error('unreachable');
    const richText = sanitized.items[0]!.blocks[0]!;
    if (richText.type !== 'richText') throw new Error('unreachable');
    expect(richText.html).not.toContain('onerror');
    expect(richText.html).not.toContain('<img');
  });

  it('sanitiza célula de tabela com allow-list mais estreita (sem h2, por exemplo)', () => {
    const blocks = contentBlocksSchema.parse([
      { type: 'table', rows: [[{ html: '<strong>ok</strong><h2>fora</h2>' }]] },
    ]) as ContentBlock[];

    const [sanitized] = sanitizeBlocks(blocks);
    if (sanitized.type !== 'table') throw new Error('unreachable');
    expect(sanitized.rows[0]![0]!.html).toContain('<strong>ok</strong>');
    expect(sanitized.rows[0]![0]!.html).not.toContain('<h2>');
  });

  it('não mexe em blocos sem HTML (image/divider/stat)', () => {
    const blocks = contentBlocksSchema.parse([
      { type: 'image', assetId: 'a' },
      { type: 'divider' },
      { type: 'stat', value: '40%', label: 'x' },
    ]) as ContentBlock[];
    expect(sanitizeBlocks(blocks)).toEqual(blocks);
  });
});
