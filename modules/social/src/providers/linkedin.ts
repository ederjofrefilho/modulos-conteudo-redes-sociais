import {
  SocialPublishError,
  type PublishInput,
  type PublishResult,
  type SocialProviderAdapter,
} from './types.js';
import {
  linkedinApiVersion,
  linkedinAuthorUrn,
  linkedinPostUrl,
  toLittleText,
} from './linkedin-text.js';
import { documentTitleFor, imagesToPdf } from './linkedin-pdf.js';

// Adaptador do LinkedIn (Etapa 3 de docs/PLANO-REDES-SOCIAIS.md), conferido
// contra a documentação oficial em 10/10/2026 (li-lms-2026-09):
// - OAuth 2.0 + "Sign In with LinkedIn using OpenID Connect" para descobrir
//   o autor (`sub` do /v2/userinfo) e "Share on LinkedIn" para publicar.
// - Imagens: Images API (initializeUpload → PUT do binário → urn:li:image).
// - Post: Posts API, uma imagem em `content.media`, link em
//   `content.article` (a API NÃO raspa o link: título, descrição e miniatura
//   vêm de quem publica).
// - 2 ou mais imagens viram UM documento PDF (Documents API:
//   initializeUpload → PUT → espera AVAILABLE), publicado em `content.media`
//   com título: o feed mostra como carrossel deslizável. `multiImage` (a
//   grade) não é mais usado, decisão de produto, em 10/10/2026.
// - Vídeo (14/10/2026): Videos API (initializeUpload com o tamanho → PUT de
//   cada parte de ~4 MB, guardando o ETag → finalizeUpload → espera
//   AVAILABLE), publicado em `content.media` com título. Processar leva de
//   segundos a minutos: ainda processando = volta à fila (`retryLater`) e o
//   próximo cron publica com o mesmo urn.
// Sem refresh token fora do programa de parceiros: o acesso dura ~60 dias e
// depois é preciso reconectar.

export const LINKEDIN_SCOPES = ['openid', 'profile', 'w_member_social'] as const;

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const REST = 'https://api.linkedin.com/rest';

type FetchLike = typeof fetch;

export interface LinkedinCredentials {
  clientId: string;
  clientSecret: string;
}

/** Credenciais do app (envs). Null = integração não configurada neste ambiente. */
export function linkedinCredentials(
  env: NodeJS.ProcessEnv = process.env,
): LinkedinCredentials | null {
  const clientId = env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = env.LINKEDIN_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * App que conecta as Páginas de empresa. O LinkedIn costuma exigir que a
 * Community Management API fique sozinha num app, sem "Share on LinkedIn" nem
 * "Sign In with LinkedIn" — então ela pode morar num segundo app
 * (`LINKEDIN_PAGES_CLIENT_ID`/`_SECRET`). Sem essas duas, é o app de sempre.
 * `separate` diz qual dos dois casos: com app próprio não há OpenID nem
 * permissão de publicar no perfil, só as de Página.
 */
export function linkedinPagesCredentials(
  env: NodeJS.ProcessEnv = process.env,
): (LinkedinCredentials & { separate: boolean }) | null {
  const clientId = env.LINKEDIN_PAGES_CLIENT_ID?.trim();
  const clientSecret = env.LINKEDIN_PAGES_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) return { clientId, clientSecret, separate: true };
  const fallback = linkedinCredentials(env);
  return fallback ? { ...fallback, separate: false } : null;
}

export function linkedinAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  /** Permissões além das de publicar (ex.: leitura de métricas) — só quando o app as tem aprovadas. */
  extraScopes?: readonly string[];
  /** Troca as permissões de base (OpenID + publicar no perfil). `[]` no app só de Páginas. */
  baseScopes?: readonly string[];
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: [...(opts.baseScopes ?? LINKEDIN_SCOPES), ...(opts.extraScopes ?? [])].join(' '),
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface LinkedinToken {
  accessToken: string;
  expiresAt: Date | null;
  scopes: string[];
  /** Só apps com "programmatic refresh tokens" (ex.: Community Management API) recebem. */
  refreshToken?: string | null;
}

/** Troca o `code` do callback pelo token. Erros já saem com mensagem para a tela. */
export async function exchangeLinkedinCode(
  opts: LinkedinCredentials & { code: string; redirectUri: string; now?: Date },
  fetchImpl: FetchLike = fetch,
): Promise<LinkedinToken> {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
    }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body.access_token !== 'string') {
    const detail =
      typeof body.error_description === 'string' ? body.error_description : `HTTP ${res.status}`;
    throw new SocialPublishError(`O LinkedIn não liberou o acesso: ${detail}`);
  }
  return parseLinkedinToken(body, opts.now ?? new Date());
}

