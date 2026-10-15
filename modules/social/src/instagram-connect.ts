import { prisma, SocialAccountKind, SocialProvider } from '@app/db';
import { secrets, type Ctx } from '@app/core';
import { connectSocialAccount, decryptAccessToken, tokenAad } from './accounts.js';
import {
  exchangeInstagramCode,
  fetchInstagramProfile,
  instagramCredentials,
  refreshInstagramToken,
} from './providers/instagram.js';
import { SocialPublishError } from './providers/types.js';

/**
 * Fim do OAuth do Instagram: código → token curto → token longo (~60 dias),
 * lê a conta (o `user_id` é o `{ig-id}` da publicação) e grava com o token
 * cifrado. Recusa conta pessoal (a API só publica em conta Profissional) e
 * conexão sem a permissão de publicar.
 */
export async function connectInstagramFromCode(
  opts: { code: string; redirectUri: string; fetchImpl?: typeof fetch; shared?: boolean },
  ctx: Ctx,
) {
  const creds = instagramCredentials();
  if (!creds)
    throw new SocialPublishError(
      'A integração com o Instagram não está configurada (INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET).',
    );
  const token = await exchangeInstagramCode(
    { ...creds, code: opts.code, redirectUri: opts.redirectUri },
    opts.fetchImpl,
  );
  if (
    token.permissions.length &&
    !token.permissions.includes('instagram_business_content_publish')
  ) {
    throw new SocialPublishError(
      'O Instagram conectou sem a permissão de publicar (instagram_business_content_publish). Conecte de novo e aceite todas as permissões.',
    );
  }
  const profile = await fetchInstagramProfile(token.accessToken, opts.fetchImpl);
  if (
    profile.accountType &&
    !['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(profile.accountType)
  ) {
    throw new SocialPublishError(
      'Essa conta do Instagram é pessoal. Mude para conta Profissional (Empresa ou Criador) no app do Instagram e conecte de novo.',
    );
  }
  return connectSocialAccount(
    {
      provider: SocialProvider.INSTAGRAM,
      kind:
        profile.accountType === 'BUSINESS'
          ? SocialAccountKind.ORGANIZATION
          : SocialAccountKind.PERSON,
      externalId: profile.userId,
      shared: opts.shared ?? false,
      displayName: `@${profile.username}`,
      avatarUrl: profile.picture,
      accessToken: token.accessToken,
      tokenExpiresAt: token.expiresAt,
      scopes: token.permissions.length
        ? token.permissions
        : ['instagram_business_basic', 'instagram_business_content_publish'],
    },
    ctx,
  );
}

const DAY = 86_400_000;

/**
 * Renova (cron de publicação) os tokens do Instagram que vencem em menos de
 * 10 dias. A API só renova token com mais de 24 h, então conta reconectada
 * há menos de um dia fica para a próxima rodada. Falha de renovação não
 * derruba o cron: vira `lastError` na conta (e desativa se o token morreu).
 */
export async function refreshExpiringInstagramTokens(
  opts: { now?: Date; fetchImpl?: typeof fetch; withinDays?: number } = {},
) {
  const now = opts.now ?? new Date();
  const accounts = await prisma.socialAccount.findMany({
    where: {
      provider: SocialProvider.INSTAGRAM,
      isActive: true,
      tokenEnc: { not: null },
      tokenExpiresAt: { gt: now, lte: new Date(now.getTime() + (opts.withinDays ?? 10) * DAY) },
      updatedAt: { lte: new Date(now.getTime() - DAY) },
    },
  });
  let refreshed = 0;
  let failed = 0;
  for (const account of accounts) {
    try {
      const current = decryptAccessToken(account);
      if (!current) continue;
      const token = await refreshInstagramToken(current, { now }, opts.fetchImpl);
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          tokenEnc: secrets.encryptSecret(
            token.accessToken,
            tokenAad(account.provider, account.externalId),
          ),
          tokenExpiresAt: token.expiresAt ?? account.tokenExpiresAt,
          expiryNotifiedAt: null,
          lastError: null,
        },
      });
      refreshed += 1;
    } catch (err) {
      failed += 1;
      const message =
        err instanceof SocialPublishError ? err.message : 'Falha ao renovar o acesso ao Instagram.';
      if (!(err instanceof SocialPublishError))
        console.error('[social] falha ao renovar token do Instagram:', err);
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          lastError: message,
          ...(err instanceof SocialPublishError && err.opts.deactivateAccount
            ? { isActive: false }
            : {}),
        },
      });
    }
  }
  return { checked: accounts.length, refreshed, failed };
}
