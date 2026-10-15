import { Play } from 'lucide-react';
import { formatDuration, isVideoMime } from '@app/content/media';
import { cn } from '@/lib/cn';

/**
 * Miniatura de um arquivo da biblioteca: imagem, ou o primeiro quadro do
 * vídeo (só os metadados são baixados) com o selo de duração.
 */
export function MediaThumb({
  url,
  alt,
  mimeType,
  durationMs,
  className,
}: {
  url: string;
  alt: string;
  mimeType?: string;
  durationMs?: number | null;
  className?: string;
}) {
  if (mimeType && isVideoMime(mimeType)) {
    return (
      <span className={cn('relative block overflow-hidden', className)}>
        {/* #t=0.1 faz o navegador mostrar um quadro em vez de fundo preto. */}
        <video src={`${url}#t=0.1`} muted playsInline preload="metadata" aria-label={alt} className="h-full w-full object-cover" />
        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-full bg-scrim-strong px-1.5 py-0.5 text-xs text-on-media">
          <Play className="h-3 w-3" aria-hidden />
          {formatDuration(durationMs)}
        </span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- host do Blob é dinâmico (por store)
    <img src={url} alt={alt} className={cn('object-cover', className)} />
  );
}
