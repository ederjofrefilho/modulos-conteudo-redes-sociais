import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@app/db';
import { ForbiddenError, type Ctx } from '@app/core';
import { connectSocialAccount, listAccountsFor, notifyExpiringAccounts } from './accounts.js';
import { setAccountAccess } from './access.js';
import {
  approveSocialPost,
  createSocialPost,
  getSocialPost,
  listSocialPostsForWorkspace,
  returnSocialPost,
  submitSocialPost,
  updateSocialPost,
} from './posts.js';

/**
 * Permissões nas contas sociais aplicadas no SERVIÇO (a UI, o MCP e qualquer
 * API passam por aqui): conta pessoal só do dono, conta da empresa pelo nível
 * que um ADMIN deu, revisão com notificação. Banco de verdade; nada chama rede.
 */
process.env.MAILBOX_ENC_KEY ??= randomBytes(32).toString('base64');

const suffix = `social-access-${Date.now()}`;
const ctxOf = (u: { id: string; email: string; name: string | null; role: 'ADMIN' | 'MEMBER' }): Ctx => ({
  actor: { id: u.id, email: u.email, name: u.name, role: u.role },
});
let admin: Ctx;
let bruna: Ctx;
let outro: Ctx;
let sharedId: string;
let brunaPersonalId: string;
const userIds: string[] = [];

