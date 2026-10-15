'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clapperboard, FileText, Globe, Heart, MessageCircle, Send, ThumbsUp } from 'lucide-react';
import { foldIndex, PROVIDER_LABEL, type SocialPlacement, type SocialProviderName } from '@app/social/rules';
import { Avatar } from '@/components/ui';

export interface PreviewMedia {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
  mimeType?: string;
}

/**
 * Como o post vai aparecer no feed: texto com as quebras de linha, corte no
 * ponto em que a rede mostra "ver mais" (`foldIndex`, mesmas regras do
 * serviço), e imagens como a rede organiza — carrossel deslizável no
 * Instagram e, no LinkedIn, imagem única ou documento PDF (2+ imagens, que o
 * publicador junta num PDF). Visual neutro (tokens do CRM), não uma
 * cópia da marca de cada rede.
 */
export function SocialPreview({
  provider,
  accountName,
  avatarUrl,
  text,
  media,
  linkUrl,
  placement = 'feed',
}: {
  provider: SocialProviderName;
  accountName: string;
  avatarUrl?: string | null;
  text: string;
  media: PreviewMedia[];
  linkUrl?: string | null;
  placement?: SocialPlacement;
}) {
  const [expanded, setExpanded] = useState(false);
  if (provider === 'INSTAGRAM' && placement === 'story') return <StoryPreview accountName={accountName} avatarUrl={avatarUrl} media={media[0]} />;
  const fold = foldIndex(provider, text);
  const shown = expanded || fold === null ? text : text.slice(0, fold).trimEnd();
  const isInstagram = provider === 'INSTAGRAM';

  const caption = (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
      {isInstagram && <span className="mr-1 font-semibold">{accountName}</span>}
      {shown || <span className="text-muted">(sem texto)</span>}
      {fold !== null && !expanded && (
        <button type="button" onClick={() => setExpanded(true)} className="ml-1 text-muted hover:text-foreground">
          {isInstagram ? '... mais' : '...ver mais'}
        </button>
      )}
    </p>
  );

  return (
    <div
      className="flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-sm)]"
      aria-label={`Prévia no ${PROVIDER_LABEL[provider]}`}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar vem da rede
          <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <Avatar name={accountName} size="sm" />
        )}
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">{accountName}</p>
          {!isInstagram && (
            <p className="flex items-center gap-1 text-xs text-muted">
              agora · <Globe className="h-3 w-3" />
            </p>
          )}
        </div>
      </div>

      {!isInstagram && <div className="px-3 pb-2">{caption}</div>}
      {media.length === 1 && media[0]!.mimeType?.startsWith('video/') ? (
        <VideoPreview media={media[0]!} reels={isInstagram} />
      ) : media.length > 0 &&
        (isInstagram ? (
          <Carousel media={media} />
        ) : media.length > 1 ? (
          <Document media={media} />
        ) : (
          <SingleImage media={media[0]!} />
        ))}
      {!isInstagram && linkUrl && media.length === 0 && <LinkCard url={linkUrl} />}

      <div className="flex items-center gap-4 px-3 py-2 text-muted">
        {isInstagram ? (
          <>
            <Heart className="h-5 w-5" /> <MessageCircle className="h-5 w-5" /> <Send className="h-5 w-5" />
          </>
        ) : (
          <>
            <ThumbsUp className="h-4 w-4" /> <MessageCircle className="h-4 w-4" /> <Send className="h-4 w-4" />
          </>
        )}
      </div>
      {isInstagram && <div className="px-3 pb-3">{caption}</div>}
    </div>
  );
}

