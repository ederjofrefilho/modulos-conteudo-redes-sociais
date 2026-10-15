import { NotFoundError, ValidationError, ForbiddenError, UnauthorizedError } from '@app/core';

/** Resultado padrão de uma server action de formulário. */
export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  /** Erros por campo — vem de ValidationError.issues (zod .flatten().fieldErrors). */
  fieldErrors?: Record<string, string[] | undefined>;
  data?: T;
}

/**
 * Converte um erro capturado numa server action em ActionResult. `ValidationError`
 * mantém os issues do zod por campo (antes descartados, daí o banner genérico
 * "Dados inválidos" sem indicar qual campo); erros desconhecidos relançam —
 * NEXT_REDIRECT é um erro do Next e precisa propagar, não virar { ok: false }.
 */
export function toActionResult(err: unknown): ActionResult<never> {
  if (err instanceof ValidationError) {
    const issues = err.issues as { fieldErrors?: Record<string, string[]> } | undefined;
    return { ok: false, error: err.message, fieldErrors: issues?.fieldErrors };
  }
  if (err instanceof NotFoundError || err instanceof ForbiddenError || err instanceof UnauthorizedError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
  if (err && typeof err === 'object' && 'digest' in err) throw err; // NEXT_REDIRECT/NEXT_NOT_FOUND
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}
