import type { PublishInput, PublishResult } from './types.js';

/**
 * `SOCIAL_PUBLISH=log` (padrão fora de produção, mesmo espírito do
 * `SENDER=log`): registra o que seria enviado e devolve um id de simulação,
 * sem chamar a rede. O log nunca leva o token.
 */
export async function publishSimulated(input: PublishInput): Promise<PublishResult> {
  console.info(
    `[social] SIMULAÇÃO (SOCIAL_PUBLISH=log) — ${input.account.provider} ${input.account.externalId}: ` +
      `${input.text.length} caractere(s), ${input.media.length} imagem(ns)` +
      (input.linkUrl ? `, link ${input.linkUrl}` : ''),
  );
  return { externalId: `simulated:${input.postId}`, externalUrl: null, simulated: true };
}
