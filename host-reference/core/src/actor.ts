import { UserRole } from '@app/db';
import { ForbiddenError } from './common.js';

/** Quem está executando a ação (usuário logado). */
export interface Actor {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

/**
 * Contexto de execução passado a todo serviço que escreve ou filtra por
 * dono. `scopes` só existe quando o Ctx veio de um ApiToken (Bearer) — ver
 * `resolveCtxFromToken` em `api-tokens.ts`. `undefined` (sessão de
 * navegador) significa "sem restrição de escopo", nunca "sem acesso"; um
 * array presente é a lista exata do que o token pode alcançar (`["*"]` =
 * tudo que `requireCtx()` protege, igual a todo token de antes desta
 * distinção existir).
 */
export interface Ctx {
  actor: Actor;
  scopes?: string[];
  /**
   * De onde veio a ação — vai para `Event.source` (ver events.ts). Ausente =
   * "crm" (UI/API REST); o servidor MCP marca "mcp", e as rotas que o
   * site institucional chama marcam "site".
   */
  source?: string;
}

export function isAdmin(ctx: Ctx): boolean {
  return ctx.actor.role === UserRole.ADMIN;
}

/** Lança ForbiddenError se o ator não for ADMIN. */
export function requireAdmin(ctx: Ctx): void {
  if (!isAdmin(ctx)) throw new ForbiddenError();
}

/**
 * Lança ForbiddenError se o Ctx tiver escopo restrito E `scope` não estiver
 * nele. Sessão de navegador (`ctx.scopes` ausente) sempre passa — escopo é
 * uma restrição de ApiToken, não uma permissão que sessão precisa ganhar.
 */
export function requireScope(ctx: Ctx, scope: string): void {
  if (!ctx.scopes) return;
  if (ctx.scopes.includes('*') || ctx.scopes.includes(scope)) return;
  throw new ForbiddenError(`Este token não tem o escopo "${scope}".`);
}
