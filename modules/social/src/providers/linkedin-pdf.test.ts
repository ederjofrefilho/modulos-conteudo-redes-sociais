import { describe, expect, it } from 'vitest';
import { documentTitleFor } from './linkedin-pdf.js';

describe('documentTitleFor', () => {
  it('prefere o título do artigo de origem', () => {
    expect(documentTitleFor('Primeira linha', '  Caso TTP  ')).toBe('Caso TTP');
  });

  it('sem artigo, usa a 1ª linha não vazia do texto, sem hashtags', () => {
    expect(documentTitleFor('\n  #dados  \nFechamento em 1 dia #pme\nresto', null)).toBe(
      'Fechamento em 1 dia',
    );
  });

  it('texto vazio cai num título genérico', () => {
    expect(documentTitleFor('', null)).toBe('Carrossel');
  });

  it('corta títulos longos numa palavra inteira', () => {
    const title = documentTitleFor(`${'palavra '.repeat(30)}fim`, null);
    expect(title.length).toBeLessThanOrEqual(100);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toMatch(/ …$/);
  });
});
