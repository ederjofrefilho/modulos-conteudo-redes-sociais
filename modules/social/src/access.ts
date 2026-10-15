import { prisma, SocialAccessLevel } from '@app/db';
import { ForbiddenError, NotFoundError, ValidationError, requireAdmin, type Ctx } from '@app/core';
import { ACCESS_LABEL, atLeast, canManageAccount, resolveAccess, type AccessLevel, type AccountAccess } from './access-rules.js';

// Acesso às contas sociais, aplicado no SERVIÇO (UI, MCP e qualquer API passam
// por aqui). Regras puras em access-rules.ts.

function userOf(ctx: Ctx) {
  return { id: ctx.actor.id, role: ctx.actor.role };
}

/** Nível de acesso do ator a cada conta (todas as contas; NONE incluído). */
export async function accessMap(ctx: Ctx): Promise<Map<string, AccountAccess>> {
  const [accounts, grants] = await Promise.all([
    prisma.socialAccount.findMany({ select: { id: true, shared: true, ownerId: true } }),
    prisma.socialAccountAccess.findMany({ where: { userId: ctx.actor.id } }),
  ]);
  const byAccount = new Map(grants.map((g) => [g.socialAccountId, g]));
  return new Map(accounts.map((a) => [a.id, resolveAccess(a, userOf(ctx), byAccount.get(a.id))]));
}

/** Ids das contas em que o ator tem pelo menos `min`. */
export async function accountIdsWith(ctx: Ctx, min: AccessLevel = 'VIEW'): Promise<string[]> {
  const map = await accessMap(ctx);
  return [...map].filter(([, a]) => atLeast(a.level, min)).map(([id]) => id);
}

/** Ids das contas cujas métricas o ator pode ver. */
export async function metricsAccountIds(ctx: Ctx): Promise<string[]> {
  const map = await accessMap(ctx);
  return [...map].filter(([, a]) => a.metrics).map(([id]) => id);
}

export async function accessTo(ctx: Ctx, accountId: string): Promise<AccountAccess> {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId }, select: { id: true, shared: true, ownerId: true } });
  if (!account) throw new NotFoundError('Conta de rede social', accountId);
  const grant = account.shared
    ? await prisma.socialAccountAccess.findUnique({ where: { socialAccountId_userId: { socialAccountId: accountId, userId: ctx.actor.id } } })
    : null;
  return resolveAccess(account, userOf(ctx), grant);
}

const NEED: Record<AccessLevel, string> = {
  NONE: '',
  VIEW: 'Você não tem acesso a esta conta.',
  DRAFT: 'Você não pode criar nem editar posts nesta conta.',
  PUBLISH: 'Só quem pode publicar nesta conta aprova, agenda ou publica. Envie para aprovação.',
};

/** Lança ForbiddenError (403) se o ator não tiver `min` na conta. */
export async function assertAccess(ctx: Ctx, accountId: string, min: AccessLevel): Promise<AccountAccess> {
  const access = await accessTo(ctx, accountId);
  if (!atLeast(access.level, min)) throw new ForbiddenError(NEED[min]);
  return access;
}

export async function assertCanManage(ctx: Ctx, accountId: string) {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId }, select: { shared: true, ownerId: true } });
  if (!account) throw new NotFoundError('Conta de rede social', accountId);
  if (!canManageAccount(account, userOf(ctx)))
    throw new ForbiddenError(account.shared ? 'Só um administrador gere as contas da empresa.' : 'Esta conta é de outra pessoa.');
}

/** Quem pode publicar numa conta: ADMINs ativos + quem tem PUBLISH (partilhada) ou o dono (pessoal). */
export async function publisherIds(accountId: string): Promise<string[]> {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId }, select: { shared: true, ownerId: true } });
  if (!account) return [];
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
  const ids = new Set(admins.map((a) => a.id));
  if (!account.shared && account.ownerId) ids.add(account.ownerId);
  if (account.shared) {
    const grants = await prisma.socialAccountAccess.findMany({
      where: { socialAccountId: accountId, level: SocialAccessLevel.PUBLISH, user: { isActive: true } },
      select: { userId: true },
    });
    grants.forEach((g) => ids.add(g.userId));
  }
  return [...ids];
}

// --- Gestão das permissões (só ADMIN, só contas partilhadas) -----------------

/** Utilizadores ativos com o acesso de cada um a uma conta partilhada. */
export async function listAccountAccess(accountId: string, ctx: Ctx) {
  requireAdmin(ctx);
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId }, select: { id: true, shared: true } });
  if (!account) throw new NotFoundError('Conta de rede social', accountId);
  const [users, grants] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' } }),
    prisma.socialAccountAccess.findMany({ where: { socialAccountId: accountId } }),
  ]);
  const byUser = new Map(grants.map((g) => [g.userId, g]));
  return users.map((u) => {
    const g = byUser.get(u.id);
    return {
      user: u,
      admin: u.role === 'ADMIN',
      level: (u.role === 'ADMIN' ? 'PUBLISH' : (g?.level ?? 'NONE')) as AccessLevel,
      canViewMetrics: u.role === 'ADMIN' ? true : (g?.canViewMetrics ?? false),
    };
  });
}

/** Dá/tira acesso. `level = NONE` apaga a linha. ADMIN já tem tudo (não grava). */
export async function setAccountAccess(
  input: { accountId: string; userId: string; level: AccessLevel; canViewMetrics: boolean },
  ctx: Ctx,
) {
  requireAdmin(ctx);
  if (!(input.level in ACCESS_LABEL)) throw new ValidationError('Nível de acesso inválido.');
  const account = await prisma.socialAccount.findUnique({ where: { id: input.accountId }, select: { shared: true } });
  if (!account) throw new NotFoundError('Conta de rede social', input.accountId);
  if (!account.shared) throw new ValidationError('Contas pessoais são só do dono: as permissões valem para as contas da empresa.');
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { role: true, isActive: true } });
  if (!user || !user.isActive) throw new ValidationError('Utilizador não encontrado ou inativo.');
  if (user.role === 'ADMIN') return { level: 'PUBLISH' as AccessLevel, canViewMetrics: true };
  const key = { socialAccountId_userId: { socialAccountId: input.accountId, userId: input.userId } };
  if (input.level === 'NONE') {
    await prisma.socialAccountAccess.deleteMany({ where: { socialAccountId: input.accountId, userId: input.userId } });
    return { level: 'NONE' as AccessLevel, canViewMetrics: false };
  }
  const data = { level: input.level as SocialAccessLevel, canViewMetrics: input.canViewMetrics, grantedById: ctx.actor.id };
  await prisma.socialAccountAccess.upsert({
    where: key,
    create: { socialAccountId: input.accountId, userId: input.userId, ...data },
    update: data,
  });
  return { level: input.level, canViewMetrics: input.canViewMetrics };
}

