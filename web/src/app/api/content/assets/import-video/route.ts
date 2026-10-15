import { videos } from '@app/content';
import { requireScope } from '@app/core';
import { body, handle } from '@/lib/api';
import { requireCtx } from '@/lib/session';
import { videoStorage } from '@/lib/content-videos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Baixar até 200 MB e reenviar ao Blob em partes.
export const maxDuration = 60;

// Importa um vídeo MP4 por URL pública para a biblioteca de conteúdo (mede
// largura, altura e duração no servidor). Tool MCP `import_content_video`.
export function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireCtx();
    requireScope(ctx, 'content:write');
    return videos.importContentVideo(await body(req), ctx, { storage: videoStorage });
  });
}
