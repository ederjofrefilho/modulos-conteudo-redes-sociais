import { z } from 'zod';
import { ValidationError, type Ctx } from '@app/core';
import { createContentAsset } from '../assets.js';
import { assertFetchableUrl, type FetchFn, type LookupFn } from '../images/download.js';
import { MAX_VIDEO_BYTES } from '../media-kinds.js';
import { VideoProbeError, probeMp4 } from './probe.js';

// Vídeo para as redes pelo MCP (15/10/2026). O vídeo continua a ser feito
// fora do CRM: aqui só entra, como no seletor do navegador. Dois caminhos,
// mesmo fim (ContentAsset video/mp4 com largura, altura e duração medidas):
// - por URL pública (`importContentVideo`): o CRM baixa com a proteção da
//   importação de imagens (só http(s), nunca endereço interno, teto 200 MB);
// - arquivo do computador (MCP local): o próprio MCP sobe direto ao Blob e
//   chama `registerUploadedVideo` com o que mediu (a rota confere de novo).

const TIMEOUT_MS = 50_000;
const MAX_REDIRECTS = 3;

export interface VideoStorage {
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<{ url: string; pathname: string }>;
}

export const importVideoSchema = z.object({
  url: z.string().trim().url('URL inválida'),
  alt: z.string().trim().min(1, 'Descreva o vídeo (texto alternativo).').max(500),
});

export class VideoDownloadError extends Error {}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > max) throw new VideoDownloadError(`O vídeo passa de ${max / (1024 * 1024)} MB.`);
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new VideoDownloadError(`O vídeo passa de ${max / (1024 * 1024)} MB.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export async function downloadVideo(rawUrl: string, deps: { fetch?: FetchFn; lookup?: LookupFn } = {}): Promise<Uint8Array> {
  const doFetch = deps.fetch ?? ((u, init) => fetch(u, init));
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertFetchableUrl(current, deps.lookup);
    let res: Response;
    try {
      res = await doFetch(url.toString(), { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'video/mp4,*/*' } });
    } catch (err) {
      throw new VideoDownloadError(`Falha ao baixar o vídeo: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new VideoDownloadError('Redirecionamento sem destino.');
      current = new URL(location, url).toString();
      continue;
    }
    if (!res.ok) throw new VideoDownloadError(`O endereço respondeu ${res.status} ao baixar o vídeo.`);
    return readCapped(res, MAX_VIDEO_BYTES);
  }
  throw new VideoDownloadError('Redirecionamentos demais ao baixar o vídeo.');
}

function slug(alt: string): string {
  return (
    alt
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'video'
  );
}

/** Mede o MP4 e devolve os dados do asset, com erro legível se não servir. */
export function measureVideo(bytes: Uint8Array) {
  try {
    const p = probeMp4(bytes);
    if (p.brand.startsWith('qt')) throw new VideoProbeError('O arquivo é MOV (QuickTime): exporte em MP4 (H.264) para servir às duas redes.');
    return p;
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : 'Vídeo ilegível.', { url: err instanceof Error ? err.message : 'Vídeo ilegível.' });
  }
}

export async function importContentVideo(input: unknown, ctx: Ctx, deps: { storage: VideoStorage; fetch?: FetchFn; lookup?: LookupFn }) {
  const parsed = importVideoSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());
  let bytes: Uint8Array;
  try {
    bytes = await downloadVideo(parsed.data.url, deps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ValidationError(message, { url: message });
  }
  const probe = measureVideo(bytes);
  const stored = await deps.storage.put(`content/videos/${slug(parsed.data.alt)}.mp4`, bytes, 'video/mp4');
  return createContentAsset(
    {
      url: stored.url,
      pathname: stored.pathname,
      width: probe.width,
      height: probe.height,
      alt: parsed.data.alt,
      bytes: bytes.byteLength,
      mimeType: 'video/mp4',
      durationMs: probe.durationMs,
    },
    ctx,
  );
}

export const registerVideoSchema = z.object({
  url: z.string().trim().url(),
  pathname: z.string().trim().min(1),
  alt: z.string().trim().min(1, 'Descreva o vídeo (texto alternativo).').max(500),
  bytes: z.number().int().positive().max(MAX_VIDEO_BYTES, `O vídeo passa de ${MAX_VIDEO_BYTES / (1024 * 1024)} MB.`),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationMs: z.number().int().positive(),
});

/**
 * Regista um vídeo que o MCP local já subiu ao Blob (pelo mesmo token de
 * upload do navegador). Só aceita URL do próprio store do CRM — nunca um link
 * qualquer apresentado como "já enviado".
 */
export async function registerUploadedVideo(input: unknown, ctx: Ctx, opts: { blobHost: (url: string) => boolean }) {
  const parsed = registerVideoSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());
  if (!opts.blobHost(parsed.data.url)) throw new ValidationError('Este endereço não é do armazenamento do CRM.', { url: 'URL fora do Blob do CRM.' });
  return createContentAsset({ ...parsed.data, mimeType: 'video/mp4' }, ctx);
}
