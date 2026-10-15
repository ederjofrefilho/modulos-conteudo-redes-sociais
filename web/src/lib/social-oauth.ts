import { randomBytes, timingSafeEqual } from 'node:crypto';
import { issuerUrl } from '@/lib/oauth';

// Peças comuns do OAuth das redes sociais (LinkedIn e Instagram): `state`
// anti-CSRF num cookie curto e o recado do resultado para /settings/social. O recado vai num cookie, não na URL, para um link forjado
// não conseguir pôr texto arbitrário na tela do CRM.

export const STATE_COOKIE = 'app_social_oauth_state';
export const FLASH_COOKIE = 'app_social_flash';
const TEN_MINUTES = 600;

export function newOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

// Marca "conta da empresa" no `state` (o `state` inteiro é conferido contra o cookie,
// então a marca não pode ser forjada por um link de fora).
const SHARED_MARK = 'org.';

export function sharedState(prefix = ''): string {
  return `${prefix}${SHARED_MARK}${newOAuthState()}`;
}

/** O `state` (já conferido) pediu conta partilhada da empresa? */
export function isSharedState(state: string, prefix = ''): boolean {
  return state.startsWith(`${prefix}${SHARED_MARK}`);
}

export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function cookieOptions(maxAge = TEN_MINUTES) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/** Redirect URI registrado no app da rede — tem que bater letra por letra. */
export function socialRedirectUri(provider: 'linkedin' | 'instagram', req: Request): string {
  const base = issuerUrl() || new URL(req.url).origin;
  return `${base}/api/social/${provider}/callback`;
}

export function settingsUrl(req: Request): URL {
  return new URL('/settings/social', issuerUrl() || new URL(req.url).origin);
}
