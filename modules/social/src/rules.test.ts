import { describe, expect, it } from 'vitest';
import { countHashtags, countMentions, foldIndex, hasErrors, textLength, validateSocialDraft, type MediaInfo } from './rules.js';

const jpeg = (over: Partial<MediaInfo> = {}): MediaInfo => ({
  id: 'a1',
  width: 1080,
  height: 1350,
  bytes: 300_000,
  mimeType: 'image/jpeg',
  ...over,
});

describe('validateSocialDraft — Instagram', () => {
  it('post válido (1 JPEG 4:5, legenda curta) passa sem erros', () => {
    const issues = validateSocialDraft({ provider: 'INSTAGRAM', text: 'Olá #dados', media: [jpeg()] });
    expect(issues.errors).toEqual({});
  });

  it('exige ao menos 1 imagem', () => {
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: 'x', media: [] }).errors.media).toMatch(/ao menos 1/);
  });

  it('carrossel acima de 10 imagens bloqueia', () => {
    const media = Array.from({ length: 11 }, (_, i) => jpeg({ id: `a${i}` }));
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: 'x', media }).errors.media).toMatch(/até 10/);
  });

  it('legenda acima de 2.200 caracteres bloqueia (conta por caractere, emoji = 1)', () => {
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: 'a'.repeat(2201), media: [jpeg()] }).errors.text).toMatch(/2201/);
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: '😀'.repeat(2200), media: [jpeg()] }).errors.text).toBeUndefined();
  });

  it('mais de 30 hashtags bloqueia', () => {
    const text = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ');
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text, media: [jpeg()] }).errors.text).toMatch(/31 hashtags/);
  });

  it('mais de 20 menções bloqueia', () => {
    const text = Array.from({ length: 21 }, (_, i) => `@perfil${i}`).join(' ');
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text, media: [jpeg()] }).errors.text).toMatch(/21 menções/);
  });

  it('PNG bloqueia (só JPEG)', () => {
    const media = [jpeg({ mimeType: 'image/png' })];
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: '', media }).errors.media).toMatch(/só publica JPEG/);
  });

  it('proporção fora de 4:5..1,91:1 bloqueia; 1,91:1 e 4:5 passam', () => {
    const v = (width: number, height: number) =>
      validateSocialDraft({ provider: 'INSTAGRAM', text: '', media: [jpeg({ width, height })] }).errors.media;
    expect(v(1080, 1920)).toMatch(/proporção/);
    expect(v(1200, 628)).toBeUndefined();
    expect(v(1080, 1350)).toBeUndefined();
  });

  it('acima de 8 MB bloqueia', () => {
    const media = [jpeg({ bytes: 9 * 1024 * 1024 })];
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: '', media }).errors.media).toMatch(/8 MB/);
  });

  it('largura fora de 320..1440 só avisa (a rede redimensiona)', () => {
    const issues = validateSocialDraft({ provider: 'INSTAGRAM', text: 'x', media: [jpeg({ width: 2000, height: 2500 })] });
    expect(hasErrors(issues)).toBe(false);
    expect(issues.warnings.media).toMatch(/redimensionar/);
  });

  it('link no Instagram só avisa que não é clicável', () => {
    const issues = validateSocialDraft({ provider: 'INSTAGRAM', text: 'x', media: [jpeg()], linkUrl: 'https://example.com' });
    expect(issues.errors.linkUrl).toBeUndefined();
    expect(issues.warnings.linkUrl).toMatch(/não é clicável/);
  });
});

