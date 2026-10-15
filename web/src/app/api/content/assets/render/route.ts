import { images } from '@app/content';
import { requireScope } from '@app/core';
import { body, handle } from '@/lib/api';
import { requireCtx } from '@/lib/session';
import { contentImageDeps } from '@/lib/content-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Renderiza um modelo de imagem (blog-cover, ig-quote...), sobe no Blob e
// cria o ContentAsset. Chamado pela tela "Gerar imagem" (sessão) e pela tool
// MCP `render_content_image` do MCP local, que não tem as credenciais do Blob
// (Bearer com escopo `content:write`). /api/* com Bearer já passa pelo middleware.
export function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireCtx();
    requireScope(ctx, 'content:write');
    return images.renderContentImage(await body(req), ctx, contentImageDeps());
  });
}
