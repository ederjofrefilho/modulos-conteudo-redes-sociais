import { cache } from 'react';
import { headers } from 'next/headers';
import { users, apiTokens, assertRateLimit, UnauthorizedError, type Ctx } from '@app/core';
import { auth } from './auth/config.js';

// Generoso o bastante para uma integração legítima martelando a API, apertado
// o bastante para tornar inviável adivinhar um token de 32 bytes por força bruta.
const BEARER_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

/**
 * Ctx da requisição atual, ou null. Dois caminhos, nessa ordem:
 * 1. `Authorization: Bearer <token>` (Fase 8) — resolve via ApiToken. Existe
 *    para o dia em que algo além do navegador (MCP remoto, integração
 *    externa) precisar chamar as rotas sem sessão de navegador.
 * 2. Sessão Auth.js (cookie). O cookie (JWT) só diz *quem alega ser*; a
 *    autorização sai do banco: papel e nome vêm frescos a cada request e o
 *    `tokenVersion` é conferido, então senha trocada, "sair de todos os
 *    dispositivos" e usuário desativado tiram o acesso no request seguinte.
 *
 * Envolvida em `cache()` (React) — dezenas de layouts/páginas chamam
 * `getCtx`/`requireCtx` independentemente na mesma árvore de uma única
 * requisição (ex.: `settings/layout.tsx` E a page dentro dele), e sem isso
 * cada uma disparava sua própria consulta de sessão. `cache()` memoiza pelo
 * ESCOPO DA REQUISIÇÃO (não entre requisições — cada navegação recalcula do
 * zero), então continua tão fresco quanto antes, só sem repetir trabalho.
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const bearerCtx = await getCtxFromBearerToken();
  if (bearerCtx) return bearerCtx;

  const session = await auth();
  if (!session?.user?.id) return null;
  const actor = await users.getSessionActor(session.user.id, session.user.tokenVersion);
  return actor ? { actor } : null;
});

async function getCtxFromBearerToken(): Promise<Ctx | null> {
  const hdrs = await headers();
  const authHeader = hdrs.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  // Por IP, não pelo token em si — um script adivinhando tokens ao acaso teria
  // um contador zerado a cada tentativa se a chave fosse o próprio token.
  const ip = clientIp(hdrs);
  await assertRateLimit(`bearer-ip:${ip}`, BEARER_RATE_LIMIT);

  return apiTokens.resolveCtxFromToken(token);
}

function clientIp(hdrs: Headers): string {
  return hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown';
}

/** Ctx obrigatório — lança UnauthorizedError se não houver sessão nem token válido (server actions/API). */
export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}
