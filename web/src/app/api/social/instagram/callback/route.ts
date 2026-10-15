import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ForbiddenError } from '@app/core';
import { connectInstagramFromCode, SocialPublishError } from '@app/social';
import { getCtx } from '@/lib/session';
import {
  FLASH_COOKIE,
  STATE_COOKIE,
  cookieOptions,
  isSharedState,
  sameState,
  settingsUrl,
  socialRedirectUri,
} from '@/lib/social-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Volta do Instagram. Mesmas guardas do callback do LinkedIn: sessão (quem
 * conecta vira `connectedBy`) e o `state` do cookie. O resultado volta para
 * /settings/social num recado de cookie; o erro técnico fica só no log.
 */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.redirect(new URL('/login?callbackUrl=/settings/social', req.url));

  const url = new URL(req.url);
  const cookieState = (await cookies()).get(STATE_COOKIE)?.value ?? null;

  const finish = (flash: string) => {
    const res = NextResponse.redirect(settingsUrl(req));
    res.cookies.set(FLASH_COOKIE, flash, cookieOptions(60));
    res.cookies.set(STATE_COOKIE, '', cookieOptions(0));
    return res;
  };

  if (!sameState(url.searchParams.get('state'), cookieState)) {
    return finish(
      'erro:A conexão com o Instagram expirou ou não começou aqui. Clique em "Conectar Instagram" de novo.',
    );
  }
  if (url.searchParams.get('error')) {
    return finish(
      url.searchParams.get('error_reason') === 'user_denied'
        ? 'erro:Conexão cancelada no Instagram.'
        : 'erro:O Instagram não autorizou a conexão. Confira o redirect URL e as permissões do app.',
    );
  }
  const code = url.searchParams.get('code');
  if (!code) return finish('erro:O Instagram não devolveu o código de autorização.');

  try {
    const account = await connectInstagramFromCode(
      { code, redirectUri: socialRedirectUri('instagram', req), shared: isSharedState(cookieState!) },
      ctx,
    );
    return finish(`ok:Instagram conectado: ${account.displayName}${account.shared ? ' (conta da empresa)' : ''}.`);
  } catch (err) {
    console.error('[social] falha no callback do Instagram:', err);
    return finish(
      err instanceof SocialPublishError || err instanceof ForbiddenError
        ? `erro:${err.message}`
        : 'erro:Não foi possível conectar o Instagram. Tente de novo.',
    );
  }
}
