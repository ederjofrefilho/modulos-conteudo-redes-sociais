import { ValidationError, type Ctx } from '@app/core';
import { createContentAsset, getAssetsByIds, type ContentAssetCreate } from '../assets.js';
import { isVideoMime } from '../media-kinds.js';
import { downloadImage, ImageDownloadError, type FetchFn, type LookupFn } from './download.js';
import {
  BRAND_MEDIA_BY_ID,
  IMAGE_TEMPLATES,
  plainRich,
  importImageRequestSchema,
  parseTemplateFields,
  renderImageRequestSchema,
  saveRenderedImageRequestSchema,
  type ImageFields,
  type ImageTemplateId,
} from './templates.js';

/**
 * Serviço das imagens do conteúdo: renderizar um modelo e importar por URL,
 * terminando sempre num `ContentAsset` (com alt obrigatório). O que é
 * inevitavelmente de fora entra por adaptador, montado pelo `apps/web`:
 * - `renderer`: desenha o modelo (hoje `next/og`), devolve PNG;
 * - `codec`: mede e converte para JPEG (hoje `sharp`);
 * - `storage`: guarda o arquivo (hoje o store `content` do Vercel Blob).
 * A regra (validar campos, decidir formato, exigir alt, registrar o asset)
 * fica aqui, igual para tela, API e MCP.
 */

/**
 * Mídia já resolvida para a arte: item do catálogo que vem com o CRM
 * (`BRAND_MEDIA`) ou imagem da biblioteca de conteúdo (tratada como print).
 */
export type ResolvedMedia =
  | { source: 'brand'; id: string }
  | { source: 'asset'; id: string; url: string; width: number | null; height: number | null };

export interface ImageRenderer {
  render(template: ImageTemplateId, fields: ImageFields, media?: ResolvedMedia): Promise<Uint8Array>;
}

export interface ImageCodec {
  probe(bytes: Uint8Array): Promise<{ width: number; height: number }>;
  /** Converte para JPEG (sem transparência), reduzindo para `maxWidth` se for maior. */
  toJpeg(bytes: Uint8Array, opts?: { maxWidth?: number }): Promise<{ bytes: Uint8Array; width: number; height: number }>;
}

export interface ImageStorage {
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<{ url: string; pathname: string }>;
}

export interface ContentImageDeps {
  renderer: ImageRenderer;
  codec: ImageCodec;
  storage: ImageStorage;
  fetch?: FetchFn;
  lookup?: LookupFn;
  /** Só para teste — padrão é ler do banco. */
  findAssets?: (
    ids: string[],
  ) => Promise<Array<{ id: string; url: string; width: number | null; height: number | null; mimeType?: string }>>;
  /** Só para teste — padrão é gravar no banco. */
  saveAsset?: (input: ContentAssetCreate, ctx: Ctx) => Promise<unknown>;
}

/** Largura máxima aceita pelo Instagram na publicação; maior que isso, a imagem é reduzida. */
export const SOCIAL_MAX_WIDTH = 1440;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Trecho legível do nome do arquivo a partir de um texto (só a-z0-9 e hífen). */
export function slugForFile(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'imagem'
  );
}

function fieldsOrThrow(template: ImageTemplateId, fields: unknown): ImageFields {
  const parsed = parseTemplateFields(template, fields);
  if (!parsed.success) throw new ValidationError('Campos inválidos para o modelo', parsed.error.flatten());
  return parsed.data;
}

/** Campo `media`: id do catálogo ou de um asset da biblioteca (que precisa existir). */
async function resolveMedia(
  fields: ImageFields,
  deps: Pick<ContentImageDeps, 'findAssets'>,
): Promise<ResolvedMedia | undefined> {
  const id = fields.media;
  if (typeof id !== 'string' || !id) return undefined;
  if (BRAND_MEDIA_BY_ID[id]) return { source: 'brand', id };
  const [asset] = await (deps.findAssets ?? getAssetsByIds)([id]);
  if (!asset) {
    throw new ValidationError('Campos inválidos para o modelo', {
      formErrors: [],
      fieldErrors: { media: ['Imagem não encontrada na biblioteca de conteúdo'] },
    });
  }
  // Vídeo da biblioteca não entra na arte (o Satori só desenha imagem).
  if (asset.mimeType && isVideoMime(asset.mimeType)) {
    throw new ValidationError('Campos inválidos para o modelo', {
      formErrors: [],
      fieldErrors: { media: ['Isto é um vídeo: escolha uma imagem, um mockup ou um print'] },
    });
  }
  return { source: 'asset', id: asset.id, url: asset.url, width: asset.width, height: asset.height };
}