/** Story: ecrã vertical 9:16, a peça a encher, conta no topo, sem legenda (a API não a mostra). */
function StoryPreview({ accountName, avatarUrl, media: m }: { accountName: string; avatarUrl?: string | null; media?: PreviewMedia }) {
  const video = m?.mimeType?.startsWith('video/');
  return (
    <div className="relative w-full max-w-[18rem] overflow-hidden rounded-xl bg-surface-2 shadow-[var(--shadow-sm)]" style={{ aspectRatio: '9 / 16' }} aria-label="Prévia do story no Instagram">
      {m ? (
        video ? (
          <video src={m.url} controls muted playsInline preload="metadata" aria-label={m.alt} className="h-full w-full object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- host do Blob é dinâmico
          <img src={m.url} alt={m.alt} className="h-full w-full object-contain" />
        )
      ) : (
        <p className="flex h-full items-center justify-center px-6 text-center text-xs text-muted">Escolha 1 imagem ou 1 vídeo vertical para o story.</p>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-2">
        <span className="h-0.5 w-full rounded-full bg-scrim" />
        <span className="flex items-center gap-2 text-xs font-semibold text-on-media">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar vem da rede
            <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <Avatar name={accountName} size="sm" />
          )}
          <span className="rounded-full bg-scrim px-1.5 py-0.5">{accountName}</span>
          <span className="rounded-full bg-scrim px-1.5 py-0.5 font-normal">Story</span>
        </span>
      </div>
    </div>
  );
}

function Carousel({ media }: { media: PreviewMedia[] }) {
  const [index, setIndex] = useState(0);
  const current = media[Math.min(index, media.length - 1)]!;
  // No carrossel o Instagram corta tudo na proporção da primeira imagem.
  const first = media[0]!;
  return (
    <div className="relative bg-surface-2" style={{ aspectRatio: `${first.width} / ${first.height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- host do Blob é dinâmico */}
      <img src={current.url} alt={current.alt} className="h-full w-full object-cover" />
      {media.length > 1 && (
        <>
          <span className="absolute right-2 top-2 rounded-full bg-scrim px-2 py-0.5 text-xs text-on-media">
            {index + 1}/{media.length}
          </span>
          {index > 0 && (
            <button
              type="button"
              aria-label="Imagem anterior"
              onClick={() => setIndex(index - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-scrim p-1 text-on-media"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {index < media.length - 1 && (
            <button
              type="button"
              aria-label="Próxima imagem"
              onClick={() => setIndex(index + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-scrim p-1 text-on-media"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Vídeo: no Instagram sai como Reels, sempre num quadro 9:16 (um vídeo 16:9
 * aparece com faixas, como na rede); no LinkedIn, na proporção dele.
 */
function VideoPreview({ media: m, reels }: { media: PreviewMedia; reels: boolean }) {
  return (
    <div className="relative bg-surface-2" style={{ aspectRatio: reels ? '9 / 16' : `${m.width} / ${m.height}` }}>
      <video src={m.url} controls muted playsInline preload="metadata" aria-label={m.alt} className="h-full w-full object-contain" />
      {reels && (
        <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-scrim px-2 py-0.5 text-xs text-on-media">
          <Clapperboard className="h-3 w-3" aria-hidden /> Reels
        </span>
      )}
    </div>
  );
}

function SingleImage({ media: m }: { media: PreviewMedia }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- host do Blob é dinâmico
    <img src={m.url} alt={m.alt} className="w-full bg-surface-2 object-cover" style={{ aspectRatio: `${m.width} / ${m.height}` }} />
  );
}

/** LinkedIn com 2+ imagens: sai como documento PDF, que o feed mostra como slides. */
function Document({ media }: { media: PreviewMedia[] }) {
  return (
    <div>
      <Carousel media={media} />
      <p className="flex items-center gap-1.5 bg-surface-2 px-3 py-1.5 text-xs text-muted">
        <FileText className="h-3.5 w-3.5" /> Documento PDF · {media.length} páginas
      </p>
    </div>
  );
}

function LinkCard({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* mantém o texto cru */
  }
  return (
    <div className="mx-3 mb-1 rounded-lg bg-surface-2 px-3 py-2">
      <p className="truncate text-xs text-muted">{host}</p>
      <p className="truncate text-sm text-foreground">{url}</p>
    </div>
  );
}
