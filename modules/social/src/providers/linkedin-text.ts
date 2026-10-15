// Funções puras do adaptador do LinkedIn — sem rede, sem Prisma, testáveis.

// Reservados do formato "little text" do campo `commentary` da Posts API.
// A documentação exige escapar TODOS com barra invertida, mesmo fora de um
// elemento: sem isso o texto é cortado no primeiro caractere reservado ou a
// API recusa o post (docs "Little Text Format", li-lms-2026-09).
const RESERVED = /[|{}@[\]()<>#\\*_~]/g;

function escapePlain(text: string): string {
  return text.replace(RESERVED, (c) => `\\${c}`);
}

// Hashtag: "#" seguido de letras/dígitos/_ (inclui acentos — "#gestão").
// Precedido de início, espaço ou pontuação, para não pegar "C#" nem âncoras.
const HASHTAG = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;

/**
 * Converte o texto que o Claude escreveu (texto puro, como no feed) para o
 * "little text" do LinkedIn. Hashtags viram o template `{hashtag|\#|tag}` —
 * escapar o "#" sem isso faria a hashtag aparecer como texto, sem link.
 * Menções com "@" não são suportadas (precisariam do URN da pessoa) e saem
 * como texto literal.
 */
export function toLittleText(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(HASHTAG)) {
    const start = m.index! + m[1]!.length;
    out += escapePlain(text.slice(last, start));
    out += `{hashtag|\\#|${escapePlain(m[2]!)}}`;
    last = start + 1 + m[2]!.length;
  }
  return out + escapePlain(text.slice(last));
}

/**
 * Versão da API (`Linkedin-Version`, AAAAMM). Cada versão vive ~12 meses e
 * uma versão nova sai todo mês; usar o mês de dois meses atrás garante uma
 * versão já publicada e longe do fim do suporte, sem ninguém precisar lembrar
 * de atualizar uma constante. `LINKEDIN_API_VERSION` força um valor.
 */
export function linkedinApiVersion(now = new Date(), env: NodeJS.ProcessEnv = process.env): string {
  const forced = env.LINKEDIN_API_VERSION?.trim();
  if (forced && /^\d{6}$/.test(forced)) return forced;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Autor do post: perfil pessoal (`sub` do OpenID) ou página (id da organização). */
export function linkedinAuthorUrn(kind: 'PERSON' | 'ORGANIZATION', externalId: string): string {
  return kind === 'ORGANIZATION'
    ? `urn:li:organization:${externalId}`
    : `urn:li:person:${externalId}`;
}

/** Link público do post a partir da URN devolvida em `x-restli-id`. */
export function linkedinPostUrl(urn: string): string {
  return `https://www.linkedin.com/feed/update/${urn}/`;
}
