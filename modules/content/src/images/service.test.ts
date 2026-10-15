import { describe, expect, it, vi } from 'vitest';
import type { Ctx } from '@app/core';
import {
  importContentImage,
  previewContentImage,
  renderContentImage,
  slugForFile,
  type ContentImageDeps,
} from './service';

const ctx = { actor: { id: 'u1', email: 'a@b.c', name: 'A', role: 'MEMBER' } } as unknown as Ctx;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function deps(overrides: Partial<ContentImageDeps> = {}) {
  const saved: Array<Record<string, unknown>> = [];
  const d: ContentImageDeps = {
    renderer: { render: vi.fn(async () => PNG) },
    codec: {
      probe: vi.fn(async () => ({ width: 800, height: 600 })),
      toJpeg: vi.fn(async () => ({ bytes: JPEG, width: 1080, height: 1350 })),
    },
    storage: { put: vi.fn(async (pathname: string) => ({ url: `https://blob/${pathname}`, pathname })) },
    lookup: async () => ['93.184.216.34'],
    saveAsset: async (input) => {
      saved.push(input);
      return { id: 'asset1', ...input };
    },
    ...overrides,
  };
  return { d, saved };
}

describe('slugForFile', () => {
  it('tira acento e símbolo', () => {
    expect(slugForFile('Dados: o que é "IA"?')).toBe('dados-o-que-e-ia');
    expect(slugForFile('!!!')).toBe('imagem');
  });
});

describe('renderContentImage', () => {
  it('renderiza, converte para JPEG, sobe e registra com alt', async () => {
    const { d, saved } = deps();
    await renderContentImage(
      { template: 'ig-quote', fields: { quote: 'Dado bom é dado usado', author: 'Ana' }, alt: 'Citação' },
      ctx,
      d,
    );
    expect(d.renderer.render).toHaveBeenCalledWith(
      'social-quote',
      expect.objectContaining({ quote: 'Dado bom é dado usado', author: 'Ana', theme: 'escuro' }),
      undefined,
    );
    expect(d.storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^content\/generated\/social-quote-dado-bom/),
      JPEG,
      'image/jpeg',
    );
    expect(saved[0]).toMatchObject({ mimeType: 'image/jpeg', width: 1080, height: 1350, alt: 'Citação', bytes: JPEG.byteLength });
  });

  it('não renderiza nada com campo inválido', async () => {
    const { d } = deps();
    await expect(
      renderContentImage({ template: 'blog-cover', fields: { title: 'x'.repeat(91) }, alt: 'a' }, ctx, d),
    ).rejects.toThrow(/Campos inválidos/);
    expect(d.renderer.render).not.toHaveBeenCalled();
  });

  it('exige alt', async () => {
    const { d } = deps();
    await expect(renderContentImage({ template: 'li-card', fields: { title: 'T' } }, ctx, d)).rejects.toThrow();
    expect(d.renderer.render).not.toHaveBeenCalled();
  });
});

describe('mídia da arte', () => {
  it('item do catálogo vai para o renderizador sem consultar o banco', async () => {
    const findAssets = vi.fn(async () => []);
    const { d } = deps({ findAssets });
    await previewContentImage({ template: 'social-slide', fields: { title: 'T', media: 'print-painel-vendas' } }, d);
    expect(findAssets).not.toHaveBeenCalled();
    expect(d.renderer.render).toHaveBeenCalledWith('social-slide', expect.anything(), { source: 'brand', id: 'print-painel-vendas' });
  });

  it('imagem da biblioteca é resolvida pelo id; inexistente vira erro no campo', async () => {
    const asset = { id: 'cmv2r4acj0005kz063demmffa', url: 'https://blob/p.png', width: 1600, height: 900 };
    const { d } = deps({ findAssets: async (ids) => (ids[0] === asset.id ? [asset] : []) });
    await previewContentImage({ template: 'social-mockup', fields: { title: 'T', media: asset.id } }, d);
    expect(d.renderer.render).toHaveBeenCalledWith('social-mockup', expect.anything(), { source: 'asset', ...asset });
    await expect(
      previewContentImage({ template: 'social-mockup', fields: { title: 'T', media: 'cxxxxxxxxxxxxxxxxxxxxxxxx' } }, d),
    ).rejects.toThrow(/Campos inválidos/);
  });
});

describe('previewContentImage', () => {
  it('não grava nada', async () => {
    const { d } = deps();
    const out = await previewContentImage({ template: 'li-card', fields: { title: 'T' } }, d);
    expect(out.bytes).toBe(JPEG);
    expect(d.storage.put).not.toHaveBeenCalled();
  });
});

describe('importContentImage', () => {
  it('blog mantém o formato original', async () => {
    const { d, saved } = deps({ fetch: async () => new Response(Buffer.from(PNG)) });
    await importContentImage({ url: 'https://cdn.exemplo/fotos/Equipe.png', alt: 'Equipe' }, ctx, d);
    expect(d.codec.toJpeg).not.toHaveBeenCalled();
    expect(d.storage.put).toHaveBeenCalledWith('content/imported/equipe.png', PNG, 'image/png');
    expect(saved[0]).toMatchObject({ mimeType: 'image/png', width: 800, height: 600 });
  });

  it('social converte para JPEG com teto de 1440px', async () => {
    const { d, saved } = deps({ fetch: async () => new Response(Buffer.from(PNG)) });
    await importContentImage({ url: 'https://cdn.exemplo/a.png', alt: 'A', target: 'social' }, ctx, d);
    expect(d.codec.toJpeg).toHaveBeenCalledWith(PNG, { maxWidth: 1440 });
    expect(saved[0]).toMatchObject({ mimeType: 'image/jpeg' });
  });

  it('erro de download vira erro de validação legível', async () => {
    const { d } = deps({ lookup: async () => ['10.0.0.1'] });
    await expect(importContentImage({ url: 'https://x.exemplo/a.png', alt: 'A' }, ctx, d)).rejects.toThrow(/interno/);
    expect(d.storage.put).not.toHaveBeenCalled();
  });
});
