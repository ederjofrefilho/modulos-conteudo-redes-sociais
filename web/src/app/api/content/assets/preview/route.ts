import { images } from '@app/content';
import { requireScope } from '@app/core';
import { body, handle } from '@/lib/api';
import { requireCtx } from '@/lib/session';
import { contentImageDeps } from '@/lib/content-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Prévia de um modelo de imagem: devolve o JPEG direto, sem salvar nada
// (tela "Gerar imagem"). Erros seguem o formato JSON das demais rotas.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx();
    requireScope(ctx, 'content:write');
    const jpeg = await images.previewContentImage(await body(req), contentImageDeps());
    return new Response(Buffer.from(jpeg.bytes), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return handle(async () => {
      throw err;
    });
  }
}
