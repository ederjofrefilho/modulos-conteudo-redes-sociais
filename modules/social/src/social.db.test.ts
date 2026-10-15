import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@app/db';
import type { Ctx } from '@app/core';
import { approveSocialPost, createSocialPost, getSocialPost, retrySocialPost, updateSocialPost } from './posts.js';
import { connectSocialAccount, deactivateExpiredAccounts, decryptAccessToken, disconnectSocialAccount, listSocialAccounts } from './accounts.js';
import { publishDueSocialPosts, publishSocialPost } from './publish.js';
import { refreshExpiringInstagramTokens } from './instagram-connect.js';
import { registerProvider } from './providers/index.js';
import { createLinkedinProvider } from './providers/linkedin.js';

/**
 * Integração contra o Postgres (mesmo molde de modules/content/src/
 * events.db.test.ts): aprovar e publicar precisam gravar os eventos certos,
 * o lock não pode deixar publicar duas vezes, e o token nunca sai em claro.
 * Tudo em modo simulação — nenhum teste chama rede.
 */
process.env.MAILBOX_ENC_KEY ??= randomBytes(32).toString('base64');

const suffix = `social-${Date.now()}`;
let ctx: Ctx;
let userId: string;
let accountId: string;
let assetId: string;
const postIds: string[] = [];

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `${suffix}@example.test`, name: 'Teste Social' } });
  userId = user.id;
  ctx = { actor: { id: user.id, email: user.email, name: user.name, role: user.role } };
  accountId = (
    await connectSocialAccount(
      { provider: 'LINKEDIN', externalId: suffix, displayName: 'Perfil de teste', accessToken: 'segredo-123', scopes: ['w_member_social'] },
      ctx,
    )
  ).id;
  assetId = (
    await prisma.contentAsset.create({
      data: {
        url: 'https://example.test/peca.jpg',
        pathname: `${suffix}/peca.jpg`,
        width: 1200,
        height: 1200,
        alt: 'Peça',
        bytes: 1000,
        mimeType: 'image/jpeg',
        uploadedById: userId,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { actorId: userId } });
  for (const id of postIds) await prisma.event.deleteMany({ where: { payload: { path: ['postId'], equals: id } } });
  // Se o beforeAll falhou antes de conectar a conta, accountId fica indefinido e
  // o filtro por caminho JSON sem valor vira um P2019 que esconde a causa real.
  if (accountId) {
    await prisma.event.deleteMany({ where: { payload: { path: ['accountId'], equals: accountId } } });
    await prisma.socialPost.deleteMany({ where: { socialAccountId: accountId } });
    await prisma.socialAccount.deleteMany({ where: { id: accountId } });
  }
  if (assetId) await prisma.contentAsset.deleteMany({ where: { id: assetId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

async function newPost(text = 'Post de teste #dados') {
  const post = await createSocialPost({ socialAccountId: accountId, text, mediaAssetIds: [assetId], campaignKey: suffix }, ctx);
  postIds.push(post.id);
  return post;
}

describe('contas', () => {
  it('token fica cifrado no banco e a listagem nunca o devolve', async () => {
    const row = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(row.tokenEnc).toBeTruthy();
    expect(row.tokenEnc).not.toContain('segredo-123');
    expect(decryptAccessToken(row)).toBe('segredo-123');
    const listed = (await listSocialAccounts()).find((a) => a.id === accountId)!;
    expect(listed).not.toHaveProperty('tokenEnc');
    expect(JSON.stringify(listed)).not.toContain('segredo');
  });
});

describe('fluxo do post', () => {
  it('nasce rascunho; aprovar grava social.approved com o ator', async () => {
    const post = await newPost();
    expect(post.status).toBe('DRAFT');
    const approved = await approveSocialPost(post.id, ctx);
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedById).toBe(userId);
    const [ev] = await prisma.event.findMany({ where: { type: 'social.approved', payload: { path: ['postId'], equals: post.id } } });
    expect(ev).toMatchObject({ actorId: userId, source: 'crm' });
    expect(ev!.payload).toMatchObject({ provider: 'LINKEDIN', accountId });
  });

  it('editar o texto de um aprovado volta para rascunho e limpa a aprovação; mudar só o horário não', async () => {
    const post = await newPost();
    await approveSocialPost(post.id, ctx);
    const later = new Date(Date.now() + 86_400_000);
    expect((await updateSocialPost(post.id, { scheduledAt: later }, ctx)).status).toBe('APPROVED');
    const edited = await updateSocialPost(post.id, { text: 'Texto novo' }, ctx);
    expect(edited).toMatchObject({ status: 'DRAFT', approvedById: null, approvedAt: null });
  });

  it('publicar (simulação) grava social.published; duas chamadas simultâneas publicam uma vez só', async () => {
    const post = await newPost();
    await approveSocialPost(post.id, ctx);
    const [a, b] = await Promise.all([publishSocialPost(post.id, { mode: 'log' }), publishSocialPost(post.id, { mode: 'log' })]);
    expect([a.outcome, b.outcome].sort()).toEqual(['published', 'skipped']);
    const after = await getSocialPost(post.id);
    expect(after).toMatchObject({ status: 'PUBLISHED', externalId: `simulated:${post.id}`, attempts: 1 });
    const evs = await prisma.event.findMany({ where: { type: 'social.published', payload: { path: ['postId'], equals: post.id } } });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ source: 'cron', actorId: null });
    expect(evs[0]!.payload).toMatchObject({ simulated: true });
    expect(JSON.stringify(evs[0]!.payload)).not.toContain('segredo');
    // Já publicado: nunca de novo.
    expect((await publishSocialPost(post.id, { mode: 'log' })).outcome).toBe('skipped');
  });

  it('agendado no futuro não sai no publicador automático', async () => {
    const post = await newPost();
    await approveSocialPost(post.id, ctx, { scheduledAt: new Date(Date.now() + 3_600_000) });
    const result = await publishDueSocialPosts({ mode: 'log' });
    expect(result.results.some((r) => r.postId === post.id)).toBe(false);
  });

  it('modo live publica pelo adaptador do LinkedIn (fetch falso) e guarda a URN do post', async () => {
    const post = await newPost('Ao vivo #dados');
    await approveSocialPost(post.id, ctx);
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.endsWith('initializeUpload')) return Response.json({ value: { uploadUrl: 'https://upload.test/1', image: 'urn:li:image:1' } });
      if (url.endsWith('/rest/posts')) return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:42' } });
      return new Response(new Uint8Array([1]), { status: 200 });
    });
    try {
      const outcome = await publishSocialPost(post.id, { mode: 'live' });
      expect(outcome).toMatchObject({ outcome: 'published', simulated: false });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(calls).toEqual(['https://example.test/peca.jpg', expect.stringContaining('initializeUpload'), 'https://upload.test/1', expect.stringContaining('/rest/posts')]);
    const after = await getSocialPost(post.id);
    expect(after).toMatchObject({ status: 'PUBLISHED', externalId: 'urn:li:share:42', externalUrl: 'https://www.linkedin.com/feed/update/urn:li:share:42/' });
    expect(after.providerState).toMatchObject({ linkedinImages: { [assetId]: 'urn:li:image:1' } });
  });

  it('vídeo ainda processando na rede: volta à fila sem social.failed, e a passada seguinte publica sem reenviar', async () => {
    const video = await prisma.contentAsset.create({
      data: {
        url: 'https://example.test/anuncio.mp4',
        pathname: `${suffix}/anuncio.mp4`,
        width: 1920,
        height: 1080,
        alt: 'Anúncio',
        bytes: 200_000,
        mimeType: 'video/mp4',
        durationMs: 24_000,
        uploadedById: userId,
      },
    });
    const post = await createSocialPost({ socialAccountId: accountId, text: 'Vídeo', mediaAssetIds: [video.id], campaignKey: suffix }, ctx);
    postIds.push(post.id);
    await approveSocialPost(post.id, ctx);
    // Sem espera entre consultas: o teste não pode levar os 20 s do padrão.
    registerProvider(createLinkedinProvider(undefined, { pollDelayMs: 0, pollAttempts: 1 }));
    let status = 'PROCESSING';
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('/videos?action=initializeUpload'))
        return Response.json({
          value: { video: 'urn:li:video:7', uploadToken: '', uploadInstructions: [{ uploadUrl: 'https://upload.test/v', firstByte: 0, lastByte: 0 }] },
        });
      if (url === 'https://upload.test/v') return new Response(null, { status: 200, headers: { etag: 'e1' } });
      if (url.includes('/videos?action=finalizeUpload')) return new Response(null, { status: 200 });
      if (url.includes('/videos/')) return Response.json({ status });
      if (url.endsWith('/rest/posts')) return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:77' } });
      return new Response(new Uint8Array([1]), { status: 200 });
    });
    try {
      const first = await publishSocialPost(post.id, { mode: 'live' });
      expect(first).toMatchObject({ outcome: 'processing' });
      const waiting = await getSocialPost(post.id);
      expect(waiting).toMatchObject({ status: 'APPROVED', externalId: null });
      expect(waiting.providerState).toMatchObject({ linkedinVideo: { key: video.id, urn: 'urn:li:video:7' } });
      expect(await prisma.event.count({ where: { type: 'social.failed', payload: { path: ['postId'], equals: post.id } } })).toBe(0);

      status = 'AVAILABLE';
      calls.length = 0;
      const second = await publishSocialPost(post.id, { mode: 'live' });
      expect(second).toMatchObject({ outcome: 'published' });
      expect(calls.some((u) => u.includes('initializeUpload'))).toBe(false);
      expect((await getSocialPost(post.id)).externalId).toBe('urn:li:share:77');
    } finally {
      vi.unstubAllGlobals();
      registerProvider(createLinkedinProvider());
      await prisma.socialPost.deleteMany({ where: { id: post.id } });
      await prisma.contentAsset.deleteMany({ where: { id: video.id } });
    }
  });

  it('modo live com token revogado: FAILED com "reconecte", conta desativada e social.failed; tentar de novo volta a aprovado', async () => {
    const post = await newPost();
    await approveSocialPost(post.id, ctx);
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('/rest/posts') || url.endsWith('initializeUpload')
        ? Response.json({ message: 'Invalid access token' }, { status: 401 })
        : new Response(new Uint8Array([1]), { status: 200 }),
    );
    let outcome;
    try {
      outcome = await publishSocialPost(post.id, { mode: 'live' });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(outcome).toMatchObject({ outcome: 'failed' });
    expect((outcome as { error: string }).error).toMatch(/reconecte/);
    expect((await getSocialPost(post.id)).status).toBe('FAILED');
    expect((await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } })).isActive).toBe(false);
    const [ev] = await prisma.event.findMany({ where: { type: 'social.failed', payload: { path: ['postId'], equals: post.id } } });
    expect(ev!.payload).toMatchObject({ provider: 'LINKEDIN' });
    expect(JSON.stringify(ev!.payload)).not.toContain('segredo');
    expect((await retrySocialPost(post.id, ctx)).status).toBe('APPROVED');
    // Reativa para os próximos testes, como faria uma reconexão.
    await prisma.socialAccount.update({ where: { id: accountId }, data: { isActive: true, lastError: null } });
  });

  it('acesso vencido: o cron desativa a conta', async () => {
    await prisma.socialAccount.update({ where: { id: accountId }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    expect(await deactivateExpiredAccounts()).toBeGreaterThanOrEqual(1);
    expect((await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } })).isActive).toBe(false);
    await prisma.socialAccount.update({ where: { id: accountId }, data: { isActive: true, lastError: null, tokenExpiresAt: null } });
  });

  it('conta desconectada: aprovar é bloqueado e o publicador falha sem chamar a rede', async () => {
    const post = await newPost();
    await approveSocialPost(post.id, ctx);
    const draft = await newPost();
    await disconnectSocialAccount(accountId, ctx);
    await expect(approveSocialPost(draft.id, ctx)).rejects.toThrow(/corrija/);
    const outcome = await publishSocialPost(post.id, { mode: 'log' });
    expect(outcome.outcome).toBe('failed');
    const row = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(row).toMatchObject({ isActive: false, tokenEnc: null });
  });
});

