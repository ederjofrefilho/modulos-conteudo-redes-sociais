import type { SocialProviderName } from '../rules.js';
import type { PostMetrics } from './engagement.js';

// Fronteira de LEITURA com cada rede (a de publicação é providers/types.ts).
// Só APIs oficiais; nada de raspar página. Cada adaptador diz o que conseguiu
// e o que ficou de fora por falta de permissão — a tela mostra isso em vez de
// fingir zeros.

export interface MetricsAccount {
  id: string;
  provider: SocialProviderName;
  kind: 'PERSON' | 'ORGANIZATION';
  externalId: string;
  scopes: string[];
  /** Token decifrado, só em memória durante a chamada. */
  accessToken: string;
}

export interface PostMetricsResult {
  metrics: PostMetrics;
  /** Resposta crua (sem token) para auditoria. */
  raw: Record<string, unknown>;
  /** Aviso legível quando parte das métricas depende de permissão que a conta não tem. */
  note?: string;
}

export interface AccountMetricsResult {
  followers: number | null;
  raw: Record<string, unknown>;
  note?: string;
}

export type MetricsErrorKind = 'permission' | 'rate' | 'auth' | 'gone' | 'other';

/** Erro de recolha com mensagem pronta para a tela. `rate` faz o job parar esta rede até a próxima passada. */
export class SocialMetricsError extends Error {
  constructor(
    message: string,
    readonly kind: MetricsErrorKind = 'other',
  ) {
    super(message);
    this.name = 'SocialMetricsError';
  }
}

export interface SocialMetricsAdapter {
  provider: SocialProviderName;
  /** Permissões que faltam à conta para métricas completas (vazio = tem tudo). */
  missingScopes(account: Pick<MetricsAccount, 'kind' | 'scopes'>): string[];
  fetchPostMetrics(account: MetricsAccount, post: { externalId: string }): Promise<PostMetricsResult>;
  fetchAccountMetrics(account: MetricsAccount): Promise<AccountMetricsResult>;
}

type FetchLike = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `fetch` com novas tentativas para falha transitória (rede, 5xx): até
 * `retries` vezes, com espera crescente. 429 NÃO é repetido aqui — quem chama
 * transforma em erro `rate` e o job larga a rede até à próxima passada.
 */
export async function fetchWithRetry(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit | undefined,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 400;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, init);
      if (res.status < 500 || attempt === retries) return res;
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
    }
    await sleep(delayMs * (attempt + 1));
  }
  throw new SocialMetricsError(
    `A rede não respondeu (${lastError instanceof Error ? lastError.message : 'falha de ligação'}).`,
  );
}
