// Regras por rede — PURO (sem Prisma), importado também pelo navegador
// (`@app/social/rules`): o editor mostra contador, avisos e a prévia com as
// mesmas funções que o serviço usa para bloquear a aprovação.
//
// Números conferidos na documentação oficial em 10/10/2026:
// - Instagram (developers.facebook.com/docs/instagram-platform/instagram-graph-api/
//   reference/ig-user/media): legenda até 2.200 caracteres, 30 hashtags e 20
//   menções; imagem só JPEG, até 8 MB, proporção de 4:5 a 1,91:1, largura de 320
//   a 1.440px (fora disso a rede redimensiona); carrossel até 10 itens.
// - LinkedIn (learn.microsoft.com/linkedin/marketing/community-management/shares):
//   `commentary` até 3.000 caracteres; imagem JPG/PNG/GIF com menos de
//   36.152.320 pixels; o conteúdo do post é UM tipo só (imagem(ns) OU artigo
//   com link), nunca os dois. De 2 a 20 imagens o CRM publica como documento
//   PDF (carrossel), não como grade: GIF não entra no PDF, só JPG/PNG.
//
// Vídeo (14/10/2026), conferido na mesma documentação: um vídeo por post,
// sozinho (nunca com imagens nem com link).
// - Instagram publica vídeo só como Reels: MP4 ou MOV, até 300 MB, de 3 s a
//   15 min, proporção recomendada 9:16 (outra aparece cortada ou com faixas).
// - LinkedIn (Videos API): MP4, de 75 KB a 500 MB, de 3 s a 30 min.

export type SocialProviderName = 'LINKEDIN' | 'INSTAGRAM';

/**
 * Onde o post sai (15/10/2026). Só o Instagram tem os três: feed (imagem ou
 * carrossel; um vídeo também vira Reels, a API não publica vídeo de outro
 * jeito), reel (vídeo, aparece também no feed) e story (24 h, 1 imagem ou 1
 * vídeo de até 60 s, sem legenda — a API não aplica texto nem figurinha de
 * link). O LinkedIn é sempre feed.
 */
export type SocialPlacement = 'feed' | 'reel' | 'story';
export const PLACEMENTS: SocialPlacement[] = ['feed', 'reel', 'story'];
export const PLACEMENT_LABEL: Record<SocialPlacement, string> = { feed: 'Feed', reel: 'Reel', story: 'Story' };

export function isPlacement(value: unknown): value is SocialPlacement {
  return value === 'feed' || value === 'reel' || value === 'story';
}

export const PROVIDER_LABEL: Record<SocialProviderName, string> = {
  LINKEDIN: 'LinkedIn',
  INSTAGRAM: 'Instagram',
};

export const SOCIAL_LIMITS = {
  INSTAGRAM: {
    maxText: 2200,
    maxHashtags: 30,
    maxMentions: 20,
    minMedia: 1,
    maxMedia: 10,
    maxBytes: 8 * 1024 * 1024,
    minRatio: 4 / 5,
    maxRatio: 1.91,
    minWidth: 320,
    maxWidth: 1440,
    mimeTypes: ['image/jpeg'],
    videoMimeTypes: ['video/mp4', 'video/quicktime'],
    maxVideoBytes: 300 * 1024 * 1024,
    minVideoMs: 3_000,
    maxVideoMs: 15 * 60_000,
    maxStoryVideoMs: 60_000,
    // Na grade/feed a legenda corta em ~125 caracteres ou 2 linhas ("mais").
    foldChars: 125,
    foldLines: 2,
  },
  LINKEDIN: {
    maxText: 3000,
    minMedia: 0,
    maxMedia: 20,
    maxPixels: 36_152_320,
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
    // Carrossel em PDF (2+ imagens): só o que o PDF embute sem recodificar.
    documentMimeTypes: ['image/jpeg', 'image/png'],
    videoMimeTypes: ['video/mp4'],
    minVideoBytes: 75 * 1024,
    maxVideoBytes: 500 * 1024 * 1024,
    minVideoMs: 3_000,
    maxVideoMs: 30 * 60_000,
    // No feed o texto corta em ~210 caracteres ou 3 linhas ("...ver mais").
    foldChars: 210,
    foldLines: 3,
  },
} as const;

export interface MediaInfo {
  id: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
  /** Só vídeo. Null/ausente = não medida (a duração não é conferida). */
  durationMs?: number | null;
}

export function isVideo(m: Pick<MediaInfo, 'mimeType'>): boolean {
  return m.mimeType.startsWith('video/');
}

export interface SocialDraft {
  provider: SocialProviderName;
  text: string;
  media: MediaInfo[];
  linkUrl?: string | null;
  /** Ausente = feed. */
  placement?: SocialPlacement | null;
}