describe('Instagram: renovação do token no cron', () => {
  it('renova quem vence em menos de 10 dias, regrava cifrado e ignora quem não precisa', async () => {
    const day = 86_400_000;
    const now = new Date();
    const mk = async (externalId: string, expiresInDays: number) => {
      const a = await connectSocialAccount(
        { provider: 'INSTAGRAM', externalId, displayName: `@${externalId}`, accessToken: `tok-${externalId}`, tokenExpiresAt: new Date(now.getTime() + expiresInDays * day) },
        ctx,
      );
      // A API só renova token com mais de 24 h: simula conexão antiga.
      await prisma.socialAccount.update({ where: { id: a.id }, data: { updatedAt: new Date(now.getTime() - 2 * day) } });
      return a.id;
    };
    const soon = await mk(`${suffix}-ig-soon`, 5);
    const later = await mk(`${suffix}-ig-later`, 40);
    const seen: string[] = [];
    try {
      const fetchImpl = (async (url: string) => {
        seen.push(new URL(url).searchParams.get('access_token')!);
        return new Response(JSON.stringify({ access_token: 'tok-novo', expires_in: 60 * 86400 }), { status: 200 });
      }) as unknown as typeof fetch;
      const result = await refreshExpiringInstagramTokens({ now, fetchImpl });
      expect(result.refreshed).toBeGreaterThanOrEqual(1);
      expect(seen).toContain(`tok-${suffix}-ig-soon`);
      expect(seen).not.toContain(`tok-${suffix}-ig-later`);
      const row = await prisma.socialAccount.findUniqueOrThrow({ where: { id: soon } });
      expect(row.tokenEnc).not.toContain('tok-novo');
      expect(decryptAccessToken(row)).toBe('tok-novo');
      expect(row.tokenExpiresAt!.getTime()).toBeGreaterThan(now.getTime() + 59 * day);
    } finally {
      await prisma.socialAccount.deleteMany({ where: { id: { in: [soon, later] } } });
    }
  });
});
