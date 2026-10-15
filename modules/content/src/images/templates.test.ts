import { describe, expect, it } from 'vitest';
import {
  BRAND_MEDIA,
  IMAGE_TEMPLATES,
  IMAGE_TEMPLATE_IDS,
  labeledLines,
  describeBrandMedia,
  describeImageTemplates,
  parseRich,
  parseTemplateFields,
  plainRich,
  renderImageRequestSchema,
  resolveTemplate,
  saveRenderedImageRequestSchema,
} from './templates';

describe('modelos de imagem', () => {
  it('peças de rede social saem em 1080×1350 (padrão do design system); blog em 1200×630', () => {
    for (const id of IMAGE_TEMPLATE_IDS) {
      const t = IMAGE_TEMPLATES[id];
      if (t.target === 'social') expect([t.width, t.height]).toEqual([1080, 1350]);
      else expect([t.width, t.height]).toEqual([1200, 630]);
    }
  });

  it('aceita campos válidos, aplica o fundo padrão e transforma opcional vazio em ausente', () => {
    const r = parseTemplateFields('blog-cover', { title: '  Dados num lugar só  ', category: '' });
    expect(r.success && r.data).toMatchObject({ title: 'Dados num lugar só', category: undefined, theme: 'claro' });
    const c = parseTemplateFields('social-cover', { title: 'T' });
    expect(c.success && c.data).toMatchObject({ theme: 'escuro', frame: 'notebook', arrow: 'nao' });
  });

  it('recusa texto acima do limite com erro no campo, sem contar os marcadores de ênfase', () => {
    const r = parseTemplateFields('social-quote', { quote: 'x'.repeat(181), author: 'Ana' });
    expect(!r.success && r.error.flatten().fieldErrors).toHaveProperty('quote');
    const ok = parseTemplateFields('social-quote', { quote: `**${'x'.repeat(180)}**`, author: 'Ana' });
    expect(ok.success).toBe(true);
  });

  it('só um marca-texto por campo', () => {
    const r = parseTemplateFields('social-slide', { title: '==a== e ==b==' });
    expect(!r.success && r.error.flatten().fieldErrors).toHaveProperty('title');
  });

  it('exige campo obrigatório', () => {
    const r = parseTemplateFields('social-stat', { caption: 'legenda' });
    expect(!r.success && r.error.flatten().fieldErrors).toHaveProperty('value');
  });

  it('página: converte número vindo de formulário, exige os dois juntos e recusa slide além do total', () => {
    const ok = parseTemplateFields('social-slide', { title: 'T', index: '2', total: '7' });
    expect(ok.success && ok.data).toMatchObject({ index: 2, total: 7 });
    const empty = parseTemplateFields('social-slide', { title: 'T', index: '', total: '' });
    expect(empty.success && empty.data).toMatchObject({ index: undefined, total: undefined });
    expect(parseTemplateFields('social-slide', { title: 'T', index: 2 }).success).toBe(false);
    const bad = parseTemplateFields('social-slide', { title: 'T', index: 8, total: 7 });
    expect(!bad.success && bad.error.flatten().fieldErrors).toHaveProperty('index');
  });

  it('mídia: aceita id do catálogo ou de asset, recusa o resto; social-mockup exige', () => {
    expect(parseTemplateFields('social-slide', { title: 'T', media: 'print-painel-vendas' }).success).toBe(true);
    expect(parseTemplateFields('social-slide', { title: 'T', media: 'cmv2r4acj0005kz063demmffa' }).success).toBe(true);
    expect(parseTemplateFields('social-slide', { title: 'T', media: 'https://x/y.png' }).success).toBe(false);
    expect(parseTemplateFields('social-mockup', { title: 'T' }).success).toBe(false);
  });

  it('escolha fora da lista é recusada', () => {
    const r = parseTemplateFields('social-cover', { title: 'T', theme: 'teal' });
    expect(!r.success && r.error.flatten().fieldErrors).toHaveProperty('theme');
  });

  it('alt é obrigatório para salvar', () => {
    expect(saveRenderedImageRequestSchema.safeParse({ template: 'social-cover', fields: {}, alt: ' ' }).success).toBe(false);
  });

  it('descrição para o MCP cita todos os modelos, limites e o catálogo', () => {
    const d = describeImageTemplates();
    for (const id of IMAGE_TEMPLATE_IDS) expect(d).toContain(id);
    expect(d).toContain('quote (até 180 caracteres');
    for (const m of BRAND_MEDIA) expect(describeBrandMedia()).toContain(m.id);
  });
});

