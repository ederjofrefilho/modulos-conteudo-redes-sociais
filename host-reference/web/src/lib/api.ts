import { NextResponse } from 'next/server';
import { NotFoundError, ValidationError, ForbiddenError, UnauthorizedError, RateLimitError } from '@app/core';
import { ZodError } from 'zod';

/** Resposta JSON de sucesso. */
export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Envolve um handler de rota, padronizando o tratamento de erros:
 * - UnauthorizedError -> 401
 * - ForbiddenError -> 403
 * - NotFoundError -> 404
 * - ValidationError / ZodError -> 400
 * - RateLimitError -> 429
 * - demais -> 500
 */
export function handle(fn: () => Promise<unknown>) {
  return (async () => {
    try {
      const data = await fn();
      return ok(data);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return NextResponse.json({ error: err.message }, { status: 401 });
      }
      if (err instanceof ForbiddenError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      if (err instanceof NotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      if (err instanceof RateLimitError) {
        return NextResponse.json({ error: err.message }, { status: 429 });
      }
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message, issues: err.issues }, { status: 400 });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: 'Dados inválidos', issues: err.flatten() }, { status: 400 });
      }
      const message = err instanceof Error ? err.message : 'Erro interno';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  })();
}

/** Lê o corpo JSON de forma segura (retorna {} se vazio/ inválido). */
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Extrai os parâmetros de listagem da querystring. */
export function listQuery(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? undefined;
  const skip = url.searchParams.get('skip') ?? undefined;
  const take = url.searchParams.get('take') ?? undefined;
  return { q, skip, take };
}
