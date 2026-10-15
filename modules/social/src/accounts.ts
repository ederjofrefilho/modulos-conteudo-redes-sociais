import { prisma, SocialAccountKind, SocialProvider } from '@app/db';
import { z } from 'zod';
import { ForbiddenError, NotFoundError, ValidationError, events, isAdmin, notifications, secrets, type Ctx } from '@app/core';
import { accessMap, assertCanManage } from './access.js';
import type { AccountAccess } from './access-rules.js';

// Contas conectadas. Os tokens NUNCA saem daqui em texto: o SELECT público
// não tem tokenEnc/refreshTokenEnc, e decifrar é só para o publicador, em
// memória, na hora de chamar a rede.

/** Campos seguros — o que UI, API e MCP podem ver. */
export const SAFE_ACCOUNT_SELECT = {
  id: true,
  provider: true,
  kind: true,
  externalId: true,
  displayName: true,
  avatarUrl: true,
  tokenExpiresAt: true,
  scopes: true,
  isActive: true,
  lastError: true,
  importPosts: true,
  importedAt: true,
  importError: true,
  connectedBy: { select: { id: true, name: true, email: true } },
  shared: true,
  ownerId: true,
  owner: { select: { id: true, name: true, email: true } },
  createdAt: true,
  updatedAt: true,
} as const;

/** AAD do segredo: amarra o token à conta (mover o ciphertext para outra linha não decifra). */
export function tokenAad(provider: SocialProvider, externalId: string): string {
  return `social:${provider}:${externalId}`;
}

export async function listSocialAccounts(opts: { activeOnly?: boolean } = {}) {
  return prisma.socialAccount.findMany({
    where: opts.activeOnly ? { isActive: true } : {},
    orderBy: [{ isActive: 'desc' }, { provider: 'asc' }, { displayName: 'asc' }],
    select: SAFE_ACCOUNT_SELECT,
  });
}

/**
 * Contas que o ator vê (nível ≥ VIEW), com o acesso dele a cada uma. Com
 * `team` (só ADMIN), também as contas pessoais de toda a equipa — o ADMIN já
 * tem acesso a todas; sem `team`, vê as dele e as partilhadas.
 */
export async function listAccountsFor(ctx: Ctx, opts: { activeOnly?: boolean; team?: boolean } = {}) {
  const [accounts, access] = await Promise.all([listSocialAccounts(opts), accessMap(ctx)]);
  const team = opts.team && isAdmin(ctx);
  return accounts
    .map((a) => ({ ...a, access: access.get(a.id) ?? ({ level: 'NONE', metrics: false, owner: false } as AccountAccess) }))
    .filter((a) => a.access.level !== 'NONE')
    .filter((a) => team || a.shared || a.ownerId === ctx.actor.id || (!a.ownerId && isAdmin(ctx)));
}

export async function getSocialAccount(id: string) {
  const account = await prisma.socialAccount.findUnique({ where: { id }, select: SAFE_ACCOUNT_SELECT });
  if (!account) throw new NotFoundError('Conta de rede social', id);
  return account;
}

const connectSchema = z.object({
  provider: z.nativeEnum(SocialProvider),
  kind: z.nativeEnum(SocialAccountKind).default(SocialAccountKind.PERSON),
  externalId: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  avatarUrl: z.string().trim().url().nullable().optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).nullable().optional(),
  tokenExpiresAt: z.date().nullable().optional(),
  scopes: z.array(z.string()).default([]),
  // Conta da empresa (só ADMIN liga). Sem isto, é conta pessoal de quem liga.
  shared: z.boolean().default(false),
});
export type ConnectSocialAccountInput = z.input<typeof connectSchema>;

/**
 * Grava (ou reconecta) uma conta depois do OAuth — chamado pelos callbacks
 * das Etapas 3 e 4. Reconectar a mesma conta (mesmo provider + externalId)
 * troca os tokens e reativa, mantendo o histórico de posts.
 */
