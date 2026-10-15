import type { SocialProviderName } from '../rules.js';
import type { SocialProviderAdapter } from './types.js';

import { createInstagramProvider } from './instagram.js';
import { createLinkedinProvider } from './linkedin.js';

// Adaptadores reais registrados por rede. LinkedIn e Instagram só usam
// `fetch`, então nascem registrados (vale para cron, tela e MCP sem montagem
// extra). Rede nova sem adaptador, com SOCIAL_PUBLISH=live, falha com
// mensagem clara em vez de fingir que publicou.
const registry = new Map<SocialProviderName, SocialProviderAdapter>([
  ['LINKEDIN', createLinkedinProvider()],
  ['INSTAGRAM', createInstagramProvider()],
]);

export function registerProvider(adapter: SocialProviderAdapter): void {
  registry.set(adapter.provider, adapter);
}

export function getProvider(provider: SocialProviderName): SocialProviderAdapter | null {
  return registry.get(provider) ?? null;
}

export type PublishMode = 'log' | 'live';

/** Só `SOCIAL_PUBLISH=live` publica de verdade; qualquer outro valor (ou nada) simula. */
export function publishMode(env: NodeJS.ProcessEnv = process.env): PublishMode {
  return env.SOCIAL_PUBLISH?.trim().toLowerCase() === 'live' ? 'live' : 'log';
}
