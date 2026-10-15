import { SocialAccountKind, SocialProvider } from '@app/db';
import type { Ctx } from '@app/core';
import { connectSocialAccount } from './accounts.js';
import { connectLinkedinPages } from './linkedin-pages.js';
import {
  exchangeLinkedinCode,
  fetchLinkedinProfile,
  linkedinCredentials,
} from './providers/linkedin.js';
import { SocialPublishError } from './providers/types.js';

/**
 * Fim do OAuth do LinkedIn: troca o `code` pelo token, lê o perfil (o `sub`
 * vira o autor `urn:li:person:{sub}`) e grava a conta com o token cifrado.
 * Reconectar o mesmo perfil só troca o token e reativa. A rota de callback
 * (apps/web) cuida só de sessão e `state`; a regra mora aqui.
 */
export async function connectLinkedinFromCode(
  opts: { code: string; redirectUri: string; fetchImpl?: typeof fetch },
  ctx: Ctx,
) {
  const creds = linkedinCredentials();
  if (!creds)
    throw new SocialPublishError(
      'A integração com o LinkedIn não está configurada (LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET).',
    );
  const token = await exchangeLinkedinCode(
    { ...creds, code: opts.code, redirectUri: opts.redirectUri },
    opts.fetchImpl,
  );
  if (!token.scopes.includes('w_member_social')) {
    throw new SocialPublishError(
      'O LinkedIn conectou sem a permissão de publicar (w_member_social). Confira se o produto "Share on LinkedIn" está ativo no app.',
    );
  }
  const profile = await fetchLinkedinProfile(token.accessToken, opts.fetchImpl);
  const person = await connectSocialAccount(
    {
      provider: SocialProvider.LINKEDIN,
      kind: SocialAccountKind.PERSON,
      externalId: profile.sub,
      displayName: profile.name,
      avatarUrl: profile.picture,
      accessToken: token.accessToken,
      tokenExpiresAt: token.expiresAt,
      refreshToken: token.refreshToken ?? null,
      scopes: token.scopes,
    },
    ctx,
  );
  // Com as permissões de organização (Community Management API), as Páginas
  // administradas entram também. Falhar aqui não desfaz a conexão do perfil.
  let pages: string[] = [];
  let pagesError: string | null = null;
  try {
    pages = await connectLinkedinPages(token, ctx, opts.fetchImpl);
  } catch (err) {
    pagesError = err instanceof Error ? err.message : String(err);
  }
  return { ...person, pages, pagesError };
}