function parseLinkedinToken(body: Record<string, unknown>, now: Date): LinkedinToken {
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : null;
  return {
    accessToken: String(body.access_token),
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
    expiresAt: expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null,
    scopes:
      typeof body.scope === 'string'
        ? body.scope.split(/[\s,]+/).filter(Boolean)
        : [...LINKEDIN_SCOPES],
  };
}

/** Renova com o refresh token (grant_type=refresh_token). Erros já com mensagem para a tela. */
export async function refreshLinkedinToken(
  opts: LinkedinCredentials & { refreshToken: string; now?: Date },
  fetchImpl: FetchLike = fetch,
): Promise<LinkedinToken> {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
    }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body.access_token !== 'string') {
    const detail = typeof body.error_description === 'string' ? body.error_description : `HTTP ${res.status}`;
    throw new SocialPublishError(`O LinkedIn não renovou o acesso: ${detail}`);
  }
  const token = parseLinkedinToken(body, opts.now ?? new Date());
  // O LinkedIn pode não devolver um refresh novo: o antigo continua a valer.
  return { ...token, refreshToken: token.refreshToken ?? opts.refreshToken };
}

export interface LinkedinProfile {
  sub: string;
  name: string;
  picture: string | null;
}

export async function fetchLinkedinProfile(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<LinkedinProfile> {
  const res = await fetchImpl(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body.sub !== 'string') {
    throw new SocialPublishError(`Não foi possível ler o perfil do LinkedIn (HTTP ${res.status}).`);
  }
  const name =
    (typeof body.name === 'string' && body.name.trim()) ||
    [body.given_name, body.family_name]
      .filter((p) => typeof p === 'string')
      .join(' ')
      .trim() ||
    'Perfil do LinkedIn';
  return { sub: body.sub, name, picture: typeof body.picture === 'string' ? body.picture : null };
}

/** Mapeia a resposta de erro da API para uma mensagem legível (e se a conta deve ser desativada). */
export async function linkedinError(
  res: Response,
  step: string,
  providerState?: Record<string, unknown>,
): Promise<SocialPublishError> {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  const detail = body && typeof body.message === 'string' ? body.message.slice(0, 300) : null;
  if (res.status === 401) {
    return new SocialPublishError(
      'O acesso ao LinkedIn expirou ou foi revogado — reconecte em /settings/social.',
      {
        providerState,
        deactivateAccount: true,
      },
    );
  }
  if (res.status === 403) {
    return new SocialPublishError(
      `O LinkedIn recusou ${step} por falta de permissão${detail ? ` (${detail})` : ''}. Confira se o app tem "Share on LinkedIn" e reconecte.`,
      { providerState },
    );
  }
  if (res.status === 429) {
    return new SocialPublishError(
      'O LinkedIn limitou as chamadas deste app por agora. Tente de novo mais tarde.',
      { providerState },
    );
  }
  return new SocialPublishError(
    `O LinkedIn recusou ${step} (HTTP ${res.status})${detail ? `: ${detail}` : '.'}`,
    { providerState },
  );
}

type ImageMap = Record<string, string>;

function readImageMap(state: Record<string, unknown> | null): ImageMap {
  const raw = state?.linkedinImages;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as ImageMap) } : {};
}

/**
 * Documento já enviado numa tentativa anterior. Só vale para as MESMAS
 * imagens na mesma ordem (`key`): editar o carrossel depois de uma falha
 * gera um PDF novo em vez de publicar o antigo.
 */
interface DocumentState {
  key: string;
  urn: string;
}

function readDocument(state: Record<string, unknown> | null): DocumentState | null {
  const raw = state?.linkedinDocument as Partial<DocumentState> | undefined;
  return raw && typeof raw.key === 'string' && typeof raw.urn === 'string'
    ? { key: raw.key, urn: raw.urn }
    : null;
}

