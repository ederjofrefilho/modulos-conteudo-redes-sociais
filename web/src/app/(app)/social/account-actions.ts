'use server';

import { revalidatePath } from 'next/cache';
import { collectSocialMetrics, importDueAccounts, importExternalPosts, setImportPosts, socialAccess, type AccessLevel } from '@app/social';
import { requireCtx } from '@/lib/session';
import { toActionResult as toResult, type ActionResult } from '@/lib/action-result';
import { ensureSocialMediaStore } from '@/lib/social-media-store';

// Contas sociais: sincronização das publicações da rede e permissões nas
// contas da empresa. Adaptadores finos sobre @app/social — a regra (quem pode o
// quê) está no serviço, não aqui.

/** Liga/desliga a importação dos posts publicados fora do CRM; ao ligar, importa já. */
export async function setSocialImportAction(id: string, enabled: boolean): Promise<ActionResult<{ imported: number; error: string | null }>> {
  try {
    const ctx = await requireCtx();
    await setImportPosts(id, enabled, ctx);
    ensureSocialMediaStore();
    const res = enabled ? await importExternalPosts(id) : { imported: 0, error: null };
    revalidatePath('/settings/social');
    revalidatePath('/social');
    return { ok: true, data: { imported: res.imported, error: res.error } };
  } catch (err) {
    return toResult(err);
  }
}

/** Permissões de uma conta da empresa (só ADMIN). */
export async function listSocialAccessAction(accountId: string) {
  const ctx = await requireCtx();
  return socialAccess.listAccountAccess(accountId, ctx);
}

export async function setSocialAccessAction(input: {
  accountId: string;
  userId: string;
  level: AccessLevel;
  canViewMetrics: boolean;
}): Promise<ActionResult<{ level: AccessLevel; canViewMetrics: boolean }>> {
  try {
    const ctx = await requireCtx();
    const data = await socialAccess.setAccountAccess(input, ctx);
    revalidatePath('/settings/social');
    revalidatePath('/social');
    return { ok: true, data };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * "Atualizar" no /social: sincroniza já as publicações das contas que a pessoa
 * vê (inclusive as feitas fora do CRM) e recolhe as métricas. Só lê das redes.
 */
export async function syncSocialPostsAction(): Promise<
  ActionResult<{ imported: number; updated: number; accounts: number; errors: string[] }>
> {
  try {
    const ctx = await requireCtx();
    ensureSocialMediaStore();
    const ids = await socialAccess.accountIdsWith(ctx, 'VIEW');
    const results = await importDueAccounts({ force: true, accountIds: ids });
    await collectSocialMetrics({ force: true, max: 15 }).catch(() => null);
    revalidatePath('/social');
    revalidatePath('/social/desempenho');
    return {
      ok: true,
      data: {
        imported: results.reduce((n, r) => n + r.imported, 0),
        updated: results.reduce((n, r) => n + r.updated, 0),
        accounts: results.length,
        errors: results.map((r) => r.error).filter((e): e is string => !!e),
      },
    };
  } catch (err) {
    return toResult(err);
  }
}
