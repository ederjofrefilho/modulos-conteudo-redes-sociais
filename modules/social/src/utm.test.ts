import { describe, expect, it } from 'vitest';
import { slugify, withUtm } from './utm.js';

describe('withUtm', () => {
  const base = { provider: 'LINKEDIN' as const, postId: 'p1' };

  it('acrescenta os quatro parâmetros', () => {
    const url = new URL(withUtm('https://example.com/blog/x', { ...base, topic: 'Power BI' }));
    expect(url.searchParams.get('utm_source')).toBe('linkedin');
    expect(url.searchParams.get('utm_medium')).toBe('social');
    expect(url.searchParams.get('utm_campaign')).toBe('power-bi');
    expect(url.searchParams.get('utm_content')).toBe('p1');
  });

  it('nunca sobrescreve um utm que já vem no link e mantém o resto da query', () => {
    const url = new URL(withUtm('https://example.com/?a=1&utm_campaign=minha', { ...base, topic: 'x' }));
    expect(url.searchParams.get('utm_campaign')).toBe('minha');
    expect(url.searchParams.get('a')).toBe('1');
    expect(url.searchParams.get('utm_content')).toBe('p1');
  });

  it('sem tema usa a campanha e, sem as duas, "organico"', () => {
    expect(withUtm('https://a.com', { ...base, campaignKey: 'Lançamento Q4' })).toContain('utm_campaign=lancamento-q4');
    expect(withUtm('https://a.com', base)).toContain('utm_campaign=organico');
  });

  it('link inválido ou não http volta como veio', () => {
    expect(withUtm('nada', base)).toBe('nada');
    expect(withUtm('mailto:a@b.com', base)).toBe('mailto:a@b.com');
  });

  it('slugify tira acentos e símbolos', () => {
    expect(slugify('  Caso de Sucesso: Açaí & Cia. ')).toBe('caso-de-sucesso-acai-cia');
  });
});
