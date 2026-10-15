import { instagramApiVersion } from '../providers/instagram.js';
import { linkedinApiVersion } from '../providers/linkedin-text.js';
import type { RemoteMediaItem, RemoteType } from '../remote.js';

// Leitura das publicações como estão na rede (só leitura, nunca altera nada).
// Cada item traz `source`: a URL de onde copiar a miniatura para o CRM.
//
// - Instagram: GET /{ig-id}/media (feed, carrossel com todos os itens, vídeo,
//   reel) e GET /{ig-id}/stories (só as das últimas 24 h — por isso o cron
//   corre várias vezes por dia). Permissão: instagram_business_basic.
// - LinkedIn Página: GET /rest/posts?q=author (r_organization_social), com as
//   imagens/vídeos/documentos resolvidos por /rest/images|videos|documents.
// - LinkedIn perfil pessoal: a API só lista posts de membro com r_member_social
//   (restrita) — fora, com aviso na conta.

const MAX_PAGES = 5;
type FetchLike = typeof fetch;

export interface RemoteItem extends RemoteMediaItem {
  /** De onde copiar a miniatura (imagem; para vídeo, a capa). */
  source: string | null;
}

export interface RemotePost {
  externalId: string;
  url: string | null;
  text: string;
  publishedAt: Date;
  type: RemoteType;
  items: RemoteItem[];
  linkUrl?: string | null;
  linkTitle?: string | null;
  expiresAt?: Date | null;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

// --- Instagram -----------------------------------------------------------------

const IG_FIELDS =
  'id,caption,permalink,timestamp,media_type,media_product_type,media_url,thumbnail_url,children{id,media_type,media_url,thumbnail_url}';

function igItem(m: Record<string, unknown>): RemoteItem {
  const video = m.media_type === 'VIDEO';
  return {
    kind: video ? 'video' : 'image',
    url: str(m.media_url),
    thumbUrl: null,
    source: video ? str(m.thumbnail_url) : str(m.media_url),
  };
}

export function instagramToRemote(m: Record<string, unknown>, story = false): RemotePost | null {
  const at = new Date(String(m.timestamp ?? ''));
  if (typeof m.id !== 'string' || Number.isNaN(at.getTime())) return null;
  const children = (m.children as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
  const type: RemoteType = story
    ? 'STORY'
    : m.media_type === 'CAROUSEL_ALBUM'
      ? 'CAROUSEL'
      : m.media_product_type === 'REELS'
        ? 'REEL'
        : m.media_type === 'VIDEO'
          ? 'VIDEO'
          : 'IMAGE';
  return {
    externalId: m.id,
    url: str(m.permalink),
    text: typeof m.caption === 'string' ? m.caption : '',
    publishedAt: at,
    type,
    items: children.length ? children.map(igItem) : [igItem(m)],
    expiresAt: story ? new Date(at.getTime() + 86_400_000) : null,
  };
}

function igError(status: number, body: Record<string, unknown>, what: string): Error {
  const err = body.error as { message?: string; code?: number } | undefined;
  if (err?.code === 190) return new Error('O acesso ao Instagram expirou — ligue a conta de novo em Configurações → Contas sociais.');
  return new Error(`O Instagram recusou ${what} (HTTP ${status}${err?.message ? `: ${err.message}` : ''}).`);
}

export async function listInstagramPosts(
  account: { externalId: string },
  token: string,
  since: Date,
  fetchImpl: FetchLike = fetch,
): Promise<RemotePost[]> {
  const base = `https://graph.instagram.com/${instagramApiVersion()}/${encodeURIComponent(account.externalId)}`;
  const out: RemotePost[] = [];
  let url: string | null = `${base}/media?` + new URLSearchParams({ fields: IG_FIELDS, limit: '50', access_token: token });
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res: Response = await fetchImpl(url);
    const body = await readJson(res);
    if (!res.ok) throw igError(res.status, body, 'a lista de posts');
    let older = false;
    for (const m of Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : []) {
      const post = instagramToRemote(m);
      if (!post) continue;
      if (post.publishedAt < since) {
        older = true;
        continue;
      }
      out.push(post);
    }
    const next = (body.paging as { next?: string } | undefined)?.next;
    url = !older && next ? next : null;
  }
  // Stories: só existem 24 h na API. Falhar aqui não derruba o feed.
  try {
    const res = await fetchImpl(
      `${base}/stories?` + new URLSearchParams({ fields: 'id,caption,permalink,timestamp,media_type,media_url,thumbnail_url', access_token: token }),
    );
    const body = await readJson(res);
    if (res.ok) {
      for (const m of Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : []) {
        const post = instagramToRemote(m, true);
        if (post) out.push(post);
      }
    }
  } catch {
    // sem stories nesta passada
  }
  return out;
}

// --- LinkedIn (Página) -----------------------------------------------------------

function liHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'LinkedIn-Version': linkedinApiVersion(), 'X-Restli-Protocol-Version': '2.0.0' };
}

