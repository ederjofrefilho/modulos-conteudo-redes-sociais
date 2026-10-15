import { images } from '@app/content';
import { requireScope } from '@app/core';
import { body, handle } from '@/lib/api';
import { requireCtx } from '@/lib/session';
import { contentImageDeps } from '@/lib/content-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Importa uma imagem por URL pública para a biblioteca de conteúdo (baixa,
// valida tipo/tamanho/destino, converte para JPEG se `target: "social"`).
// Usada pela tool MCP `import_content_image` (Bearer `content:write`).
export function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireCtx();
    requireScope(ctx, 'content:write');
    return images.importContentImage(await body(req), ctx, contentImageDeps());
  });
}