beforeAll(async () => {
  const mk = async (name: string, role: 'ADMIN' | 'MEMBER') => {
    const u = await prisma.user.create({ data: { email: `${suffix}-${name}@example.test`, name, role } });
    userIds.push(u.id);
    return ctxOf({ ...u, role });
  };
  admin = await mk('Admin', 'ADMIN');
  bruna = await mk('Bruna', 'MEMBER');
  outro = await mk('Outro', 'MEMBER');
  sharedId = (
    await connectSocialAccount(
      { provider: 'LINKEDIN', kind: 'ORGANIZATION', externalId: `${suffix}-org`, displayName: 'Página empresa', accessToken: 'org-tok', shared: true },
      admin,
    )
  ).id;
  brunaPersonalId = (
    await connectSocialAccount(
      { provider: 'LINKEDIN', externalId: `${suffix}-bruna`, displayName: 'Bruna', accessToken: 't-tok' },
      bruna,
    )
  ).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.event.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.socialPost.deleteMany({ where: { socialAccountId: { in: [sharedId, brunaPersonalId].filter(Boolean) } } });
  await prisma.socialAccount.deleteMany({ where: { externalId: { startsWith: suffix } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('contas por utilizador', () => {
  it('só um ADMIN liga uma conta da empresa', async () => {
    await expect(
      connectSocialAccount(
        { provider: 'INSTAGRAM', kind: 'ORGANIZATION', externalId: `${suffix}-ig`, displayName: '@empresa', accessToken: 'x', shared: true },
        bruna,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a conta pessoal de outra pessoa não pode ser tomada por quem a liga depois', async () => {
    await expect(
      connectSocialAccount({ provider: 'LINKEDIN', externalId: `${suffix}-bruna`, displayName: 'Bruna', accessToken: 'y' }, outro),
    ).rejects.toThrow(/já está ligada/);
  });

  it('cada um vê as suas contas e as da empresa a que tem acesso', async () => {
    const before = (await listAccountsFor(outro)).map((a) => a.id);
    expect(before).not.toContain(sharedId);
    expect(before).not.toContain(brunaPersonalId);
    const own = (await listAccountsFor(bruna)).map((a) => a.id);
    expect(own).toContain(brunaPersonalId);
    expect(own).not.toContain(sharedId);
    // ADMIN vê a equipa toda só quando pede.
    expect((await listAccountsFor(admin)).map((a) => a.id)).not.toContain(brunaPersonalId);
    expect((await listAccountsFor(admin, { team: true })).map((a) => a.id)).toContain(brunaPersonalId);
  });
});

describe('permissões nas contas da empresa', () => {
  it('sem acesso: não cria nem vê; com VIEW vê mas não cria', async () => {
    await expect(createSocialPost({ socialAccountId: sharedId, text: 'x' }, bruna)).rejects.toBeInstanceOf(ForbiddenError);
    const post = await createSocialPost({ socialAccountId: sharedId, text: 'Do admin' }, admin);
    await expect(getSocialPost(post.id, bruna)).rejects.toBeInstanceOf(ForbiddenError);
    await setAccountAccess({ accountId: sharedId, userId: bruna.actor.id, level: 'VIEW', canViewMetrics: false }, admin);
    expect((await getSocialPost(post.id, bruna)).id).toBe(post.id);
    expect((await listSocialPostsForWorkspace(bruna)).map((p) => p.id)).toContain(post.id);
    await expect(updateSocialPost(post.id, { text: 'mudado' }, bruna)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('só ADMIN dá acesso, e só em conta da empresa', async () => {
    await expect(
      setAccountAccess({ accountId: sharedId, userId: outro.actor.id, level: 'PUBLISH', canViewMetrics: true }, bruna),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      setAccountAccess({ accountId: brunaPersonalId, userId: outro.actor.id, level: 'VIEW', canViewMetrics: false }, admin),
    ).rejects.toThrow(/pessoais/);
  });

  it('DRAFT cria e envia para aprovação; quem publica é avisado, devolve com comentário e aprova', async () => {
    await setAccountAccess({ accountId: sharedId, userId: bruna.actor.id, level: 'DRAFT', canViewMetrics: false }, admin);
    const post = await createSocialPost({ socialAccountId: sharedId, text: 'Rascunho da Bruna' }, bruna);
    await expect(approveSocialPost(post.id, bruna)).rejects.toBeInstanceOf(ForbiddenError);

    expect((await submitSocialPost(post.id, bruna)).reviewState).toBe('pending');
    const toAdmin = await prisma.notification.findMany({ where: { userId: admin.actor.id, type: 'social_review' } });
    expect(toAdmin.some((n) => n.url === `/social?post=${post.id}`)).toBe(true);

    await expect(returnSocialPost(post.id, '   ', admin)).rejects.toThrow(/Corrija/);
    const returned = await returnSocialPost(post.id, 'Encurte o gancho.', admin);
    expect(returned).toMatchObject({ reviewState: 'returned', reviewComment: 'Encurte o gancho.', reviewedById: admin.actor.id });
    const toBruna = await prisma.notification.findMany({ where: { userId: bruna.actor.id, type: 'social_review' } });
    expect(toBruna.some((n) => n.body?.includes('Encurte'))).toBe(true);

    await submitSocialPost(post.id, bruna);
    const approved = await approveSocialPost(post.id, admin, { scheduledAt: new Date(Date.now() + 86_400_000) });
    expect(approved).toMatchObject({ status: 'APPROVED', reviewState: null, approvedById: admin.actor.id, scheduledById: admin.actor.id });
    // Aprovado é de quem publica: DRAFT não mexe no horário nem arquiva.
    await expect(updateSocialPost(post.id, { scheduledAt: new Date(Date.now() + 2 * 86_400_000) }, bruna)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('PUBLISH aprova sem passar por revisão', async () => {
    await setAccountAccess({ accountId: sharedId, userId: outro.actor.id, level: 'PUBLISH', canViewMetrics: true }, admin);
    const post = await createSocialPost({ socialAccountId: sharedId, text: 'Do outro' }, outro);
    const approved = await approveSocialPost(post.id, outro, { scheduledAt: new Date(Date.now() + 86_400_000) });
    expect(approved.status).toBe('APPROVED');
  });
});

describe('aviso de acesso a vencer', () => {
  it('avisa o dono (pessoal) uma vez por validade', async () => {
    const now = new Date();
    await prisma.socialAccount.update({ where: { id: brunaPersonalId }, data: { tokenExpiresAt: new Date(now.getTime() + 3 * 86_400_000) } });
    expect(await notifyExpiringAccounts(now)).toBeGreaterThanOrEqual(1);
    const first = await prisma.notification.count({ where: { userId: bruna.actor.id, type: 'social_token_expiring' } });
    expect(first).toBe(1);
    await notifyExpiringAccounts(now);
    expect(await prisma.notification.count({ where: { userId: bruna.actor.id, type: 'social_token_expiring' } })).toBe(1);
  });
});