describe('nomes antigos dos modelos', () => {
  it('caem no modelo novo, renomeando campo quando mudou', () => {
    expect(resolveTemplate('li-card', { title: 'T' })).toEqual({ template: 'social-cover', fields: { title: 'T' } });
    expect(resolveTemplate('ig-carousel-slide', { title: 'T', body: 'B' })).toEqual({
      template: 'social-slide',
      fields: { title: 'T', subtitle: 'B' },
    });
    expect(resolveTemplate('nao-existe')).toBeNull();
  });

  it('o pedido aceita o nome antigo', () => {
    const r = renderImageRequestSchema.safeParse({ template: 'ig-stat', fields: { value: '1' } });
    expect(r.success && r.data.template).toBe('social-stat');
    expect(renderImageRequestSchema.safeParse({ template: 'outro' }).success).toBe(false);
  });
});

describe('texto com ênfase', () => {
  it('separa negrito e marca-texto, e deixa marcador sem par como texto', () => {
    expect(parseRich('Cada sistema conta **uma versão diferente.**')).toEqual([
      { text: 'Cada sistema conta ', style: 'normal' },
      { text: 'uma versão diferente.', style: 'bold' },
    ]);
    expect(parseRich('O que muda ==é como se conectam==')).toEqual([
      { text: 'O que muda ', style: 'normal' },
      { text: 'é como se conectam', style: 'mark' },
    ]);
    expect(plainRich('**a** b ==c== d**')).toBe('a b c d**');
  });
});

describe('elementos do brand book (14/10/2026)', () => {
  it('!!carmim!! marca a palavra da dor e não conta no limite; no máximo um por campo', () => {
    expect(parseRich('Três planilhas. !!Três respostas.!!')).toEqual([
      { text: 'Três planilhas. ', style: 'normal' },
      { text: 'Três respostas.', style: 'pain' },
    ]);
    expect(plainRich('no !!feeling?!!')).toBe('no feeling?');
    const two = parseTemplateFields('social-slide', { title: '!!a!! e !!b!!' });
    expect(!two.success && two.error.flatten().fieldErrors).toHaveProperty('title');
    expect(parseTemplateFields('social-slide', { title: '!!dor!! e ==resposta==' }).success).toBe(true);
  });

  it('labeledLines separa "Rótulo: texto" só quando o rótulo é curto', () => {
    expect(labeledLines('FIN: Quanto caixa sobra?\nDe onde saiu esse número?')).toEqual([
      { tag: 'FIN', text: 'Quanto caixa sobra?' },
      { tag: null, text: 'De onde saiu esse número?' },
    ]);
    expect(labeledLines('Reunião às 10:30')[0]!.tag).toBeNull();
  });

  it('social-question: até 4 perguntas, sigla de até 4 letras', () => {
    expect(parseTemplateFields('social-question', { questions: 'FIN: a\nCOM: b' }).success).toBe(true);
    const many = parseTemplateFields('social-question', { questions: 'a\nb\nc\nd\ne' });
    expect(!many.success && many.error.flatten().fieldErrors).toHaveProperty('questions');
    const longTag = parseTemplateFields('social-question', { questions: 'FINANCEIRO: a' });
    expect(!longTag.success && longTag.error.flatten().fieldErrors).toHaveProperty('questions');
  });

  it('social-number: cada card é "Rótulo: valor", até 3', () => {
    expect(parseTemplateFields('social-number', { cards: 'Faturamento: R$ 412.380\nMargem: 31,8%' }).success).toBe(true);
    const bad = parseTemplateFields('social-number', { cards: 'R$ 412.380' });
    expect(!bad.success && bad.error.flatten().fieldErrors).toHaveProperty('cards');
  });

  it('social-cta: botão de contorno por padrão, cheio como alternativa', () => {
    const r = parseTemplateFields('social-cta', { title: 'T', button: 'Faça o diagnóstico' });
    expect(r.success && r.data).toMatchObject({ buttonStyle: 'contorno' });
    expect(parseTemplateFields('social-cta', { title: 'T', button: 'B', buttonStyle: 'cheio', url: 'example.com' }).success).toBe(true);
  });
});