export async function connectSocialAccount(input: ConnectSocialAccountInput, ctx: Ctx) {
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten());
  const d = parsed.data;
  const aad = tokenAad(d.provider, d.externalId);
  const existing = await prisma.socialAccount.findUnique({
    where: { provider_externalId: { provider: d.provider, externalId: d.externalId } },
    select: { shared: true, ownerId: true, owner: { select: { name: true, email: true } } },
  });
  // Quem já existe manda: reconectar não troca uma conta de pessoal para partilhada nem de dono.
  const shared = existing ? existing.shared : d.shared;
  if (shared && !isAdmin(ctx)) throw new ForbiddenError('Só um administrador liga as contas da empresa.');
  if (existing && !existing.shared && existing.ownerId && existing.ownerId !== ctx.actor.id) {
    throw new ForbiddenError(
      `Esta conta já está ligada ao CRM por ${existing.owner?.name ?? existing.owner?.email ?? 'outra pessoa'}.`,
    );
  }
  const data = {
    kind: d.kind,
    displayName: d.displayName,
    avatarUrl: d.avatarUrl ?? null,
    tokenEnc: secrets.encryptSecret(d.accessToken, aad),
    refreshTokenEnc: d.refreshToken ? secrets.encryptSecret(d.refreshToken, aad) : null,
    tokenExpiresAt: d.tokenExpiresAt ?? null,
    scopes: d.scopes,
    connectedById: ctx.actor.id,
    isActive: true,
    lastError: null,
    expiryNotifiedAt: null,
    shared,
    ownerId: shared ? null : ctx.actor.id,
  };
  return prisma.socialAccount.upsert({
    where: { provider_externalId: { provider: d.provider, externalId: d.externalId } },
    create: { provider: d.provider, externalId: d.externalId, ...data },
    update: data,
    select: SAFE_ACCOUNT_SELECT,
  });
}

/**
 * Desconecta: apaga os tokens e desativa. Os posts continuam (histórico); os
 * aprovados para essa conta vão falhar com mensagem clara até reconectar.
 */
export async function disconnectSocialAccount(id: string, ctx: Ctx) {
  await assertCanManage(ctx, id);
  const account = await prisma.socialAccount.findUnique({ where: { id }, select: { id: true, provider: true } });
  if (!account) throw new NotFoundError('Conta de rede social', id);
  const updated = await prisma.socialAccount.update({
    where: { id },
    data: { isActive: false, tokenEnc: null, refreshTokenEnc: null },
    select: SAFE_ACCOUNT_SELECT,
  });
  await events.emit({
    type: 'social.disconnected',
    source: events.sourceOf(ctx),
    actorId: ctx.actor.id,
    payload: { accountId: id, provider: account.provider },
  });
  return updated;
}

/** Token decifrado para o publicador — nunca devolver isto a UI/API/MCP. */
export function decryptAccessToken(account: {
  provider: SocialProvider;
  externalId: string;
  tokenEnc: string | null;
}): string | null {
  if (!account.tokenEnc) return null;
  return secrets.decryptSecret(account.tokenEnc, tokenAad(account.provider, account.externalId));
}

/**
 * Marca como inativas as contas cujo acesso já venceu (chamado pelo cron de
 * publicação). Sem isso a tela continuaria mostrando "Ativa" para um token
 * morto até a próxima tentativa de publicar.
 */
export async function deactivateExpiredAccounts(now = new Date()) {
  const result = await prisma.socialAccount.updateMany({
    where: { isActive: true, tokenExpiresAt: { lte: now } },
    data: { isActive: false, lastError: 'O acesso expirou — reconecte para voltar a publicar.' },
  });
  return result.count;
}

/**
 * Aviso no sino: acesso de uma conta a vencer em até `withinDays` dias. Uma
 * vez por validade (`expiryNotifiedAt`, que volta a nulo ao reconectar ou
 * renovar). Conta pessoal avisa o dono; conta da empresa avisa os ADMINs.
 */
export async function notifyExpiringAccounts(now = new Date(), withinDays = 7) {
  const accounts = await prisma.socialAccount.findMany({
    where: {
      isActive: true,
      expiryNotifiedAt: null,
      tokenExpiresAt: { gt: now, lte: new Date(now.getTime() + withinDays * 86_400_000) },
    },
    select: { id: true, provider: true, displayName: true, shared: true, ownerId: true, tokenExpiresAt: true },
  });
  if (!accounts.length) return 0;
  const admins = (await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } })).map((u) => u.id);
  for (const a of accounts) {
    const days = Math.max(1, Math.ceil((a.tokenExpiresAt!.getTime() - now.getTime()) / 86_400_000));
    const to = a.shared ? admins : a.ownerId ? [a.ownerId] : admins;
    for (const userId of to) {
      await notifications.createNotification(userId, {
        type: 'social_token_expiring',
        title: `${a.provider === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'}: acesso de ${a.displayName} vence em ${days} dia(s)`,
        body: 'Ligue a conta de novo em Configurações → Contas sociais para continuar a publicar e a sincronizar.',
        url: '/settings/social',
      });
    }
    await prisma.socialAccount.update({ where: { id: a.id }, data: { expiryNotifiedAt: now } });
  }
  return accounts.length;
}
