import { publicPosts } from '@app/content';
import { requireScope } from '@app/core';
import { ContentKind } from '@app/db';
import { handle, listQuery } from '@/lib/api';
import { requireCtx } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CONTENT_KINDS = new Set<string>(Object.values(ContentKind));

// Leitura pública de posts (Fase D) — só status PUBLISHED, é o contrato com
// o site institucional. Autenticada por ApiToken com escopo "content:read" (nunca o
// CRM_API_TOKEN de escrita que a Fase 2 já usa) — sessão de navegador também
// passa (ctx.scopes ausente = sem restrição), útil pra testar de dentro do
// CRM mesmo.
export function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireCtx();
    requireScope(ctx, 'content:read');

    const url = new URL(req.url);
    const kindParam = url.searchParams.get('kind');
    const kind = kindParam && CONTENT_KINDS.has(kindParam) ? (kindParam as ContentKind) : undefined;

    return publicPosts.listPublishedPosts({ ...listQuery(req), kind });
  });
}
