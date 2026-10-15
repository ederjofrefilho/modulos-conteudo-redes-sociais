import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { IMAGE_TEMPLATES, IMAGE_TEMPLATE_IDS, parseTemplateFields } from '@app/content/image-templates';
import { contentImageDeps } from './index';

// Texto no limite máximo de cada campo: a arte precisa renderizar sem erro
// mesmo no pior caso que o schema deixa passar.
function maxFields(id: (typeof IMAGE_TEMPLATE_IDS)[number]) {
  const fields = IMAGE_TEMPLATES[id].fields.flatMap((f): Array<[string, unknown]> => {
    if (f.kind === 'int') return [[f.name, f.max]];
    if (f.kind === 'choice' || f.kind === 'media') return [];
    // Listas "Rótulo: texto": o máximo de itens, cada um o mais longo que cabe.
    if (f.name === 'questions' || f.name === 'cards') {
      const n = f.name === 'questions' ? 4 : 3;
      const tag = f.name === 'questions' ? 'FIN' : 'Faturamento do mês';
      const per = Math.floor(((f.max ?? 0) - (n - 1)) / n) - tag.length - 2;
      return [[f.name, Array.from({ length: n }, () => `${tag}: ${'R$ 412.380 '.repeat(20).slice(0, per).trim()}`).join('\n')]];
    }
    const plain = 'Dados '.repeat(50).slice(0, f.max ?? 0);
    // Campo com ênfase: os marcadores não contam no limite, então cabem por cima.
    return [[f.name, f.rich ? `**${plain.slice(0, 5)}**${plain.slice(5)}` : plain]];
  });
  return Object.fromEntries(fields);
}

describe('renderização dos modelos (next/og + sharp)', () => {
  const { renderer, codec } = contentImageDeps();

  // Pior caso de texto, com mídia (aparelho desenhado em volta de um print do
  // catálogo) quando o modelo aceita, e no tema escuro (logo branca).
  it.each(IMAGE_TEMPLATE_IDS)('%s sai em JPEG no tamanho do modelo', async (id) => {
    const hasMedia = IMAGE_TEMPLATES[id].fields.some((f) => f.kind === 'media');
    const parsed = parseTemplateFields(id, {
      ...maxFields(id),
      theme: 'escuro',
      ...(hasMedia ? { media: 'print-painel-vendas', frame: 'notebook' } : {}),
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const png = await renderer.render(id, parsed.data, hasMedia ? { source: 'brand', id: 'print-painel-vendas' } : undefined);
    const jpeg = await codec.toJpeg(png);
    const meta = await sharp(jpeg.bytes).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([IMAGE_TEMPLATES[id].width, IMAGE_TEMPLATES[id].height]);
  }, 30_000);
});

describe('logo e fotos do brand book', () => {
  it('renderiza a logo monocromática sobre a foto do MacBook', async () => {
    const { renderer } = contentImageDeps();
    const parsed = parseTemplateFields('social-cover', {
      title: 'O futuro da **gestão**',
      theme: 'escuro',
      logo: 'mono',
      media: 'foto-macbook-site-pedra',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const png = await renderer.render('social-cover', parsed.data, { source: 'brand', id: 'foto-macbook-site-pedra' });
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1350]);
  }, 30_000);
});

describe('social-number encaixa o conteúdo', () => {
  it('encolhe quando rótulo, título de duas linhas, três cards e legenda não cabem', async () => {
    const { numberScale } = await import('./art-data');
    const cards = [
      { tag: 'Faturamento do mês', text: 'R$ 412.380' },
      { tag: 'Margem líquida', text: '31,8%' },
      { tag: 'Caixa livre', text: '!!-R$ 18.240!!' },
    ];
    const cheio = {
      label: 'O que o painel mostra',
      title: 'Três números que o dono **precisa ver** toda segunda-feira',
      caption: 'Tudo isso numa tela, **atualizado sozinho** todo dia de manhã.',
    };
    expect(numberScale(cheio, cards)).toBeLessThan(1);
    expect(numberScale({ title: 'Curto' }, cards.slice(0, 1))).toBe(1);
  });
});