/**
 * Problemas por campo. `errors` bloqueiam a aprovação (e a publicação);
 * `warnings` só avisam (a rede ajusta sozinha, ou é questão de estilo).
 */
export interface SocialIssues {
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

// Hashtag/menção só contam no começo ou depois de espaço/pontuação — "url/#secao"
// e "nome@dominio" não são marcação.
const HASHTAG = /(^|[\s(\[{,;:!?"'])#[\p{L}\p{N}_]+/gu;
const MENTION = /(^|[\s(\[{,;:!?"'])@[A-Za-z0-9_.]+/gu;

export function countHashtags(text: string): number {
  return text.match(HASHTAG)?.length ?? 0;
}

export function countMentions(text: string): number {
  return text.match(MENTION)?.length ?? 0;
}

/**
 * Tamanho do texto como a rede conta: por caractere (code point), não por
 * unidade UTF-16 — um emoji conta 1, não 2.
 */
export function textLength(text: string): number {
  return Array.from(text).length;
}

export function validateSocialDraft(draft: SocialDraft): SocialIssues {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const len = textLength(draft.text);
  const name = PROVIDER_LABEL[draft.provider];

  const videoCount = draft.media.filter(isVideo).length;
  const video = videoCount === 1 && draft.media.length === 1 ? draft.media[0]! : null;
  if (videoCount > 0 && !video) {
    errors.media = 'Vídeo vai sozinho no post: um vídeo, sem imagens junto.';
  }

  const placement = draft.placement ?? 'feed';
  if (draft.provider === 'INSTAGRAM' && placement === 'story') return instagramStoryIssues(draft, video, errors, warnings);
  if (draft.provider === 'LINKEDIN' && placement !== 'feed') {
    errors.placement = 'O LinkedIn não tem Reels nem Stories: este post sai no feed.';
  }

  if (draft.provider === 'INSTAGRAM') {
    const L = SOCIAL_LIMITS.INSTAGRAM;
    if (placement === 'reel' && !errors.media && !video) {
      errors.media = 'Reel precisa de um vídeo MP4 (escolha ou envie na biblioteca), sozinho no post.';
    }
    if (len > L.maxText) errors.text = `Legenda tem ${len} caracteres — o Instagram aceita até ${L.maxText}.`;
    const tags = countHashtags(draft.text);
    if (!errors.text && tags > L.maxHashtags) errors.text = `${tags} hashtags — o Instagram aceita até ${L.maxHashtags}.`;
    const mentions = countMentions(draft.text);
    if (!errors.text && mentions > L.maxMentions) errors.text = `${mentions} menções — o Instagram aceita até ${L.maxMentions}.`;

    if (errors.media) {
      // vídeo misturado com imagem: já explicado acima
    } else if (video) {
      const videoError = instagramVideoError(video);
      if (videoError) errors.media = videoError;
      else if (!isVertical(video))
        warnings.media = `Vídeo ${ratioLabel(video)}: o Reels é vertical (9:16) e corta ou põe faixas no resto. Use a versão 9:16.`;
    } else if (draft.media.length < L.minMedia) errors.media = 'Instagram exige ao menos 1 imagem ou vídeo.';
    else if (draft.media.length > L.maxMedia)
      errors.media = `${draft.media.length} imagens — o carrossel do Instagram aceita até ${L.maxMedia}.`;
    else {
      const mediaError = draft.media.map((m, i) => instagramMediaError(m, i)).find(Boolean);
      if (mediaError) errors.media = mediaError;
      const resized = draft.media.findIndex((m) => m.width < L.minWidth || m.width > L.maxWidth);
      if (!mediaError && resized >= 0)
        warnings.media = `Imagem ${resized + 1} tem ${draft.media[resized]!.width}px de largura — o Instagram vai redimensionar (aceita ${L.minWidth} a ${L.maxWidth}px).`;
      if (!mediaError && draft.media.length > 1 && !sameRatio(draft.media))
        warnings.media = 'No carrossel o Instagram corta todas as imagens na proporção da primeira.';
    }

    if (draft.linkUrl?.trim()) warnings.linkUrl = 'Link em legenda do Instagram não é clicável — use "link na bio" no texto.';
  } else {
    const L = SOCIAL_LIMITS.LINKEDIN;
    if (len > L.maxText) errors.text = `Texto tem ${len} caracteres — o LinkedIn aceita até ${L.maxText}.`;
    if (len === 0 && draft.media.length === 0 && !draft.linkUrl?.trim())
      errors.text = 'Post do LinkedIn precisa de texto, imagem ou link.';

    if (errors.media) {
      // vídeo misturado com imagem: já explicado acima
    } else if (video) {
      const videoError = linkedinVideoError(video);
      if (videoError) errors.media = videoError;
    } else if (draft.media.length > L.maxMedia)
      errors.media = `${draft.media.length} imagens — o LinkedIn aceita até ${L.maxMedia} num post.`;
    else {
      const asDocument = draft.media.length > 1;
      const mediaError = draft.media.map((m, i) => linkedinMediaError(m, i, asDocument)).find(Boolean);
      if (mediaError) errors.media = mediaError;
      if (!mediaError && asDocument && !sameRatio(draft.media))
        warnings.media = 'No carrossel em PDF cada página tem o tamanho da sua imagem: use a mesma proporção em todas (1080×1350).';
    }

    if (draft.linkUrl?.trim()) {
      if (!isHttpUrl(draft.linkUrl)) errors.linkUrl = 'Link precisa começar com http:// ou https://.';
      else if (draft.media.length > 0)
        errors.linkUrl = video
          ? 'No LinkedIn o post leva vídeo OU link com prévia, não os dois — ponha o link no texto.'
          : 'No LinkedIn o post leva imagem OU link com prévia, não os dois — tire as imagens ou ponha o link no texto.';
    }
  }

  if (draft.provider === 'INSTAGRAM' && draft.linkUrl?.trim() && !isHttpUrl(draft.linkUrl))
    errors.linkUrl = 'Link precisa começar com http:// ou https://.';

  if (len === 0 && draft.provider === 'INSTAGRAM') warnings.text = `Post sem legenda no ${name}.`;
  return { errors, warnings };
}

/**
 * Story: 1 imagem JPEG (até 8 MB, qualquer proporção — 9:16 enche o ecrã) ou
 * 1 vídeo MP4/MOV de 3 a 60 s. Legenda e link não aparecem (só avisa).
 */
function instagramStoryIssues(
  draft: SocialDraft,
  video: MediaInfo | null,
  errors: Record<string, string>,
  warnings: Record<string, string>,
): SocialIssues {
  const L = SOCIAL_LIMITS.INSTAGRAM;
  if (errors.media) {
    // vídeo misturado com imagem: já explicado
  } else if (draft.media.length !== 1) {
    errors.media = draft.media.length === 0 ? 'Story precisa de 1 imagem ou 1 vídeo.' : 'Story leva só 1 imagem ou 1 vídeo (não há carrossel em story).';
  } else if (video) {
    const base = instagramVideoError(video);
    const tooLong = video.durationMs && video.durationMs > L.maxStoryVideoMs;
    if (base && !/3 s a 15 min/.test(base)) errors.media = base;
    else if (tooLong) errors.media = `O vídeo tem ${Math.round(video.durationMs! / 1000)} s — o story aceita até 60 s.`;
    else if (video.durationMs && video.durationMs < L.minVideoMs) errors.media = 'O vídeo tem menos de 3 s — o story pede ao menos 3 s.';
    else if (!isVertical(video)) warnings.media = `Vídeo ${ratioLabel(video)}: o story é vertical (9:16) e põe faixas no resto.`;
  } else {
    const m = draft.media[0]!;
    if (!(L.mimeTypes as readonly string[]).includes(m.mimeType))
      errors.media = `A imagem é ${shortType(m.mimeType)} — o Instagram só publica JPEG.`;
    else if (m.bytes > L.maxBytes) errors.media = `A imagem tem ${mb(m.bytes)} — o Instagram aceita até 8 MB.`;
    else if (!isVertical(m)) warnings.media = 'Imagem não vertical: o story é 9:16 (1080×1920) e põe faixas no resto.';
  }
  if (draft.text.trim()) warnings.text = 'O story não leva legenda: este texto fica só no CRM (escreva-o na própria imagem ou vídeo).';
  if (draft.linkUrl?.trim()) warnings.linkUrl = 'A API do Instagram não põe figurinha de link no story: o link fica só no CRM.';
  return { errors, warnings };
}

function instagramMediaError(m: MediaInfo, i: number): string | null {
  const L = SOCIAL_LIMITS.INSTAGRAM;
  const n = i + 1;
  if (!(L.mimeTypes as readonly string[]).includes(m.mimeType))
    return `Imagem ${n} é ${shortType(m.mimeType)} — o Instagram só publica JPEG (gere ou importe a imagem "para rede social").`;
  if (m.bytes > L.maxBytes) return `Imagem ${n} tem ${mb(m.bytes)} — o Instagram aceita até 8 MB.`;
  const ratio = m.width / m.height;
  if (ratio < L.minRatio - 0.005 || ratio > L.maxRatio + 0.005)
    return `Imagem ${n} tem proporção ${ratio.toFixed(2)}:1 — o Instagram aceita de 4:5 (0,8) a 1,91:1.`;
  return null;
}

function linkedinMediaError(m: MediaInfo, i: number, asDocument: boolean): string | null {
  const L = SOCIAL_LIMITS.LINKEDIN;
  const n = i + 1;
  if (asDocument && !(L.documentMimeTypes as readonly string[]).includes(m.mimeType))
    return `Imagem ${n} é ${shortType(m.mimeType)} — o carrossel do LinkedIn vira PDF, que só aceita JPG ou PNG.`;
  if (!(L.mimeTypes as readonly string[]).includes(m.mimeType))
    return `Imagem ${n} é ${shortType(m.mimeType)} — o LinkedIn aceita JPG, PNG ou GIF.`;
  if (m.width * m.height >= L.maxPixels) return `Imagem ${n} passa de 36 megapixels — o LinkedIn recusa.`;
  return null;
}

function instagramVideoError(m: MediaInfo): string | null {
  const L = SOCIAL_LIMITS.INSTAGRAM;
  if (!(L.videoMimeTypes as readonly string[]).includes(m.mimeType))
    return `O vídeo é ${shortType(m.mimeType)} — o Instagram publica MP4 ou MOV.`;
  if (m.bytes > L.maxVideoBytes) return `O vídeo tem ${mb(m.bytes)} — o Reels aceita até 300 MB.`;
  return durationError(m, L.minVideoMs, L.maxVideoMs, 'o Reels aceita de 3 s a 15 min');
}

function linkedinVideoError(m: MediaInfo): string | null {
  const L = SOCIAL_LIMITS.LINKEDIN;
  if (!(L.videoMimeTypes as readonly string[]).includes(m.mimeType))
    return `O vídeo é ${shortType(m.mimeType)} — o LinkedIn publica MP4.`;
  if (m.bytes < L.minVideoBytes) return 'O vídeo é pequeno demais — o LinkedIn pede ao menos 75 KB.';
  if (m.bytes > L.maxVideoBytes) return `O vídeo tem ${mb(m.bytes)} — o LinkedIn aceita até 500 MB.`;
  return durationError(m, L.minVideoMs, L.maxVideoMs, 'o LinkedIn aceita de 3 s a 30 min');
}

function durationError(m: MediaInfo, min: number, max: number, rule: string): string | null {
  if (!m.durationMs) return null;
  if (m.durationMs < min || m.durationMs > max) return `O vídeo tem ${seconds(m.durationMs)} — ${rule}.`;
  return null;
}

/** 9:16 com folga (1080×1920, 720×1280...). */
function isVertical(m: MediaInfo): boolean {
  return Math.abs(m.width / m.height - 9 / 16) < 0.02;
}

function ratioLabel(m: MediaInfo): string {
  const r = m.width / m.height;
  if (Math.abs(r - 16 / 9) < 0.02) return '16:9';
  if (Math.abs(r - 1) < 0.02) return 'quadrado';
  if (Math.abs(r - 4 / 5) < 0.02) return '4:5';
  return `${m.width}×${m.height}`;
}

function seconds(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

function sameRatio(media: MediaInfo[]): boolean {
  const first = media[0]!.width / media[0]!.height;
  return media.every((m) => Math.abs(m.width / m.height - first) < 0.01);
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function shortType(mime: string): string {
  return mime.replace(/^(image|video)\//, '').toUpperCase() || 'formato desconhecido';
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function hasErrors(issues: SocialIssues): boolean {
  return Object.keys(issues.errors).length > 0;
}

/**
 * Onde a rede corta o texto no feed e mostra "ver mais": no que vier primeiro
 * entre N caracteres e N linhas. Devolve `null` quando o texto cabe inteiro.
 * O corte nunca parte uma palavra ao meio (recua até o espaço anterior).
 */
export function foldIndex(provider: SocialProviderName, text: string): number | null {
  const { foldChars, foldLines } = SOCIAL_LIMITS[provider];
  const chars = Array.from(text);
  let cut = chars.length;

  let lines = 1;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '\n') {
      if (lines === foldLines) {
        cut = i;
        break;
      }
      lines++;
    }
  }
  if (cut > foldChars) {
    cut = foldChars;
    const lastSpace = chars.slice(0, cut).lastIndexOf(' ');
    if (lastSpace > foldChars * 0.6) cut = lastSpace;
  }
  if (cut >= chars.length) return null;
  // Converte de volta para índice de string (UTF-16) para o chamador fatiar.
  return chars.slice(0, cut).join('').length;
}
