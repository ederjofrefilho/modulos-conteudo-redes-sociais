import { prisma, SocialProvider } from '@app/db';
import { secrets } from '@app/core';
import { tokenAad } from './accounts.js';
import { linkedinCredentials, linkedinPagesCredentials, refreshLinkedinToken, type LinkedinCredentials } from './providers/linkedin.js';

const DAY = 86_400_000;

/**
 * Renova o acesso das contas do LinkedIn que receberam refresh token (apps com
 * "programmatic refresh tokens"; o app só com "Share on LinkedIn" não recebe,
 * e essas contas continuam a pedir para ligar de novo, com aviso no sino).
 * Chamado pelo cron `publish-social` antes de desativar as vencidas. Como a
 * conta não guarda de que app veio o token, tenta o app das Páginas e o de
 * sempre — o errado só recusa.
 */
export async function refreshExpiringLinkedinTokens(opts: { now?: Date; withinDays?: number; fetchImpl?: typeof fetch } = {}) {
  const now = opts.now ?? new Date();
  const accounts = await prisma.socialAccount.findMany({
    where: {
      provider: SocialProvider.LINKEDIN,
      isActive: true,
      refreshTokenEnc: { not: null },
      tokenExpiresAt: { gt: now, lte: new Date(now.getTime() + (opts.withinDays ?? 10) * DAY) },
    },
    select: { id: true, externalId: true, refreshTokenEnc: true },
  });
  const apps: LinkedinCredentials[] = [];
  const pages = linkedinPagesCredentials();
  if (pages?.separate) apps.push(pages);
  const main = linkedinCredentials();
  if (main) apps.push(main);

  let refreshed = 0;
  const errors: { accountId: string; error: string }[] = [];
  for (const account of accounts) {
    const aad = tokenAad(SocialProvider.LINKEDIN, account.externalId);
    const refreshToken = secrets.decryptSecret(account.refreshTokenEnc!, aad);
    let lastError = 'LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET não configurados.';
    let done = false;
    for (const app of apps) {
      try {
        const token = await refreshLinkedinToken({ ...app, refreshToken, now }, opts.fetchImpl);
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: {
            tokenEnc: secrets.encryptSecret(token.accessToken, aad),
            refreshTokenEnc: token.refreshToken ? secrets.encryptSecret(token.refreshToken, aad) : account.refreshTokenEnc,
            tokenExpiresAt: token.expiresAt,
            expiryNotifiedAt: null,
            lastError: null,
          },
        });
        refreshed++;
        done = true;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    if (!done) {
      errors.push({ accountId: account.id, error: lastError });
      await prisma.socialAccount.update({ where: { id: account.id }, data: { lastError } });
    }
  }
  return { checked: accounts.length, refreshed, errors };
}
