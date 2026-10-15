import { NextResponse } from 'next/server';
import {
  LINKEDIN_MEMBER_POST_SCOPE,
  LINKEDIN_MEMBER_PROFILE_SCOPE,
  LINKEDIN_PAGE_SCOPES,
  LINKEDIN_PAGES_STATE_PREFIX,
  linkedinAuthorizeUrl,
  linkedinCredentials,
  linkedinPagesCredentials,
} from '@app/social';
import { isAdmin } from '@app/core';
import { getCtx } from '@/lib/session';
import {
  FLASH_COOKIE,
  STATE_COOKIE,
  cookieOptions,
  newOAuthState,
  settingsUrl,
  socialRedirectUri,
} from '@/lib/social-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Início do "Conectar LinkedIn" (botão em /settings/social): exige sessão,
 * grava o `state` num cookie curto e manda para a tela de autorização do
 * LinkedIn. O callback confere o mesmo `state` antes de aceitar o código.
 */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.redirect(new URL('/login?callbackUrl=/settings/social', req.url));

  const params = new URL(req.url).searchParams;
  const wantsPages = params.get('pagina') === '1';
  if (wantsPages && !isAdmin(ctx)) {
    const res = NextResponse.redirect(settingsUrl(req));
    res.cookies.set(FLASH_COOKIE, 'erro:Só um administrador liga a Página da empresa.', cookieOptions(60));
    return res;
  }
  // Página com app próprio (LINKEDIN_PAGES_CLIENT_ID): só as permissões de Página,
  // porque esse app não tem OpenID nem "Share on LinkedIn".
  const pagesApp = wantsPages ? linkedinPagesCredentials() : null;
  const creds = pagesApp?.separate ? pagesApp : linkedinCredentials();
  if (!creds) {
    const res = NextResponse.redirect(settingsUrl(req));
    res.cookies.set(
      FLASH_COOKIE,
      'erro:A integração com o LinkedIn ainda não está configurada neste ambiente.',
      cookieOptions(60),
    );
    return res;
  }
  const state = (pagesApp?.separate ? LINKEDIN_PAGES_STATE_PREFIX : '') + newOAuthState();
  const res = NextResponse.redirect(
    pagesApp?.separate
      ? linkedinAuthorizeUrl({
          clientId: creds.clientId,
          redirectUri: socialRedirectUri('linkedin', req),
          state,
          baseScopes: [],
          extraScopes: LINKEDIN_PAGE_SCOPES,
        })
      : linkedinAuthorizeUrl({
          clientId: creds.clientId,
          redirectUri: socialRedirectUri('linkedin', req),
          state,
          // `?metricas=1`: pede também as permissões de métricas do perfil; `?pagina=1`, as de
          // Página de empresa (Community Management API). Só funcionam depois de o app da rede
          // ter o produto aprovado (docs/redes-sociais-setup.md); o botão normal não muda.
          extraScopes: [
            ...(params.get('metricas') === '1' ? [LINKEDIN_MEMBER_POST_SCOPE, LINKEDIN_MEMBER_PROFILE_SCOPE] : []),
            ...(wantsPages ? LINKEDIN_PAGE_SCOPES : []),
          ],
        }),
  );
  res.cookies.set(STATE_COOKIE, state, cookieOptions());
  return res;
}
