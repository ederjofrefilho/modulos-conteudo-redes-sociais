import { describe, expect, it } from 'vitest';
import {
  linkedinApiVersion,
  linkedinAuthorUrn,
  linkedinPostUrl,
  toLittleText,
} from './linkedin-text.js';

describe('toLittleText', () => {
  it('escapa todos os reservados do "little text"', () => {
    expect(toLittleText('a|b{c}d@e[f]g(h)i<j>k\\l*m_n~o')).toBe(
      'a\\|b\\{c\\}d\\@e\\[f\\]g\\(h\\)i\\<j\\>k\\\\l\\*m\\_n\\~o',
    );
  });

  it('mantém texto comum, acentos e quebras de linha', () => {
    expect(toLittleText('Dados para PMEs.\n\nGestão à vista!')).toBe(
      'Dados para PMEs.\n\nGestão à vista!',
    );
  });

  it('transforma hashtag no template e ela continua sendo hashtag', () => {
    expect(toLittleText('Veja #dados e #gestão.')).toBe(
      'Veja {hashtag|\\#|dados} e {hashtag|\\#|gestão}.',
    );
  });

  it('hashtag no início, depois de quebra e com sublinhado', () => {
    expect(toLittleText('#BI\n#power_bi')).toBe('{hashtag|\\#|BI}\n{hashtag|\\#|power\\_bi}');
  });

  it('"#" que não é hashtag sai escapado', () => {
    expect(toLittleText('C# e # sozinho e item#1')).toBe('C\\# e \\# sozinho e item\\#1');
  });

  it('menção vira texto literal (sem URN não há menção)', () => {
    expect(toLittleText('fale com @fulano')).toBe('fale com \\@fulano');
  });
});

describe('linkedinApiVersion', () => {
  it('usa o mês de dois meses atrás', () => {
    expect(linkedinApiVersion(new Date('2026-10-10T12:00:00Z'), {})).toBe('202608');
    expect(linkedinApiVersion(new Date('2027-01-05T12:00:00Z'), {})).toBe('202611');
  });

  it('LINKEDIN_API_VERSION força o valor quando é AAAAMM', () => {
    expect(
      linkedinApiVersion(new Date('2026-10-10T12:00:00Z'), { LINKEDIN_API_VERSION: '202609' }),
    ).toBe('202609');
    expect(
      linkedinApiVersion(new Date('2026-10-10T12:00:00Z'), { LINKEDIN_API_VERSION: 'latest' }),
    ).toBe('202608');
  });
});

describe('URNs e links', () => {
  it('autor por tipo de conta', () => {
    expect(linkedinAuthorUrn('PERSON', 'abc')).toBe('urn:li:person:abc');
    expect(linkedinAuthorUrn('ORGANIZATION', '123')).toBe('urn:li:organization:123');
  });

  it('link público do post', () => {
    expect(linkedinPostUrl('urn:li:share:1')).toBe(
      'https://www.linkedin.com/feed/update/urn:li:share:1/',
    );
  });
});
