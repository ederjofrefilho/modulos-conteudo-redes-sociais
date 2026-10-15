import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // recomendado para GCM
const VERSION = 'v1';

/**
 * Chave de 32 bytes (AES-256) em base64, gerada com `openssl rand -base64 32`.
 * Perder esta chave é irrecuperável: todo segredo já persistido com ela vira
 * lixo — cada usuário precisa reconectar a caixa em /settings/mailbox.
 */
function getKey(): Buffer {
  const b64 = process.env.MAILBOX_ENC_KEY;
  if (!b64) throw new Error('MAILBOX_ENC_KEY não configurada — obrigatória para conectar caixas de e-mail.');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error(`MAILBOX_ENC_KEY precisa decodificar para 32 bytes (tem ${key.length}).`);
  }
  return key;
}

/**
 * Criptografa um segredo (senha da caixa) com AES-256-GCM. `aad` (associated
 * data, não secreta) é vinculada ao ciphertext — usamos o endereço da caixa,
 * o que impede mover um `secretEnc` para a linha de outra caixa e ele ainda
 * decifrar (a tag de autenticação não bate).
 *
 * Formato de saída: "v1.<iv>.<tag>.<ct>" (cada parte em base64). O prefixo de
 * versão existe para que uma futura rotação de algoritmo/chave seja só mais um
 * `case` no decrypt, nunca uma migração de dados forçada.
 */
export function encryptSecret(plaintext: string, aad: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

/** Decifra um segredo gerado por `encryptSecret`. `aad` precisa ser idêntica à usada na cifragem. */
export function decryptSecret(ciphertext: string, aad: string): string {
  const parts = ciphertext.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error(`Formato de segredo desconhecido (esperado "${VERSION}.<iv>.<tag>.<ct>").`);
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64!, 'base64'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64!, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}
