import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token curto (HMAC, 15 min) que autoriza o site institucional a buscar UM
 * post específico em QUALQUER status — a prévia por iframe do editor
 * (`PostPreviewFrame`) embute a URL assinada no `src` do iframe, que vive no
 * navegador. Por isso é curto e escopado a um post só: diferente do
 * `CONTENT_API_TOKEN` (longo prazo, só PUBLISHED), esse token não pode valer
 * pra outros posts nem ficar válido por muito tempo se vazar (inspecionar
 * elemento, histórico do navegador).
 */
const TOKEN_TTL_MS = 15 * 60 * 1000;

function secret(): string {
  const s = process.env.SITE_PREVIEW_SECRET;
  if (!s) throw new Error('SITE_PREVIEW_SECRET não configurado — prévia por iframe indisponível.');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function signPreviewToken(postId: string): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${postId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * URL completa da prévia no site — deriva a ORIGEM do site de
 * `SITE_REVALIDATE_URL` (já configurado desde a Fase D, aponta pro webhook
 * `/api/revalidate`) em vez de introduzir uma terceira env pra apontar pro
 * mesmo host. `null` sem a env (mesma degradação graciosa de
 * `notifySiteRevalidate`) ou sem `SITE_PREVIEW_SECRET` configurado.
 */
export function buildPreviewUrl(postId: string): string | null {
  const revalidateUrl = process.env.SITE_REVALIDATE_URL;
  if (!revalidateUrl || !process.env.SITE_PREVIEW_SECRET) return null;
  try {
    const origin = new URL(revalidateUrl).origin;
    const token = signPreviewToken(postId);
    return `${origin}/preview/${postId}?t=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

/** Verifica que o token é uma assinatura válida, não expirada, e para ESTE post especificamente. */
export function verifyPreviewToken(token: string, postId: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [id, expiresAtStr, signature] = parts;
  if (!id || !expiresAtStr || !signature) return false;
  if (id !== postId) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = sign(`${id}.${expiresAtStr}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Tamanhos diferentes (assinatura adulterada de comprimento errado)
  // precisam do bail-out ANTES de `timingSafeEqual`, que lança se os buffers
  // não tiverem o mesmo tamanho — não daria pra confiar cegamente que um
  // token vindo de fora sempre bate o tamanho esperado.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
