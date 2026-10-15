import { prisma, SocialPostStatus, type Prisma, type SocialAccount } from '@app/db';
import type { Ctx } from '@app/core';
import { assertCanManage } from '../access.js';
import { decryptAccessToken } from '../accounts.js';
import { readRemote, type RemoteContent, type RemoteMediaItem } from '../remote.js';
import { getRemoteMediaStore } from '../sync/media-store.js';
import { listInstagramPosts, listLinkedinOrganizationPosts, type RemotePost } from '../sync/remote-posts.js';
import { LINKEDIN_ORG_SOCIAL_SCOPE } from './linkedin.js';

// Sincroniza as publicações como estão na rede — inclusive as feitas FORA do
// CRM (no app, no Business Suite, por outra ferramenta). Cada uma vira (ou
// atualiza) um SocialPost PUBLISHED; as publicadas pelo CRM são reconhecidas
// pelo `externalId` e só ganham o `remote` (tipo + media), nunca outro
// registo. Daí em diante a recolha de métricas trata todas igual. Nunca
// publica nem altera nada na rede. Ligado por conta (`importPosts`) para o
// cron; o botão "Atualizar" sincroniza as contas que a pessoa vê.

const HISTORY_DAYS = 180;
const EVERY_MS = 3 * 3_600_000; // stories duram 24 h: várias passadas por dia
const COPY_BUDGET_MS = 25_000;
type FetchLike = typeof fetch;

export type { RemotePost } from '../sync/remote-posts.js';
export { listLinkedinOrganizationPosts } from '../sync/remote-posts.js';
/** Nome antigo (importação só de texto), mantido para quem já o usa. */
export { listInstagramPosts as listInstagramMedia } from '../sync/remote-posts.js';

export class ImportUnavailableError extends Error {}

/** Chave estável no Blob para a cópia do item `i` (reimportar reaproveita, não duplica). */
function copyKey(accountId: string, externalId: string, i: number) {
  return `social/remote/${accountId}/${externalId.replace(/[^a-zA-Z0-9_-]+/g, '_')}-${i}.jpg`;
}

/** Junta o que veio da rede com as cópias já feitas (mesmo índice = mesmo item). */
async function buildRemote(
  accountId: string,
  r: RemotePost,
  previous: RemoteContent | null,
  now: Date,
  deadline: number,
): Promise<RemoteContent> {
  const store = getRemoteMediaStore();
  const items: RemoteMediaItem[] = [];
  for (const [i, item] of r.items.entries()) {
    let thumbUrl = previous?.items[i]?.thumbUrl ?? null;
    if (!thumbUrl && item.source && store && Date.now() < deadline) {
      thumbUrl = await store.copy(item.source, copyKey(accountId, r.externalId, i)).catch(() => null);
    }
    items.push({ kind: item.kind, url: item.url, thumbUrl, width: item.width ?? null, height: item.height ?? null, title: item.title ?? null });
  }
  return {
    type: r.type,
    items,
    linkUrl: r.linkUrl ?? null,
    linkTitle: r.linkTitle ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    syncedAt: now.toISOString(),
  };
}

