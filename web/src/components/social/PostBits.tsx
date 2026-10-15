import { Instagram, Linkedin } from 'lucide-react';
import { DISPLAY_LABEL, type DisplayState } from '@app/social/status';
import { PROVIDER_LABEL, type SocialProviderName } from '@app/social/rules';
import { Badge, type BadgeTone } from '@/components/ui';
import { cn } from '@/lib/cn';

export const STATE_TONE: Record<DisplayState, BadgeTone> = {
  IDEA: 'neutral',
  DRAFT: 'warning',
  SCHEDULED: 'info',
  QUEUED: 'info',
  PUBLISHING: 'info',
  PUBLISHED: 'success',
  FAILED: 'danger',
  ARCHIVED: 'neutral',
};

/** Ponto de cor do estado (calendário): mesma semântica dos badges, via tokens. */
export const STATE_DOT: Record<DisplayState, string> = {
  IDEA: 'bg-muted',
  DRAFT: 'bg-warning',
  SCHEDULED: 'bg-info',
  QUEUED: 'bg-info',
  PUBLISHING: 'bg-info',
  PUBLISHED: 'bg-success',
  FAILED: 'bg-danger',
  ARCHIVED: 'bg-border-strong',
};

export const STATE_ORDER: DisplayState[] = ['IDEA', 'DRAFT', 'SCHEDULED', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'ARCHIVED'];

export function StateBadge({ state, className }: { state: DisplayState; className?: string }) {
  return (
    <Badge tone={STATE_TONE[state]} className={className}>
      {DISPLAY_LABEL[state]}
    </Badge>
  );
}

/** Ícone da rede, monocromático (tokens do CRM — não a cor de marca de cada rede). */
export function NetworkIcon({ provider, className }: { provider: SocialProviderName; className?: string }) {
  const Icon = provider === 'INSTAGRAM' ? Instagram : Linkedin;
  return <Icon className={cn('h-3.5 w-3.5 shrink-0', className)} aria-label={PROVIDER_LABEL[provider]} />;
}

/** Miniatura real do post (imagem da biblioteca ou cópia da media sincronizada). */
export function PostThumb({ url, className }: { url: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Blob do CRM ou CDN da rede
    <img src={url} alt="" loading="lazy" className={cn('shrink-0 bg-surface-2 object-cover', className)} />
  );
}

export function snippet(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '(sem texto)';
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Chave de dia local do navegador ("YYYY-MM-DD") — o calendário é sempre no fuso de quem vê. */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateTimeLabel(iso: string | null): string {
  if (!iso) return 'Sem data';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const NUMBER = new Intl.NumberFormat('pt-BR');
const COMPACT = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** Número para tabela/KPI; "–" quando a rede não deu o valor (nunca um zero inventado). */
export function formatCount(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined) return '–';
  return compact && value >= 10_000 ? COMPACT.format(value) : NUMBER.format(value);
}

export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