describe('validateSocialDraft — LinkedIn', () => {
  it('só texto passa', () => {
    expect(validateSocialDraft({ provider: 'LINKEDIN', text: 'Olá', media: [] }).errors).toEqual({});
  });

  it('vazio de tudo bloqueia', () => {
    expect(validateSocialDraft({ provider: 'LINKEDIN', text: '', media: [] }).errors.text).toMatch(/precisa de texto/);
  });

  it('acima de 3.000 caracteres bloqueia', () => {
    expect(validateSocialDraft({ provider: 'LINKEDIN', text: 'a'.repeat(3001), media: [] }).errors.text).toMatch(/3001/);
  });

  it('PNG e GIF são aceitos; WebP não', () => {
    const v = (mimeType: string) => validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media: [jpeg({ mimeType })] }).errors;
    expect(v('image/png')).toEqual({});
    expect(v('image/gif')).toEqual({});
    expect(v('image/webp').media).toMatch(/JPG, PNG ou GIF/);
  });

  it('imagem com 36 megapixels ou mais bloqueia', () => {
    const media = [jpeg({ width: 8000, height: 4600 })];
    expect(validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media }).errors.media).toMatch(/36 megapixels/);
  });

  it('carrossel (2+ imagens) vira PDF: GIF bloqueia, proporções diferentes avisam', () => {
    const gif = validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media: [jpeg(), jpeg({ id: 'b', mimeType: 'image/gif' })] });
    expect(gif.errors.media).toMatch(/PDF/);
    const mixed = validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media: [jpeg(), jpeg({ id: 'b', width: 1200, height: 1200 })] });
    expect(mixed.errors).toEqual({});
    expect(mixed.warnings.media).toMatch(/mesma proporção/);
    const same = validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media: [jpeg(), jpeg({ id: 'b', mimeType: 'image/png' })] });
    expect(same).toEqual({ errors: {}, warnings: {} });
  });

  it('mais de 20 imagens bloqueia', () => {
    const media = Array.from({ length: 21 }, (_, i) => jpeg({ id: `a${i}` }));
    expect(validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media }).errors.media).toMatch(/até 20/);
  });

  it('imagem + link com prévia bloqueia (a API aceita um tipo de conteúdo só)', () => {
    const issues = validateSocialDraft({
      provider: 'LINKEDIN',
      text: 'x',
      media: [jpeg()],
      linkUrl: 'https://example.com/blog/x',
    });
    expect(issues.errors.linkUrl).toMatch(/OU link/);
  });

  it('link sem http(s) bloqueia', () => {
    expect(validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media: [], linkUrl: 'ftp://x' }).errors.linkUrl).toMatch(/http/);
  });
});

describe('contagens', () => {
  it('hashtags e menções ignoram e-mail e âncora de URL', () => {
    expect(countHashtags('#dados e #BI, url.com/#secao')).toBe(2);
    expect(countMentions('fale com @empresa ou ana@example.com')).toBe(1);
    expect(textLength('olá 😀')).toBe(5);
  });
});

describe('foldIndex — ponto do "ver mais"', () => {
  it('texto curto cabe inteiro', () => {
    expect(foldIndex('LINKEDIN', 'Curto.')).toBeNull();
  });

  it('corta na 3ª quebra de linha no LinkedIn e na 2ª no Instagram', () => {
    const text = 'linha 1\nlinha 2\nlinha 3\nlinha 4';
    expect(text.slice(0, foldIndex('LINKEDIN', text)!)).toBe('linha 1\nlinha 2\nlinha 3');
    expect(text.slice(0, foldIndex('INSTAGRAM', text)!)).toBe('linha 1\nlinha 2');
  });

  it('corta por caracteres sem partir palavra', () => {
    const text = 'palavra '.repeat(40);
    const cut = foldIndex('INSTAGRAM', text)!;
    expect(cut).toBeLessThanOrEqual(125);
    expect(text[cut]).toBe(' ');
  });

  it('índice respeita emoji (par UTF-16) ao fatiar', () => {
    const text = '😀'.repeat(300);
    const cut = foldIndex('LINKEDIN', text)!;
    expect(Array.from(text.slice(0, cut))).toHaveLength(210);
  });
});

