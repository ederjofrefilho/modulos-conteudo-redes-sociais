import { z } from 'zod';

/** Parâmetros comuns de listagem (busca textual + paginação). */
export const listParamsSchema = z.object({
  q: z.string().trim().optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListParams = z.infer<typeof listParamsSchema>;

/** Entrada de listagem antes da coerção (aceita strings vindas de query params). */
export interface ListParamsInput {
  q?: string;
  skip?: number | string;
  take?: number | string;
}

/**
 * Data que aceita string ISO / número / Date na ENTRADA e produz Date na saída.
 * (z.coerce.date coage em runtime mas ainda tipa a entrada como Date; preprocess
 * deixa o tipo de entrada flexível, ideal para JSON vindo da API/MCP.)
 */
export const dateInput = z.preprocess(
  (v) => (typeof v === 'string' || typeof v === 'number' ? new Date(v) : v),
  z.date(),
);

export interface Paginated<T> {
  items: T[];
  total: number;
  skip: number;
  take: number;
}

/** Erro de domínio: recurso não encontrado (mapeado para 404 na API). */
export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} não encontrado: ${id}`);
    this.name = 'NotFoundError';
  }
}

/** Erro de validação de entrada (mapeado para 400 na API). */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues?: unknown,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Ação restrita (ex.: só ADMIN) — mapeada para 403 na API. */
export class ForbiddenError extends Error {
  constructor(message = 'Ação restrita a administradores.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** Sem sessão válida — mapeada para 401 na API. */
export class UnauthorizedError extends Error {
  constructor(message = 'Não autenticado.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** Limite de requisições excedido (Bearer/cron) — mapeada para 429 na API. */
export class RateLimitError extends Error {
  constructor(message = 'Muitas requisições. Tente novamente em instantes.') {
    super(message);
    this.name = 'RateLimitError';
  }
}

/** Converte Decimal (Prisma) para number serializável; null-safe. */
export function decimalToNumber(value: { toString(): string } | null | undefined): number | null {
  if (value == null) return null;
  return Number(value.toString());
}
