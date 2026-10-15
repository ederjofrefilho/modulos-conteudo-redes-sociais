import {
  SocialPublishError,
  type PublishInput,
  type PublishResult,
  type SocialProviderAdapter,
} from './types.js';

// Adaptador do Instagram (Etapa 4 de docs/PLANO-REDES-SOCIAIS.md), na
// "Instagram API com login do Instagram" — não exige página do Facebook, só
// conta Profissional (Empresa ou Criador). Conferido na documentação oficial
// em 10/10/2026:
// - OAuth em www.instagram.com/oauth/authorize → token curto em
//   api.instagram.com/oauth/access_token → token longo (~60 dias) em
//   graph.instagram.com/access_token, renovável em /refresh_access_token
//   (token com mais de 24 h e ainda válido).
// - Publicar é em duas etapas: container (`POST /{ig-id}/media` com
//   `image_url` público — o Instagram baixa do Blob), esperar
//   `status_code = FINISHED` e `POST /{ig-id}/media_publish`. Carrossel: um
//   container por imagem com `is_carousel_item`, depois um `CAROUSEL` com
//   `children`. Só JPEG.
// - Vídeo (14/10/2026) sai como Reels: um container `media_type=REELS` com
//   `video_url` público e `share_to_feed=true` (aparece também no feed). O
//   Instagram leva de segundos a minutos para processar: ainda processando
//   = volta à fila (`retryLater`) com o container guardado, e o próximo cron
//   publica o mesmo container.

export const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
] as const;

const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const SHORT_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';

type FetchLike = typeof fetch;

export interface InstagramCredentials {
  appId: string;
  appSecret: string;
}

/** Credenciais do app (envs). Null = integração não configurada neste ambiente. */
export function instagramCredentials(
  env: NodeJS.ProcessEnv = process.env,
): InstagramCredentials | null {
  const appId = env.INSTAGRAM_APP_ID?.trim();
  const appSecret = env.INSTAGRAM_APP_SECRET?.trim();
  return appId && appSecret ? { appId, appSecret } : null;
}

/**
 * Versão da Graph API nas chamadas de conteúdo. A documentação usa v25.0 nos
 * exemplos (out/2026); `INSTAGRAM_API_VERSION` troca sem mexer no código.
 */
export function instagramApiVersion(env: NodeJS.ProcessEnv = process.env): string {
  const forced = env.INSTAGRAM_API_VERSION?.trim();
  return forced && /^v\d+\.\d+$/.test(forced) ? forced : 'v25.0';
}

export function instagramAuthorizeUrl(opts: {
  appId: string;
  redirectUri: string;
  state: string;
  /** Permissões além das de publicar (ex.: insights) — só quando o app as tem configuradas. */
  extraScopes?: readonly string[];
}): string {
  const params = new URLSearchParams({
    client_id: opts.appId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: [...INSTAGRAM_SCOPES, ...(opts.extraScopes ?? [])].join(','),
    state: opts.state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type Json = Record<string, unknown>;

async function readJson(res: Response): Promise<Json> {
  return ((await res.json().catch(() => ({}))) ?? {}) as Json;
}

/** Erro da Graph API: `{ error: { message, code } }`. */
function graphError(body: Json): { message: string | null; code: number | null } {
  const err = body.error && typeof body.error === 'object' ? (body.error as Json) : null;
  return {
    message:
      typeof err?.message === 'string'
        ? err.message.slice(0, 300)
        : typeof body.error_message === 'string'
          ? body.error_message
          : null,
    code:
      typeof err?.code === 'number' ? err.code : typeof body.code === 'number' ? body.code : null,
  };
}

export interface InstagramToken {
  accessToken: string;
  expiresAt: Date | null;
}

/**
 * Troca o `code` do callback pelo token curto e, em seguida, pelo longo
 * (~60 dias). Devolve também o id do usuário e as permissões concedidas.
 * A resposta do token curto às vezes vem dentro de `data: [...]` (é como a
 * documentação mostra) e às vezes plana — aceitamos as duas.
 */
export async function exchangeInstagramCode(
  opts: InstagramCredentials & { code: string; redirectUri: string; now?: Date },
  fetchImpl: FetchLike = fetch,
): Promise<InstagramToken & { userId: string | null; permissions: string[] }> {
  // O Instagram às vezes acrescenta "#_" ao código no redirect.
  const code = opts.code.replace(/#_$/, '');
  const res = await fetchImpl(SHORT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: opts.appId,
      client_secret: opts.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: opts.redirectUri,
      code,
    }).toString(),
  });
  const raw = await readJson(res);
  const body =
    Array.isArray(raw.data) && raw.data[0] && typeof raw.data[0] === 'object'
      ? (raw.data[0] as Json)
      : raw;
  if (!res.ok || typeof body.access_token !== 'string') {
    const { message } = graphError(raw);
    throw new SocialPublishError(
      `O Instagram não liberou o acesso: ${message ?? `HTTP ${res.status}`}`,
    );
  }
  const permissions =
    typeof body.permissions === 'string'
      ? body.permissions.split(/[\s,]+/).filter(Boolean)
      : Array.isArray(body.permissions)
        ? body.permissions.filter((p): p is string => typeof p === 'string')
        : [];
  const long = await exchangeLongLived(body.access_token, opts, fetchImpl);
  const userId = body.user_id === undefined || body.user_id === null ? null : String(body.user_id);
  return { ...long, userId, permissions };
}

async function exchangeLongLived(
  shortToken: string,
  opts: InstagramCredentials & { now?: Date },
  fetchImpl: FetchLike,
): Promise<InstagramToken> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: opts.appSecret,
    access_token: shortToken,
  });
  const res = await fetchImpl(`${GRAPH}/access_token?${params.toString()}`);
  return readLongToken(res, opts.now, 'O Instagram não trocou o acesso pelo de longa duração');
}