/** urn:li:image|video|document → URL de download e capa (best-effort: falha = item sem prévia). */
async function resolveLinkedinAsset(urn: string, token: string, fetchImpl: FetchLike): Promise<RemoteItem> {
  const kind = urn.includes(':video:') ? 'video' : urn.includes(':document:') ? 'document' : 'image';
  const path = kind === 'video' ? 'videos' : kind === 'document' ? 'documents' : 'images';
  try {
    const res = await fetchImpl(`https://api.linkedin.com/rest/${path}/${encodeURIComponent(urn)}`, { headers: liHeaders(token) });
    const body = await readJson(res);
    if (!res.ok) return { kind, url: null, thumbUrl: null, source: null };
    const download = str(body.downloadUrl);
    const thumb = kind === 'video' ? str(body.thumbnail) : kind === 'image' ? download : null;
    return { kind, url: download, thumbUrl: null, source: thumb, title: str(body.title) };
  } catch {
    return { kind, url: null, thumbUrl: null, source: null };
  }
}

export async function linkedinToRemote(e: Record<string, unknown>, token: string, fetchImpl: FetchLike = fetch): Promise<RemotePost | null> {
  if (typeof e.id !== 'string' || (e.lifecycleState && e.lifecycleState !== 'PUBLISHED')) return null;
  const ms = typeof e.publishedAt === 'number' ? e.publishedAt : typeof e.createdAt === 'number' ? e.createdAt : null;
  if (!ms) return null;
  const content = (e.content ?? {}) as Record<string, Record<string, unknown> | undefined>;
  let type: RemoteType = 'TEXT';
  let urns: string[] = [];
  let linkUrl: string | null = null;
  let linkTitle: string | null = null;
  if (content.media?.id) {
    const id = String(content.media.id);
    urns = [id];
    type = id.includes(':video:') ? 'VIDEO' : id.includes(':document:') ? 'DOCUMENT' : 'IMAGE';
    linkTitle = str(content.media.title);
  } else if (content.multiImage) {
    urns = ((content.multiImage.images as { id?: string }[] | undefined) ?? []).map((i) => i.id).filter((id): id is string => !!id);
    type = 'CAROUSEL';
  } else if (content.carousel) {
    urns = ((content.carousel.cards as { media?: { id?: string } }[] | undefined) ?? [])
      .map((c) => c.media?.id)
      .filter((id): id is string => !!id);
    type = 'CAROUSEL';
  } else if (content.article) {
    type = 'ARTICLE';
    linkUrl = str(content.article.source);
    linkTitle = str(content.article.title);
    const thumb = str(content.article.thumbnail);
    if (thumb) urns = [thumb];
  }
  const items: RemoteItem[] = [];
  for (const urn of urns.slice(0, 20)) items.push(await resolveLinkedinAsset(urn, token, fetchImpl));
  return {
    externalId: e.id,
    url: `https://www.linkedin.com/feed/update/${e.id}/`,
    text: typeof e.commentary === 'string' ? e.commentary : '',
    publishedAt: new Date(ms),
    type,
    items,
    linkUrl,
    linkTitle,
  };
}

export async function listLinkedinOrganizationPosts(
  account: { externalId: string },
  token: string,
  since: Date,
  fetchImpl: FetchLike = fetch,
): Promise<RemotePost[]> {
  const out: RemotePost[] = [];
  const author = encodeURIComponent(`urn:li:organization:${account.externalId}`);
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchImpl(`https://api.linkedin.com/rest/posts?q=author&author=${author}&count=50&start=${page * 50}&sortBy=LAST_MODIFIED`, {
      headers: { ...liHeaders(token), 'X-RestLi-Method': 'FINDER' },
    });
    const body = await readJson(res);
    if (!res.ok) {
      if (res.status === 401) throw new Error('O acesso ao LinkedIn expirou — ligue a Página de novo em Configurações → Contas sociais.');
      throw new Error(`O LinkedIn recusou a lista de posts da Página (HTTP ${res.status}${typeof body.message === 'string' ? `: ${body.message}` : ''}).`);
    }
    const elements = Array.isArray(body.elements) ? (body.elements as Record<string, unknown>[]) : [];
    for (const e of elements) {
      const ms = typeof e.publishedAt === 'number' ? e.publishedAt : typeof e.createdAt === 'number' ? e.createdAt : 0;
      if (ms < since.getTime()) continue;
      const post = await linkedinToRemote(e, token, fetchImpl);
      if (post) out.push(post);
    }
    if (elements.length < 50) break;
  }
  return out;
}
