import { videos } from '@app/content';
import { requireScope } from '@app/core';
import { body, handle } from '@/lib/api';
import { requireCtx } from '@/lib/session';
import { isOwnBlobUrl } from '@/lib/content-videos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Regista um vídeo que o MCP local já subiu direto ao Blob (token de
// `/api/content/assets/upload`). Tool MCP `upload_content_video`.
export function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireCtx();
    requireScope(ctx, 'content:write');
    const input = (await body(req)) as { url?: string };
    const own = await isOwnBlobUrl(String(input?.url ?? ''));
    return videos.registerUploadedVideo(input, ctx, { blobHost: () => own });
  });
}