describe('validateSocialDraft — vídeo', () => {
  const mp4 = (over: Partial<MediaInfo> = {}): MediaInfo => ({
    id: 'v1',
    width: 1080,
    height: 1920,
    bytes: 23_000_000,
    mimeType: 'video/mp4',
    durationMs: 24_000,
    ...over,
  });

  it('Reels 9:16 de 24 s passa no Instagram; 16:9 só avisa (faixas)', () => {
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: 'x', media: [mp4()] }).errors).toEqual({});
    const wide = validateSocialDraft({ provider: 'INSTAGRAM', text: 'x', media: [mp4({ width: 1920, height: 1080 })] });
    expect(wide.errors).toEqual({});
    expect(wide.warnings.media).toMatch(/16:9.*9:16/);
  });

  it('LinkedIn aceita 16:9 e 9:16 sem aviso', () => {
    for (const m of [mp4(), mp4({ width: 1920, height: 1080 })]) {
      const issues = validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media: [m] });
      expect(issues.errors).toEqual({});
      expect(issues.warnings.media).toBeUndefined();
    }
  });

  it('vídeo vai sozinho: misturado com imagem bloqueia nas duas redes', () => {
    for (const provider of ['INSTAGRAM', 'LINKEDIN'] as const)
      expect(validateSocialDraft({ provider, text: 'x', media: [mp4(), jpeg()] }).errors.media).toMatch(/sozinho/);
  });

  it('duração fora do que a rede aceita bloqueia (Reels até 15 min, LinkedIn até 30 min, os dois a partir de 3 s)', () => {
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: 'x', media: [mp4({ durationMs: 2_000 })] }).errors.media).toMatch(/3 s/);
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: 'x', media: [mp4({ durationMs: 16 * 60_000 })] }).errors.media).toMatch(/15 min/);
    expect(validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media: [mp4({ durationMs: 16 * 60_000 })] }).errors).toEqual({});
    expect(validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media: [mp4({ durationMs: 31 * 60_000 })] }).errors.media).toMatch(/30 min/);
  });

  it('LinkedIn: vídeo e link com prévia não vão juntos; formato fora de MP4 bloqueia', () => {
    expect(validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media: [mp4()], linkUrl: 'https://example.com' }).errors.linkUrl).toMatch(/vídeo OU link/);
    expect(validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media: [mp4({ mimeType: 'video/quicktime' })] }).errors.media).toMatch(/MP4/);
  });
});

describe('formato: reel e story', () => {
  const img = { id: 'i', width: 1080, height: 1920, bytes: 100_000, mimeType: 'image/jpeg' };
  const vid = (durationMs: number, height = 1920) => ({ id: 'v', width: 1080, height, bytes: 5_000_000, mimeType: 'video/mp4', durationMs });

  it('reel exige vídeo', () => {
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: 'x', media: [img], placement: 'reel' }).errors.media).toMatch(/Reel precisa de um vídeo/);
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: 'x', media: [vid(20_000)], placement: 'reel' }).errors).toEqual({});
  });

  it('story: 1 imagem ou 1 vídeo até 60 s, legenda e link só avisam', () => {
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: '', media: [], placement: 'story' }).errors.media).toMatch(/1 imagem ou 1 vídeo/);
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: '', media: [img, img], placement: 'story' }).errors.media).toMatch(/só 1/);
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: '', media: [vid(90_000)], placement: 'story' }).errors.media).toMatch(/até 60 s/);
    const ok = validateSocialDraft({ provider: 'INSTAGRAM', text: 'legenda', media: [img], linkUrl: 'https://x.test', placement: 'story' });
    expect(ok.errors).toEqual({});
    expect(ok.warnings.text).toMatch(/não leva legenda/);
    expect(ok.warnings.linkUrl).toMatch(/link/);
    // Story aceita imagem 9:16 (o feed não aceita).
    expect(validateSocialDraft({ provider: 'INSTAGRAM', text: '', media: [img] }).errors.media).toMatch(/proporção/);
  });

  it('LinkedIn não tem reel nem story', () => {
    expect(validateSocialDraft({ provider: 'LINKEDIN', text: 'x', media: [], placement: 'story' }).errors.placement).toMatch(/não tem Reels nem Stories/);
  });
});
