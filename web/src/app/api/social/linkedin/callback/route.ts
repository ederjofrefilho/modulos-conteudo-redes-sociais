import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ForbiddenError } from '@app/core';
import {
  LINKEDIN_PAGES_STATE_PREFIX,
  connectLinkedinFromCode,
  connectLinkedinPagesFromCode,
  SocialPublishError,
} from '@app/social';
import { getCtx } from '@/lib/session';
import {
  FLASH_COOKIE,
  STATE_COOKIE,
  cookieOptions,
  sameState,
  settingsUrl,
  socialRedirectUri,
} from '@/lib/social-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Volta do LinkedIn. Exige sessão (quem conecta vira `connectedBy`) e o
 * mesmo `state` do cookie — sem isso, um link forjado poderia ligar a conta
 * de outra pessoa ao CRM. O resultado volta para /settings/social num recado
 * de cookie; o erro técnico fica só no log.
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
      'erro:A conexão com o LinkedIn expirou ou não começou aqui. Clique em "Conectar LinkedIn" de novo.',
    );
  }
  const denied = url.searchParams.get('error');
  if (denied) {
    return finish(
      denied === 'user_cancelled_authorize' || denied === 'user_cancelled_login'
        ? 'erro:Conexão cancelada no LinkedIn.'
        : denied === 'invalid_scope_error' || denied === 'unauthorized_scope_error'
          ? // O app ainda não tem as permissões pedidas (produto por aprovar no LinkedIn Developers).
            `erro:O app do LinkedIn ainda não tem as permissões pedidas aprovadas (${
              cookieState?.startsWith(LINKEDIN_PAGES_STATE_PREFIX) ? 'Community Management API, para a Página' : 'Share on LinkedIn e Sign In with LinkedIn'
            }). Confira em LinkedIn Developers → Products e → Auth (OAuth 2.0 scopes).`
          : 'erro:O LinkedIn não autorizou a conexão. Confira os produtos e o redirect URL do app.',
    );
  }
  const code = url.searchParams.get('code');
  if (!code) return finish('erro:O LinkedIn não devolveu o código de autorização.');

  try {
    // `state` já conferido contra o cookie: o prefixo diz que veio do app só de Páginas.
    if (cookieState!.startsWith(LINKEDIN_PAGES_STATE_PREFIX)) {
      const pages = await connectLinkedinPagesFromCode(
        { code, redirectUri: socialRedirectUri('linkedin', req) },
        ctx,
      );
      return finish(`ok:Página do LinkedIn conectada: ${pages.join(', ')}.`);
    }
    const account = await connectLinkedinFromCode(
      { code, redirectUri: socialRedirectUri('linkedin', req) },
      ctx,
    );
    const pages = account.pages.length ? ` Páginas: ${account.pages.join(', ')}.` : '';
    const pagesError = account.pagesError ? ` As Páginas não entraram: ${account.pagesError}` : '';
    return finish(`ok:LinkedIn conectado: ${account.displayName}.${pages}${pagesError}`);
  } catch (err) {
    console.error('[social] falha no callback do LinkedIn:', err);
    return finish(
      err instanceof SocialPublishError || err instanceof ForbiddenError
        ? `erro:${err.message}`
        : 'erro:Não foi possível conectar o LinkedIn. Tente de novo.',
    );
  }
}
