import { SocialAccountKind, SocialProvider } from '@app/db';
import type { Ctx } from '@app/core';
import { connectSocialAccount } from './accounts.js';
import { linkedinApiVersion } from './providers/linkedin-text.js';
import { exchangeLinkedinCode, linkedinPagesCredentials, type LinkedinToken } from './providers/linkedin.js';
import { SocialPublishError } from './providers/types.js';

// Páginas de empresa do LinkedIn (Community Management API). Com as
// permissões de organização no token, cada Página que a pessoa administra
// vira uma SocialAccount ORGANIZATION com o mesmo token — é a que dá métricas
// por post (organizationalEntityShareStatistics) e lista os posts publicados
// fora do CRM. Sem o produto aprovado no app, o LinkedIn nem devolve estas
// permissões e nada aqui corre.

export const LINKEDIN_PAGE_SCOPES = ['r_organization_social', 'w_organization_social', 'rw_organization_admin'] as const;

const REST = 'https://api.linkedin.com/rest';
type FetchLike = typeof fetch;

/**
 * Prefixo do `state` do OAuth quando a conexão vai pelo app só de Páginas.
 * O `state` inteiro é conferido contra o cookie, então o prefixo não pode ser
 * forjado — é por ele que o callback sabe com qual app trocar o código.
 */
export const LINKEDIN_PAGES_STATE_PREFIX = 'pages.';

export function hasPageScopes(scopes: string[]): boolean {
  return scopes.includes('rw_organization_admin') || scopes.includes('r_organization_social');
}

/** Permissões de Página que faltam no token (listar as Páginas e publicar nelas). */
export function missingPageScopes(scopes: string[]): string[] {
  return ['rw_organization_admin', 'w_organization_social'].filter((s) => !scopes.includes(s));
}

function headers(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'LinkedIn-Version': linkedinApiVersion(),
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

/** Ids das organizações que o dono do token administra (papel ADMINISTRATOR aprovado). */
export async function listAdministeredOrganizations(accessToken: string, fetchImpl: FetchLike = fetch): Promise<{ id: string; name: string }[]> {
  const res = await fetchImpl(`${REST}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50`, { headers: headers(accessToken) });
  const body = (await res.json().catch(() => ({}))) as { elements?: { organization?: string }[]; message?: string };
  if (!res.ok) throw new Error(`O LinkedIn recusou a lista de Páginas (HTTP ${res.status}${body.message ? `: ${body.message}` : ''}).`);
  const ids = [...new Set((body.elements ?? []).map((e) => e.organization?.split(':').pop()).filter((id): id is string => !!id))];
  const out: { id: string; name: string }[] = [];
  for (const id of ids) {
    const org = await fetchImpl(`${REST}/organizations/${id}`, { headers: headers(accessToken) });
    const data = (await org.json().catch(() => ({}))) as { localizedName?: string };
    out.push({ id, name: org.ok && data.localizedName ? data.localizedName : `Página ${id}` });
  }
  return out;
}

/** Grava (ou atualiza o token de) cada Página administrada. Devolve os nomes. */
export async function connectLinkedinPages(token: LinkedinToken, ctx: Ctx, fetchImpl: FetchLike = fetch): Promise<string[]> {
  if (!hasPageScopes(token.scopes)) return [];
  const orgs = await listAdministeredOrganizations(token.accessToken, fetchImpl);
  for (const org of orgs) {
    await connectSocialAccount(
      {
        provider: SocialProvider.LINKEDIN,
        kind: SocialAccountKind.ORGANIZATION,
        // Página da empresa: sempre conta da empresa (só ADMIN liga; acesso por permissão).
        shared: true,
        externalId: org.id,
        displayName: org.name,
        avatarUrl: null,
        accessToken: token.accessToken,
        tokenExpiresAt: token.expiresAt,
        refreshToken: token.refreshToken ?? null,
        scopes: token.scopes,
      },
      ctx,
    );
  }
  return orgs.map((o) => o.name);
}

/**
 * Fim do OAuth pelo app só de Páginas (`LINKEDIN_PAGES_CLIENT_ID`): esse app
 * não tem OpenID nem "Share on LinkedIn", então não há perfil pessoal para
 * gravar — só as Páginas que a pessoa administra. O perfil continua ligado
 * pelo app de sempre, com o token dele.
 */
export async function connectLinkedinPagesFromCode(
  opts: { code: string; redirectUri: string; fetchImpl?: FetchLike },
  ctx: Ctx,
): Promise<string[]> {
  const creds = linkedinPagesCredentials();
  if (!creds)
    throw new SocialPublishError(
      'A integração com as Páginas do LinkedIn não está configurada (LINKEDIN_PAGES_CLIENT_ID/LINKEDIN_PAGES_CLIENT_SECRET).',
    );
  const token = await exchangeLinkedinCode(
    { clientId: creds.clientId, clientSecret: creds.clientSecret, code: opts.code, redirectUri: opts.redirectUri },
    opts.fetchImpl,
  );
  const missing = missingPageScopes(token.scopes);
  if (missing.length)
    throw new SocialPublishError(
      `O LinkedIn conectou sem as permissões de Página (${missing.join(', ')}). Confira se a Community Management API está aprovada no app das Páginas.`,
    );
  const pages = await connectLinkedinPages(token, ctx, opts.fetchImpl);
  if (!pages.length)
    throw new SocialPublishError(
      'O LinkedIn não devolveu nenhuma Página que você administre. É preciso ser administrador da Página da empresa.',
    );
  return pages;
}
