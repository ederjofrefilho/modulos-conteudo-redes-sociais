import { NextResponse } from 'next/server';
import { posts } from '@app/content';
import { assertRateLimit, RateLimitError } from '@app/core';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Publica os posts de conteúdo agendados vencidos. Mesmo molde de
 * `/api/cron/send-scheduled`: rate limit por IP ANTES de comparar o
 * CRON_SECRET, precisa rodar a cada ~15min (não 1x/dia) — então usa o mesmo
 * agendador externo já necessário para o sync de IMAP (cron-job.org / GitHub
 * Actions), não o cron nativo da Vercel Hobby. O middleware já libera
 * `/api/cron` inteiro do gate de sessão.
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

  const result = await posts.publishDueScheduled({ max: 25 });
  return NextResponse.json(result);
}
