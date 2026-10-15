import { NextResponse } from 'next/server';
import { collectSocialMetrics, importDueAccounts } from '@app/social';
import { ensureSocialMediaStore } from '@/lib/social-media-store';
import { assertRateLimit, RateLimitError } from '@app/core';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Recolhe as métricas dos posts publicados e os seguidores das contas, e
 * guarda um snapshot datado de cada (mesmo molde de `/api/cron/publish-social`:
 * limite por IP antes do CRON_SECRET; o middleware já libera `/api/cron`).
 * A cadência por idade do post é decidida no serviço, por isso chamar isto de
 * 5 em 5 minutos ou uma vez por dia dá o mesmo resultado, só mais cedo ou mais
 * tarde. Só lê das redes: nunca publica, edita ou apaga nada.
 */
export async function GET(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  try {
    await assertRateLimit(`cron-ip:${ip}`, { limit: 10, windowMs: 60_000 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // Publicações da rede (inclusive as feitas fora do CRM, contas com a sincronização ligada,
  // a cada ~3 h) entram antes da recolha, com cópia da media no Blob.
  ensureSocialMediaStore();
  const imported = await importDueAccounts().catch((err) => {
    console.error('[social] falha a importar posts externos:', err);
    return [];
  });
  const result = await collectSocialMetrics({ max: 20 });
  return NextResponse.json({ ...result, imported });
}
