import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Download de imagem por URL pública (`import_content_image`). Regras:
 * só http/https, nunca endereço interno (o servidor do CRM não pode virar
 * ponte para a rede da Vercel ou para `localhost`), redirecionamento
 * conferido a cada salto, tamanho limitado enquanto lê, e o tipo decidido
 * pelos bytes, não pelo `Content-Type` que o servidor alega.
 */

export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

export type SniffedImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** Tipo da imagem pelos primeiros bytes (assinatura do formato). */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Endereço que nunca deve ser buscado pelo servidor (loopback, rede privada, link-local, metadados de nuvem...). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower);
  }
  return true;
}

export type LookupFn = (hostname: string) => Promise<string[]>;
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const defaultLookup: LookupFn = async (hostname) =>
  (await dnsLookup(hostname, { all: true })).map((r) => r.address);

export class ImageDownloadError extends Error {}

/** Confere esquema e destino de uma URL antes de buscá-la. */
export async function assertFetchableUrl(raw: string, lookup: LookupFn = defaultLookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageDownloadError('URL inválida.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ImageDownloadError('Só dá para importar imagem de endereço http(s).');
  }
  if (url.username || url.password) {
    throw new ImageDownloadError('URL com usuário/senha não é aceita.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : await lookup(host).catch(() => []);
  if (addresses.length === 0) throw new ImageDownloadError(`Não foi possível resolver o endereço ${host}.`);
  if (addresses.some(isPrivateAddress)) {
    throw new ImageDownloadError('Essa URL aponta para um endereço interno — só imagens públicas podem ser importadas.');
  }
  return url;
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new ImageDownloadError(tooBig(maxBytes));
  if (!res.body) return new Uint8Array(await res.arrayBuffer());

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ImageDownloadError(tooBig(maxBytes));
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function tooBig(maxBytes: number) {
  return `A imagem passa de ${Math.round(maxBytes / 1024 / 1024)} MB — use um arquivo menor.`;
}

export interface DownloadedImage {
  bytes: Uint8Array;
  mimeType: SniffedImageType;
  finalUrl: string;
}

export async function downloadImage(
  rawUrl: string,
  deps: { fetch?: FetchFn; lookup?: LookupFn; maxBytes?: number } = {},
): Promise<DownloadedImage> {
  const doFetch = deps.fetch ?? ((u, init) => fetch(u, init));
  const maxBytes = deps.maxBytes ?? IMPORT_MAX_BYTES;
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertFetchableUrl(current, deps.lookup);
    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'image/*' },
      });
    } catch (err) {
      throw new ImageDownloadError(
        `Falha ao baixar a imagem: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new ImageDownloadError('Redirecionamento sem destino.');
      current = new URL(location, url).toString();
      continue;
    }
    if (!res.ok) throw new ImageDownloadError(`O endereço respondeu ${res.status} ao baixar a imagem.`);

    const bytes = await readCapped(res, maxBytes);
    const mimeType = sniffImageType(bytes);
    if (!mimeType) throw new ImageDownloadError('O arquivo baixado não é uma imagem JPEG, PNG, WebP ou GIF.');
    return { bytes, mimeType, finalUrl: url.toString() };
  }
  throw new ImageDownloadError('Redirecionamentos demais ao baixar a imagem.');
}