/** Vídeo já enviado e finalizado numa tentativa anterior (`key` = id do asset). */
function readVideo(state: Record<string, unknown> | null): DocumentState | null {
  const raw = state?.linkedinVideo as Partial<DocumentState> | undefined;
  return raw && typeof raw.key === 'string' && typeof raw.urn === 'string' ? { key: raw.key, urn: raw.urn } : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `fetchImpl` só nos testes. Sem ele, resolve `globalThis.fetch` a cada
 * chamada (não na criação), para o registro do módulo não prender uma
 * referência antiga.
 */
export function createLinkedinProvider(
  fetchImpl?: FetchLike,
  // O documento é processado antes de poder ir num post: até 10 consultas de
  // 2 s, cabe com folga nos 60 s do cron.
  opts: { pollDelayMs?: number; pollAttempts?: number } = {},
): SocialProviderAdapter {
  const doFetch: FetchLike = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const pollDelayMs = opts.pollDelayMs ?? 2000;
  const pollAttempts = opts.pollAttempts ?? 10;
  return {
    provider: 'LINKEDIN',

    authorizeUrl(state, redirectUri) {
      const creds = linkedinCredentials();
      if (!creds)
        throw new SocialPublishError('LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET não configurados.');
      return linkedinAuthorizeUrl({ clientId: creds.clientId, redirectUri, state });
    },

    async publish(input: PublishInput): Promise<PublishResult> {
      const token = input.account.accessToken;
      if (!token)
        throw new SocialPublishError(
          'A conta do LinkedIn está sem acesso guardado — reconecte em /settings/social.',
        );
      const author = linkedinAuthorUrn(input.account.kind, input.account.externalId);
      const headers = {
        Authorization: `Bearer ${token}`,
        'Linkedin-Version': linkedinApiVersion(),
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
      };

      // Imagens e documento já enviados numa tentativa anterior ficam em
      // providerState e não sobem de novo.
      const images = readImageMap(input.providerState);
      let document = readDocument(input.providerState);
      let video = readVideo(input.providerState);
      const state = (): Record<string, unknown> => ({
        linkedinImages: images,
        ...(document ? { linkedinDocument: document } : {}),
        ...(video ? { linkedinVideo: video } : {}),
      });
      const call = async (url: string, init: RequestInit): Promise<Response> => {
        try {
          return await doFetch(url, init);
        } catch (err) {
          throw new SocialPublishError(
            `Não foi possível falar com o LinkedIn (${(err as Error).message}).`,
            { providerState: state() },
          );
        }
      };
      const download = async (media: { url: string }): Promise<ArrayBuffer> => {
        const file = await call(media.url, {});
        if (!file.ok)
          throw new SocialPublishError(
            `Não foi possível baixar o arquivo da biblioteca (HTTP ${file.status}).`,
            { providerState: state() },
          );
        return file.arrayBuffer();
      };
      const uploadImage = async (media: {
        id: string;
        url: string;
        mimeType: string;
      }): Promise<string> => {
        if (images[media.id]) return images[media.id]!;
        const bytes = await download(media);
        const init = await call(`${REST}/images?action=initializeUpload`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
        });
        if (!init.ok) throw await linkedinError(init, 'o envio da imagem', state());
        const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };
        const put = await call(value.uploadUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': media.mimeType || 'application/octet-stream',
          },
          body: bytes,
        });
        if (!put.ok) throw await linkedinError(put, 'o upload da imagem', state());
        images[media.id] = value.image;
        return value.image;
      };

      const uploadDocument = async (): Promise<string> => {
        const key = input.media.map((m) => m.id).join(',');
        if (document?.key === key) return document.urn;
        document = null;
        const pages = [];
        for (const m of input.media)
          pages.push({ bytes: new Uint8Array(await download(m)), mimeType: m.mimeType });
        let pdf: Uint8Array;
        try {
          pdf = await imagesToPdf(pages, documentTitle);
        } catch (err) {
          throw new SocialPublishError(
            `Não foi possível montar o PDF do carrossel: ${(err as Error).message}`,
            { providerState: state() },
          );
        }
        const init = await call(`${REST}/documents?action=initializeUpload`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
        });
        if (!init.ok) throw await linkedinError(init, 'o envio do PDF', state());
        const { value } = (await init.json()) as {
          value: { uploadUrl: string; document: string };
        };
        const put = await call(value.uploadUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
          body: new Uint8Array(pdf),
        });
        if (!put.ok) throw await linkedinError(put, 'o upload do PDF', state());
        document = { key, urn: value.document };
        return value.document;
      };

      // O documento só entra num post depois de processado (AVAILABLE).
      // Ainda processando ao fim da espera = falha que guarda o urn: "Tentar
      // de novo" reaproveita o mesmo PDF em vez de subir outro.
      const waitDocument = async (urn: string): Promise<void> => {
        for (let attempt = 0; attempt < pollAttempts; attempt++) {
          const res = await call(`${REST}/documents/${encodeURIComponent(urn)}`, { headers });
          if (!res.ok) throw await linkedinError(res, 'a consulta do PDF', state());
          const { status } = (await res.json()) as { status?: string };
          if (status === 'AVAILABLE') return;
          if (status === 'PROCESSING_FAILED') {
            document = null;
            throw new SocialPublishError(
              'O LinkedIn não conseguiu processar o PDF do carrossel. Tente de novo; se repetir, confira as imagens.',
              { providerState: state() },
            );
          }
          if (attempt < pollAttempts - 1) await sleep(pollDelayMs);
        }
        throw new SocialPublishError(
          'O LinkedIn ainda está processando o PDF do carrossel. Tente de novo em alguns minutos.',
          { providerState: state() },
        );
      };
      const uploadVideo = async (media: PublishInput['media'][number]): Promise<string> => {
        if (video?.key === media.id) return video.urn;
        video = null;
        const bytes = new Uint8Array(await download(media));
        const init = await call(`${REST}/videos?action=initializeUpload`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            initializeUploadRequest: {
              owner: author,
              fileSizeBytes: bytes.byteLength,
              uploadCaptions: false,
              uploadThumbnail: false,
            },
          }),
        });
        if (!init.ok) throw await linkedinError(init, 'o envio do vídeo', state());
        const { value } = (await init.json()) as {
          value: {
            video: string;
            uploadToken?: string;
            uploadInstructions: Array<{ uploadUrl: string; firstByte: number; lastByte: number }>;
          };
        };
        // Cada parte devolve um ETag; o finalize precisa de todos, na ordem.
        const etags: string[] = [];
        for (const part of value.uploadInstructions) {
          const put = await call(part.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: bytes.slice(part.firstByte, part.lastByte + 1),
          });
          if (!put.ok) throw await linkedinError(put, 'o upload do vídeo', state());
          const etag = put.headers.get('etag');
          if (!etag)
            throw new SocialPublishError('O LinkedIn recebeu uma parte do vídeo mas não confirmou o envio (sem ETag). Tente de novo.', {
              providerState: state(),
            });
          etags.push(etag);
        }
        const fin = await call(`${REST}/videos?action=finalizeUpload`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            finalizeUploadRequest: { video: value.video, uploadToken: value.uploadToken ?? '', uploadedPartIds: etags },
          }),
        });
        if (!fin.ok) throw await linkedinError(fin, 'a finalização do vídeo', state());
        video = { key: media.id, urn: value.video };
        return value.video;
      };

      const waitVideo = async (urn: string): Promise<void> => {
        for (let attempt = 0; attempt < pollAttempts; attempt++) {
          const res = await call(`${REST}/videos/${encodeURIComponent(urn)}`, { headers });
          if (!res.ok) throw await linkedinError(res, 'a consulta do vídeo', state());
          const { status } = (await res.json()) as { status?: string };
          if (status === 'AVAILABLE') return;
          if (status === 'PROCESSING_FAILED') {
            video = null;
            throw new SocialPublishError(
              'O LinkedIn não conseguiu processar o vídeo. Confira se é um MP4 (H.264) de 3 s a 30 min e tente de novo.',
              { providerState: state() },
            );
          }
          if (attempt < pollAttempts - 1) await sleep(pollDelayMs);
        }
        throw new SocialPublishError(
          'O LinkedIn ainda está processando o vídeo. O CRM publica sozinho assim que ficar pronto.',
          { providerState: state(), retryLater: true },
        );
      };

      const documentTitle = documentTitleFor(input.text, input.documentTitle);

      let content: Record<string, unknown> | undefined;
      if (input.media.length === 1 && input.media[0]!.mimeType.startsWith('video/')) {
        const urn = await uploadVideo(input.media[0]!);
        await waitVideo(urn);
        content = { media: { id: urn, title: documentTitle } };
      } else if (input.media.length === 1) {
        const m = input.media[0]!;
        content = { media: { id: await uploadImage(m), altText: m.alt } };
      } else if (input.media.length > 1) {
        const urn = await uploadDocument();
        await waitDocument(urn);
        content = { media: { id: urn, title: documentTitle } };
      } else if (input.linkUrl) {
        const preview = input.linkPreview;
        const article: Record<string, unknown> = {
          source: input.linkUrl,
          title: preview?.title || new URL(input.linkUrl).hostname,
        };
        if (preview?.description) article.description = preview.description;
        if (preview?.thumbnail) article.thumbnail = await uploadImage(preview.thumbnail);
        content = { article };
      }

      const res = await call(`${REST}/posts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          author,
          commentary: toLittleText(input.text),
          visibility: 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          ...(content ? { content } : {}),
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        }),
      });
      if (!res.ok) throw await linkedinError(res, 'a publicação', state());
      const urn = res.headers.get('x-restli-id');
      if (!urn) {
        throw new SocialPublishError(
          'O LinkedIn aceitou a publicação mas não devolveu o id do post. Confira no perfil antes de tentar de novo.',
          { providerState: state() },
        );
      }
      return {
        externalId: urn,
        externalUrl: linkedinPostUrl(urn),
        providerState: state(),
      };
    },
  };
}
