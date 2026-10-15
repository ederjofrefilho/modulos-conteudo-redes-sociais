import { prisma } from '@app/db';
import { RateLimitError } from './common.js';

/**
 * Rate limit de janela fixa, persistido em Postgres (sem Redis/KV — Vercel
 * Hobby não tem). Um único UPSERT atômico decide reset-de-janela vs.
 * incremento, então é seguro sob concorrência (duas requests simultâneas não
 * pisam uma na outra como pisariam com um read-then-write em JS).
 *
 * Existe para proteger as rotas que não passam pelo gate otimista de sessão
 * do middleware (Bearer de ApiToken em qualquer /api/*, e o CRON_SECRET do
 * sync de caixas) — são os caminhos mais expostos a um script tentando
 * adivinhar um segredo ou martelando a rota.
 */
export async function assertRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<void> {
  const cutoff = new Date(Date.now() - opts.windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" (key, "windowStart", count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimit"."windowStart" < ${cutoff} THEN 1 ELSE "RateLimit".count + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < ${cutoff} THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING count
  `;
  const count = Number(rows[0]?.count ?? 1);
  if (count > opts.limit) throw new RateLimitError();
}
