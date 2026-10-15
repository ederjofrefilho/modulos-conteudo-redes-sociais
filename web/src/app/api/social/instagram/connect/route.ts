import { NextResponse } from 'next/server';
import { INSTAGRAM_INSIGHTS_SCOPE, instagramAuthorizeUrl, instagramCredentials } from '@app/social';
import { isAdmin } from '@app/core';
import { getCtx } from '@/lib/session';
import {
  FLASH_COOKIE,
  STATE_COOKIE,
  cookieOptions,
  newOAuthState,
  sharedState,
  settingsUrl,
  socialRedirectUri,
} from '@/lib/social-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Início do "Conectar Instagram" (botão em /settings/social): mesmo molde do
 * LinkedIn — exige sessão, grava o `state` num cookie curto e manda para a
 * tela de autorização do Instagram.
 */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.redirect(new URL('/login?callbackUrl=/settings/social', req.url));

  const creds = instagramCredentials();
  if (!creds) {
    const res = NextResponse.redirect(settingsUrl(req));
    res.cookies.set(
      FLASH_COOKIE,
      'erro:A integração com o Instagram ainda não está configurada neste ambiente.',
      cookieOptions(60),
    );
    return res;
  }
  // `?partilhada=1`: conta da empresa (só ADMIN). Sem isso, a conta é pessoal de quem liga.
  const shared = new URL(req.url).searchParams.get('partilhada') === '1';
  if (shared && !isAdmin(ctx)) {
    const res = NextResponse.redirect(settingsUrl(req));
    res.cookies.set(FLASH_COOKIE, 'erro:Só um administrador liga as contas da empresa.', cookieOptions(60));
    return res;
  }
  const state = shared ? sharedState() : newOAuthState();
  const res = NextResponse.redirect(
    instagramAuthorizeUrl({
      appId: creds.appId,
      redirectUri: socialRedirectUri('instagram', req),
      state,
      // Insights (alcance, visualizações, partilhas, guardados) entram sempre desde
      // 14/10/2026: sem eles o agente só vê gostos e comentários. `?metricas=0` volta
      // ao pedido só de publicação, para o caso de o app da Meta ainda não ter a permissão.
      extraScopes: new URL(req.url).searchParams.get('metricas') === '0' ? [] : [INSTAGRAM_INSIGHTS_SCOPE],
    }),
  );
  res.cookies.set(STATE_COOKIE, state, cookieOptions());
  return res;
}