/** Sincroniza UMA conta. `imported` = publicações novas no CRM; `updated` = já existiam (conteúdo/media atualizados). */
export async function importExternalPosts(
  accountId: string,
  opts: { now?: Date; fetchImpl?: FetchLike } = {},
): Promise<{ imported: number; updated: number; seen: number; error: string | null }> {
  const now = opts.now ?? new Date();
  const deadline = Date.now() + COPY_BUDGET_MS;
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  if (!account) return { imported: 0, updated: 0, seen: 0, error: 'Conta não encontrada.' };
  let imported = 0;
  let updated = 0;
  let seen = 0;
  let error: string | null = null;
  try {
    const token = decryptAccessToken(account);
    if (!token || !account.isActive) throw new Error('Conta desligada ou sem acesso: ligue de novo em Configurações → Contas sociais.');
    const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
    const remote = await listFor(account, token, since, opts.fetchImpl);
    seen = remote.length;
    // Autor das importadas: o dono (pessoal), quem ligou, ou o ADMIN mais antigo.
    const authorId =
      account.ownerId ??
      account.connectedById ??
      (await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
    if (!authorId) throw new Error('Sem utilizador para registar como autor das publicações importadas.');
    const existing = await prisma.socialPost.findMany({
      where: { socialAccountId: account.id, externalId: { in: remote.map((r) => r.externalId) } },
      select: { id: true, externalId: true, origin: true, remote: true },
    });
    const byExternal = new Map(existing.map((e) => [e.externalId!, e]));
    for (const r of remote) {
      const known = byExternal.get(r.externalId);
      const content = await buildRemote(account.id, r, readRemote(known?.remote), now, deadline);
      if (known) {
        await prisma.socialPost.update({
          where: { id: known.id },
          data: {
            remote: content as unknown as Prisma.InputJsonValue,
            externalUrl: r.url ?? undefined,
            // Texto do CRM é o que a pessoa escreveu (com UTM, etc.); o das importadas segue a rede.
            ...(known.origin === 'imported' ? { text: r.text, publishedAt: r.publishedAt } : {}),
          },
        });
        updated++;
        continue;
      }
      await prisma.socialPost.create({
        data: {
          socialAccountId: account.id,
          text: r.text,
          mediaAssetIds: [],
          status: SocialPostStatus.PUBLISHED,
          publishedAt: r.publishedAt,
          externalId: r.externalId,
          externalUrl: r.url,
          origin: 'imported',
          remote: content as unknown as Prisma.InputJsonValue,
          createdById: authorId,
        },
      });
      imported++;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  await prisma.socialAccount.update({ where: { id: account.id }, data: { importedAt: now, importError: error } });
  return { imported, updated, seen, error };
}

/** Pode sincronizar? (rede e permissão). Null = sim; senão, o motivo legível. */
export function syncUnavailableReason(account: Pick<SocialAccount, 'provider' | 'kind' | 'scopes'>): string | null {
  if (account.provider === 'INSTAGRAM') return null;
  if (account.kind === 'ORGANIZATION')
    return account.scopes.includes(LINKEDIN_ORG_SOCIAL_SCOPE)
      ? null
      : `Falta a permissão ${LINKEDIN_ORG_SOCIAL_SCOPE} para listar os posts da Página: ligue a Página de novo.`;
  return 'Perfil pessoal do LinkedIn: a API só deixa ler publicações de Páginas (a de perfis exige r_member_social, restrita pelo LinkedIn).';
}

function listFor(account: SocialAccount, token: string, since: Date, fetchImpl?: FetchLike): Promise<RemotePost[]> {
  const reason = syncUnavailableReason(account);
  if (reason) throw new ImportUnavailableError(reason);
  if (account.provider === 'INSTAGRAM') return listInstagramPosts(account, token, since, fetchImpl);
  return listLinkedinOrganizationPosts(account, token, since, fetchImpl);
}

/** Cron: contas com a sincronização ligada, a cada ~3 h. `accountIds` limita (botão "Atualizar"). */
export async function importDueAccounts(opts: { now?: Date; fetchImpl?: FetchLike; force?: boolean; accountIds?: string[] } = {}) {
  const now = opts.now ?? new Date();
  const accounts = await prisma.socialAccount.findMany({
    where: { isActive: true, ...(opts.accountIds ? { id: { in: opts.accountIds } } : { importPosts: true }) },
    select: { id: true, importedAt: true, provider: true, kind: true, scopes: true },
  });
  const results: { accountId: string; imported: number; updated: number; error: string | null }[] = [];
  for (const a of accounts) {
    if (syncUnavailableReason(a)) continue;
    if (!opts.force && a.importedAt && now.getTime() - a.importedAt.getTime() < EVERY_MS) continue;
    const r = await importExternalPosts(a.id, opts);
    results.push({ accountId: a.id, imported: r.imported, updated: r.updated, error: r.error });
  }
  return results;
}

export async function setImportPosts(accountId: string, enabled: boolean, ctx: Ctx) {
  await assertCanManage(ctx, accountId);
  return prisma.socialAccount.update({ where: { id: accountId }, data: { importPosts: enabled }, select: { id: true, importPosts: true } });
}