async function readLongToken(
  res: Response,
  now = new Date(),
  what: string,
): Promise<InstagramToken> {
  const body = await readJson(res);
  if (!res.ok || typeof body.access_token !== 'string') {
    const { message } = graphError(body);
    throw new SocialPublishError(`${what}: ${message ?? `HTTP ${res.status}`}`, {
      deactivateAccount: graphError(body).code === 190,
    });
  }
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : null;
  return {
    accessToken: body.access_token,
    expiresAt: expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null,
  };
}

/**
 * Renova o token longo por mais ~60 dias. Só funciona com token de mais de
 * 24 h e ainda válido — quem chama (o cron) garante isso.
 */
export async function refreshInstagramToken(
  accessToken: string,
  opts: { now?: Date } = {},
  fetchImpl: FetchLike = fetch,
): Promise<InstagramToken> {
  const params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: accessToken });
  const res = await fetchImpl(`${GRAPH}/refresh_access_token?${params.toString()}`);
  return readLongToken(res, opts.now, 'Não foi possível renovar o acesso ao Instagram');
}

export interface InstagramProfile {
  /** Id da conta profissional — é o `{ig-id}` das chamadas de publicação. */
  userId: string;
  username: string;
  name: string | null;
  accountType: string | null;
  picture: string | null;
}

