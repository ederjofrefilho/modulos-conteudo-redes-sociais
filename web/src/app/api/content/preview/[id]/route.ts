import { publicPosts, verifyPreviewToken } from '@app/content';
import { requireScope, ForbiddenError } from '@app/core';
import { handle } from '@/lib/api';
import { requireCtx } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Devolve um post em QUALQUER status (rascunho incluso), pra prévia por
 * iframe do editor. Duas camadas de autenticação, nenhuma sozinha basta:
 * 1. `Authorization: Bearer` com escopo `content:read` — igual às rotas
 *    públicas, prova que quem chama é um deploy legítimo do site.
 * 2. `?t=` — token HMAC de 15 min assinado pelo editor (`signPreviewToken`)
 *    pra ESTE post especificamente. Sem ele, o escopo `content:read` sozinho
 *    devolveria rascunho pra qualquer chamador com esse token de longa
 *    duração — a prévia de um post não publicado não pode vazar assim.
 */
export function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await requireCtx();
    requireScope(ctx, 'content:read');

    const { id } = await params;
    const token = new URL(req.url).searchParams.get('t');
    if (!token || !verifyPreviewToken(token, id)) {
      throw new ForbiddenError('Token de prévia inválido ou expirado.');
    }

    return publicPosts.getPreviewPost(id);
  });
}