/** Renderiza um modelo em JPEG, sem salvar — prévia da tela. */
export async function previewContentImage(
  input: unknown,
  deps: Pick<ContentImageDeps, 'renderer' | 'codec' | 'findAssets'>,
) {
  const req = renderImageRequestSchema.safeParse(input);
  if (!req.success) throw new ValidationError('Dados inválidos', req.error.flatten());
  const fields = fieldsOrThrow(req.data.template, req.data.fields);
  const png = await deps.renderer.render(req.data.template, fields, await resolveMedia(fields, deps));
  return deps.codec.toJpeg(png);
}

/** Renderiza um modelo, sobe o JPEG e cria o `ContentAsset`. */
export async function renderContentImage(input: unknown, ctx: Ctx, deps: ContentImageDeps) {
  const req = saveRenderedImageRequestSchema.safeParse(input);
  if (!req.success) throw new ValidationError('Dados inválidos', req.error.flatten());
  const { template, alt } = req.data;
  const fields = fieldsOrThrow(template, req.data.fields);

  const png = await deps.renderer.render(template, fields, await resolveMedia(fields, deps));
  // Todo modelo sai em JPEG: a capa do blog também vira imagem de
  // compartilhamento, e rede social só aceita JPEG.
  const jpeg = await deps.codec.toJpeg(png);
  const spec = IMAGE_TEMPLATES[template];
  const label = plainRich(String(fields.title ?? fields.quote ?? fields.value ?? spec.label));
  const stored = await deps.storage.put(
    `content/generated/${template}-${slugForFile(label)}.jpg`,
    jpeg.bytes,
    'image/jpeg',
  );

  return (deps.saveAsset ?? createContentAsset)(
    {
      url: stored.url,
      pathname: stored.pathname,
      width: jpeg.width,
      height: jpeg.height,
      alt,
      bytes: jpeg.bytes.byteLength,
      mimeType: 'image/jpeg',
    },
    ctx,
  );
}

/**
 * Baixa uma imagem pública, valida tipo e tamanho e cria o `ContentAsset`.
 * `target: 'social'` converte para JPEG (e reduz para 1440px de largura, o
 * teto do Instagram); `blog` mantém o formato original.
 */
export async function importContentImage(input: unknown, ctx: Ctx, deps: Omit<ContentImageDeps, 'renderer'>) {
  const req = importImageRequestSchema.safeParse(input);
  if (!req.success) throw new ValidationError('Dados inválidos', req.error.flatten());
  const { url, alt, target } = req.data;

  let downloaded;
  try {
    downloaded = await downloadImage(url, { fetch: deps.fetch, lookup: deps.lookup });
  } catch (err) {
    if (err instanceof ImageDownloadError) throw new ValidationError(err.message);
    throw err;
  }

  let bytes = downloaded.bytes;
  let mimeType: string = downloaded.mimeType;
  let width: number;
  let height: number;
  if (target === 'social') {
    const jpeg = await deps.codec.toJpeg(bytes, { maxWidth: SOCIAL_MAX_WIDTH });
    bytes = jpeg.bytes;
    mimeType = 'image/jpeg';
    ({ width, height } = jpeg);
  } else {
    try {
      ({ width, height } = await deps.codec.probe(bytes));
    } catch {
      throw new ValidationError('Não foi possível ler a imagem baixada — o arquivo pode estar corrompido.');
    }
  }

  const name = new URL(downloaded.finalUrl).pathname.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') ?? '';
  const stored = await deps.storage.put(
    `content/imported/${slugForFile(name || alt)}.${EXT[mimeType]}`,
    bytes,
    mimeType,
  );

  return (deps.saveAsset ?? createContentAsset)(
    { url: stored.url, pathname: stored.pathname, width, height, alt, bytes: bytes.byteLength, mimeType },
    ctx,
  );
}
