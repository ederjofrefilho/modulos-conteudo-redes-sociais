import { NextResponse } from 'next/server';
import { publishDueSocialPosts, refreshExpiringInstagramTokens, refreshExpiringLinkedinTokens, socialAccounts } from '@app/social';
import { assertRateLimit, RateLimitError } from '@app/core';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Publica os posts de rede social APROVADOS e vencidos, em série (mesmo molde
 * de `/api/cron/publish-scheduled`: rate limit por IP antes do CRON_SECRET,
 * chamado a cada ~5 min pelo `cron-email.yml`). Só publica de verdade com
 * SOCIAL_PUBLISH=live; fora disso, simula. Antes, renova os tokens do
 * Instagram perto de vencer e desativa contas com acesso já vencido.
 * O middleware já libera `/api/cron` inteiro.
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

  // Renovar vem antes de desativar: um token do Instagram a 9 dias do fim
  // ganha mais 60 em vez de morrer.
  const instagramRefresh = await refreshExpiringInstagramTokens();
  // LinkedIn só renova quando a rede deu refresh token (apps com "programmatic refresh").
  const linkedinRefresh = await refreshExpiringLinkedinTokens();
  // O que não renovou avisa no sino uma semana antes (uma vez por validade).
  const expiryNotified = await socialAccounts.notifyExpiringAccounts();
  // Depois marca contas com acesso vencido (a tela para de dizer "Ativa");
  // os posts aprovados para elas falham com "reconecte" em vez de erro da API.
  const expiredAccounts = await socialAccounts.deactivateExpiredAccounts();
  const result = await publishDueSocialPosts({ max: 10 });
  return NextResponse.json({ ...result, expiredAccounts, instagramRefresh, linkedinRefresh, expiryNotified });
}