export async function fetchInstagramProfile(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<InstagramProfile> {
  const params = new URLSearchParams({
    fields: 'user_id,username,name,account_type,profile_picture_url',
    access_token: accessToken,
  });
  const res = await fetchImpl(`${GRAPH}/${instagramApiVersion()}/me?${params.toString()}`);
  const body = await readJson(res);
  const userId = body.user_id ?? body.id;
  if (
    !res.ok ||
    (typeof userId !== 'string' && typeof userId !== 'number') ||
    typeof body.username !== 'string'
  ) {
    throw new SocialPublishError(`Não foi possível ler a conta do Instagram (HTTP ${res.status}).`);
  }
  return {
    userId: String(userId),
    username: body.username,
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null,
    accountType: typeof body.account_type === 'string' ? body.account_type : null,
    picture: typeof body.profile_picture_url === 'string' ? body.profile_picture_url : null,
  };
}

/** Mapeia um erro da Graph API para mensagem legível (e se a conta deve ser desativada). */
export async function instagramError(
  res: Response,
  step: string,
  providerState?: Json,
): Promise<SocialPublishError> {
  const { message, code } = graphError(await readJson(res));
  // 190 = token inválido/expirado/revogado.
  if (code === 190 || res.status === 401) {
    return new SocialPublishError(
      'O acesso ao Instagram expirou ou foi revogado — reconecte em /settings/social.',
      {
        providerState,
        deactivateAccount: true,
      },
    );
  }
  // 4/17/32/613 = limites de chamada; 9 = limite de publicações.
  if (
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    code === 9 ||
    res.status === 429
  ) {
    return new SocialPublishError(
      'O Instagram limitou as chamadas ou publicações desta conta por agora. Tente de novo mais tarde.',
      {
        providerState,
      },
    );
  }
  if (code === 10 || code === 200 || res.status === 403) {
    return new SocialPublishError(
      `O Instagram recusou ${step} por falta de permissão${message ? ` (${message})` : ''}. Reconecte a conta e confira se o app tem "instagram_business_content_publish".`,
      { providerState },
    );
  }
  return new SocialPublishError(
    `O Instagram recusou ${step} (HTTP ${res.status})${message ? `: ${message}` : '.'}`,
    {
      providerState,
    },
  );
}

/** Progresso guardado em `providerState.instagram` para uma nova tentativa não duplicar. */
interface IgState {
  /** assetId → container filho do carrossel. */
  children?: Record<string, string>;
  /** Container final (imagem única ou CAROUSEL), pronto para media_publish. */
  container?: string;
}

function readState(state: Json | null): IgState {
  const raw = state?.instagram;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const s = raw as IgState;
  return { children: s.children ? { ...s.children } : undefined, container: s.container };
}

export interface InstagramProviderOptions {
  fetchImpl?: FetchLike;
  /** Espera entre consultas de status (testes passam 0). */
  pollDelayMs?: number;
  /** Quantas vezes consultar o status antes de desistir desta tentativa. */
  pollAttempts?: number;
}

/**
 * `fetchImpl` só nos testes. Sem ele, resolve `globalThis.fetch` a cada
 * chamada. A espera pelo processamento é curta (o cron tem 60 s): se o
 * Instagram ainda estiver processando, a tentativa falha guardando o
 * container, e "Tentar de novo" reaproveita em vez de criar outro.
 */
export function createInstagramProvider(
  opts: InstagramProviderOptions = {},
): SocialProviderAdapter {
  const doFetch: FetchLike = opts.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const pollDelayMs = opts.pollDelayMs ?? 3000;
  const pollAttempts = opts.pollAttempts ?? 8;
  const sleep = (ms: number) =>
    ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

  return {
    provider: 'INSTAGRAM',

    authorizeUrl(state, redirectUri) {
      const creds = instagramCredentials();
      if (!creds)
        throw new SocialPublishError('INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET não configurados.');
      return instagramAuthorizeUrl({ appId: creds.appId, redirectUri, state });
    },

    async publish(input: PublishInput): Promise<PublishResult> {
      const token = input.account.accessToken;
      if (!token)
        throw new SocialPublishError(
          'A conta do Instagram está sem acesso guardado — reconecte em /settings/social.',
        );
      if (input.media.length === 0)
        throw new SocialPublishError('Instagram exige ao menos 1 imagem ou vídeo.');
      const isVideo = input.media.length === 1 && input.media[0]!.mimeType.startsWith('video/');
      const isStory = input.placement === 'story';
      const igId = input.account.externalId;
      const base = `${GRAPH}/${instagramApiVersion()}`;
      const st = readState(input.providerState);
      const saved = (): Json => ({ instagram: { ...st } });

      const call = async (url: string, init?: RequestInit): Promise<Response> => {
        try {
          return await doFetch(url, init);
        } catch (err) {
          throw new SocialPublishError(
            `Não foi possível falar com o Instagram (${(err as Error).message}).`,
            {
              providerState: saved(),
            },
          );
        }
      };
      // O token vai no corpo/na query (é como a API documenta); nunca em log.
      const post = (path: string, fields: Record<string, string>) =>
        call(`${base}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ ...fields, access_token: token }).toString(),
        });
      const get = (path: string, fields: Record<string, string>) =>
        call(
          `${base}${path}?${new URLSearchParams({ ...fields, access_token: token }).toString()}`,
        );

      const statusOf = async (containerId: string): Promise<string> => {
        const res = await get(`/${containerId}`, { fields: 'status_code' });
        if (!res.ok) throw await instagramError(res, 'a consulta do processamento', saved());
        const body = await readJson(res);
        return typeof body.status_code === 'string' ? body.status_code : 'IN_PROGRESS';
      };

      // Container reaproveitado de uma tentativa anterior: expira em 24 h.
      if (st.container) {
        const status = await statusOf(st.container);
        if (status === 'PUBLISHED') {
          throw new SocialPublishError(
            'O Instagram diz que este post já foi publicado numa tentativa anterior. Confira no perfil — não vou publicar de novo.',
            { providerState: saved() },
          );
        }
        if (status === 'EXPIRED' || status === 'ERROR') {
          st.container = undefined;
          st.children = undefined;
        }
      }

      // Antes de criar qualquer coisa, confere a cota de publicações (24 h móveis).
      const limitRes = await get(`/${igId}/content_publishing_limit`, {
        fields: 'quota_usage,config',
      });
      if (limitRes.ok) {
        const body = await readJson(limitRes);
        const row = Array.isArray(body.data) ? (body.data[0] as Json | undefined) : undefined;
        const used = typeof row?.quota_usage === 'number' ? row.quota_usage : null;
        const cfg = row?.config && typeof row.config === 'object' ? (row.config as Json) : null;
        const total = typeof cfg?.quota_total === 'number' ? cfg.quota_total : null;
        if (used !== null && total !== null && used >= total) {
          throw new SocialPublishError(
            `A conta já usou as ${total} publicações permitidas pelo Instagram nas últimas 24 h. Tente de novo mais tarde.`,
            { providerState: saved() },
          );
        }
      }

      const createImage = async (
        m: PublishInput['media'][number],
        extra: Record<string, string>,
      ) => {
        const res = await post(`/${igId}/media`, {
          image_url: m.url,
          ...(m.alt ? { alt_text: m.alt } : {}),
          ...extra,
        });
        if (!res.ok) throw await instagramError(res, 'a criação do container da imagem', saved());
        const body = await readJson(res);
        if (typeof body.id !== 'string')
          throw new SocialPublishError('O Instagram não devolveu o id do container.', {
            providerState: saved(),
          });
        return body.id;
      };

      if (!st.container) {
        if (isStory) {
          // Story (24 h): 1 imagem ou 1 vídeo, sem legenda — a API não aceita `caption` em STORIES.
          const m = input.media[0]!;
          const res = await post(`/${igId}/media`, {
            media_type: 'STORIES',
            ...(isVideo ? { video_url: m.url } : { image_url: m.url }),
          });
          if (!res.ok) throw await instagramError(res, 'a criação do container do story', saved());
          const body = await readJson(res);
          if (typeof body.id !== 'string')
            throw new SocialPublishError('O Instagram não devolveu o id do container do story.', {
              providerState: saved(),
            });
          st.container = body.id;
        } else if (isVideo) {
          const res = await post(`/${igId}/media`, {
            media_type: 'REELS',
            video_url: input.media[0]!.url,
            caption: input.text,
            share_to_feed: 'true',
          });
          if (!res.ok) throw await instagramError(res, 'a criação do container do vídeo', saved());
          const body = await readJson(res);
          if (typeof body.id !== 'string')
            throw new SocialPublishError('O Instagram não devolveu o id do container do vídeo.', {
              providerState: saved(),
            });
          st.container = body.id;
        } else if (input.media.length === 1) {
          st.container = await createImage(input.media[0]!, { caption: input.text });
        } else {
          st.children = st.children ?? {};
          for (const m of input.media) {
            if (!st.children[m.id])
              st.children[m.id] = await createImage(m, { is_carousel_item: 'true' });
          }
          const res = await post(`/${igId}/media`, {
            media_type: 'CAROUSEL',
            children: input.media.map((m) => st.children![m.id]!).join(','),
            caption: input.text,
          });
          if (!res.ok) throw await instagramError(res, 'a criação do carrossel', saved());
          const body = await readJson(res);
          if (typeof body.id !== 'string')
            throw new SocialPublishError('O Instagram não devolveu o id do carrossel.', {
              providerState: saved(),
            });
          st.container = body.id;
        }
      }

      // Espera o Instagram baixar e processar as imagens.
      let status = await statusOf(st.container);
      for (let i = 1; i < pollAttempts && status === 'IN_PROGRESS'; i++) {
        await sleep(pollDelayMs);
        status = await statusOf(st.container);
      }
      if (status === 'IN_PROGRESS' && isVideo) {
        throw new SocialPublishError(
          'O Instagram ainda está processando o vídeo. O CRM publica sozinho assim que ficar pronto.',
          { providerState: saved(), retryLater: true },
        );
      }
      if (status === 'IN_PROGRESS') {
        throw new SocialPublishError(
          'O Instagram ainda está processando as imagens. Tente de novo em alguns minutos — o envio já feito será reaproveitado.',
          {
            providerState: saved(),
          },
        );
      }
      if (status !== 'FINISHED') {
        const failed = st.container;
        st.container = undefined;
        st.children = undefined;
        throw new SocialPublishError(
          isVideo
            ? `O Instagram não conseguiu processar o vídeo (status ${status}, container ${failed}). Confira se é MP4 (H.264, AAC) de 3 s a 15 min e tente de novo.`
            : `O Instagram não conseguiu processar as imagens (status ${status}, container ${failed}). Confira se são JPEG públicos e tente de novo.`,
          { providerState: saved() },
        );
      }

      const pub = await post(`/${igId}/media_publish`, { creation_id: st.container });
      if (!pub.ok) throw await instagramError(pub, 'a publicação', saved());
      const pubBody = await readJson(pub);
      if (typeof pubBody.id !== 'string') {
        throw new SocialPublishError(
          'O Instagram aceitou a publicação mas não devolveu o id do post. Confira no perfil antes de tentar de novo.',
          {
            providerState: saved(),
          },
        );
      }

      // O link público vem numa chamada à parte; se falhar, o post já saiu.
      let permalink: string | null = null;
      try {
        const res = await get(`/${pubBody.id}`, { fields: 'permalink' });
        if (res.ok) {
          const body = await readJson(res);
          permalink = typeof body.permalink === 'string' ? body.permalink : null;
        }
      } catch {
        permalink = null;
      }
      return { externalId: pubBody.id, externalUrl: permalink, providerState: saved() };
    },
  };
}
