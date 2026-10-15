'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CircleAlert, ImagePlus, Images, Trash2 } from 'lucide-react';
import { PROVIDER_LABEL, SOCIAL_LIMITS, validateSocialDraft, type SocialPlacement, type SocialProviderName } from '@app/social/rules';
import { Button, LinkButton } from '@/components/ui';
import { MediaPicker, type PickedAsset } from '@/components/content/MediaPicker';
import { MediaThumb } from '@/components/content/MediaThumb';
import { formatDuration } from '@app/content/media';
import { getSocialMediaInfoAction } from '@/app/(app)/social/actions';
import { cn } from '@/lib/cn';
import { DISPLAY_LABEL, type DisplayState } from '@app/social/status';
import { NetworkIcon, STATE_DOT } from './PostBits';
import { AccountAvatar } from './AccountAvatar';
import { SocialPreview } from './SocialPreview';
import type { WorkspaceMedia } from './types';

/** Imagens ou vídeo do post: escolher da biblioteca (com envio), ordenar (ordem do carrossel) e tirar. */
export function ComposerMedia({
  media,
  onChange,
  maxLabel,
  error,
  label = 'Imagens ou vídeo',
  hint,
}: {
  media: WorkspaceMedia[];
  onChange: (next: WorkspaceMedia[]) => void;
  maxLabel: string;
  error?: string;
  label?: string;
  /** O que este formato pede (vazio = texto padrão). */
  hint?: string;
}) {
  const [open, setOpen] = useState(false);

  async function onPick(picked: PickedAsset[]) {
    setOpen(false);
    // Mantém a ordem já arrumada das que continuam; as novas entram no fim.
    const keep = media.filter((m) => picked.some((p) => p.id === m.id)).map((m) => m.id);
    const ids = [...keep, ...picked.map((p) => p.id).filter((id) => !keep.includes(id))];
    onChange(await getSocialMediaInfoAction(ids));
  }

  function move(index: number, delta: number) {
    const next = [...media];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    onChange(next);
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {label} <span className="font-normal text-muted">({media.length} · {maxLabel})</span>
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            <Images className="h-3.5 w-3.5" /> Escolher ou enviar
          </Button>
          <LinkButton href="/conteudo/imagens" target="_blank" size="sm" variant="ghost">
            <ImagePlus className="h-3.5 w-3.5" /> Gerar imagem
          </LinkButton>
        </div>
      </div>
      {media.length === 0 ? (
        <p className="text-xs text-muted">
          {hint ??
            'Sem imagens: post só de texto ou com link. Duas ou mais formam um carrossel, nesta ordem. Um vídeo MP4 vai sozinho (Reels no Instagram).'}{' '}
          Para enviar um arquivo do computador (imagem ou MP4 até 200 MB), use "Escolher ou enviar".
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {media.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg bg-surface-2 p-1.5">
              <span className="w-5 text-center text-xs tabular-nums text-muted">{i + 1}</span>
              <MediaThumb url={m.url} alt="" mimeType={m.mimeType} className="h-10 w-10 shrink-0 rounded" />
              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                {m.alt} · {m.width}×{m.height} · {m.mimeType.replace(/^(image|video)\//, '').toUpperCase()}
                {m.durationMs ? ` · ${formatDuration(m.durationMs)}` : ''}
              </span>
              <Button size="sm" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" aria-label="Descer" disabled={i === media.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" aria-label="Tirar" onClick={() => onChange(media.filter((x) => x.id !== m.id))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <MediaPicker open={open} onClose={() => setOpen(false)} onSelectMultiple={onPick} initialSelectedIds={media.map((m) => m.id)} allowVideo minSelected={1} />
    </section>
  );
}

export interface PreviewVariant {
  key: string;
  provider: SocialProviderName;
  accountName: string;
  avatarUrl: string | null;
  text: string;
  media: WorkspaceMedia[];
  linkUrl: string | null;
  placement?: SocialPlacement;
}

/**
 * Uma prévia por versão (cada rede com o seu texto), lado a lado; a versão
 * aberta no formulário fica marcada. Por baixo de cada uma, o que essa rede
 * recusaria (vermelho) e o que convém rever (âmbar) — as mesmas regras que
 * bloqueiam a aprovação. Clicar numa prévia abre essa versão.
 */
export function ComposerPreviews({
  variants,
  activeKey,
  onSelect,
}: {
  variants: PreviewVariant[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  if (variants.length === 0) {
    return <p className="text-sm text-muted">Escolha em que redes publicar para ver como fica.</p>;
  }
  return (
    <div className={cn('grid justify-items-center gap-4', variants.length > 1 && 'xl:grid-cols-2 xl:items-start')}>
      {variants.map((v) => {
        const issues = validateSocialDraft({ provider: v.provider, text: v.text, media: v.media, linkUrl: v.linkUrl, placement: v.placement });
        const errors = Object.values(issues.errors);
        const warnings = Object.values(issues.warnings);
        const active = v.key === activeKey;
        // Com uma rede só não há o que escolher: sem moldura, prévia centrada na largura de um feed.
        const single = variants.length === 1;
        return (
          <section
            key={v.key}
            className={cn(
              'flex w-full min-w-0 max-w-md flex-col gap-2 rounded-xl',
              !single && 'p-2',
              !single && (active ? 'ring-2 ring-[var(--ring)]' : 'cursor-pointer opacity-80 hover:opacity-100'),
            )}
            onClick={() => !single && !active && onSelect(v.key)}
          >
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <NetworkIcon provider={v.provider} className="text-muted" />
              {PROVIDER_LABEL[v.provider]}
              <span className="truncate font-normal text-muted">· {v.accountName}</span>
            </p>
            <SocialPreview
              provider={v.provider}
              accountName={v.accountName}
              avatarUrl={v.avatarUrl}
              text={v.text}
              media={v.media}
              linkUrl={v.linkUrl}
              placement={v.placement}
            />
            {(errors.length > 0 || warnings.length > 0) && (
              <ul className="flex flex-col gap-1 text-xs">
                {errors.map((msg) => (
                  <li key={msg} className="flex gap-1.5 text-danger">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {msg}
                  </li>
                ))}
                {warnings.map((msg) => (
                  <li key={msg} className="flex gap-1.5 text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {msg}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export interface VariantTab {
  key: string;
  label: string;
  provider: SocialProviderName;
  accountName: string;
  avatarUrl: string | null;
  /** Estado da versão guardada; null = versão nova, ainda por guardar. */
  state: DisplayState | null;
  errors: number;
  dirty: boolean;
}

/** Um separador por rede: cada versão tem o seu texto, imagens, link e horário. */
export function VariantTabs({ tabs, activeKey, onSelect }: { tabs: VariantTab[]; activeKey: string | null; onSelect: (key: string) => void }) {
  return (
    <div role="tablist" aria-label="Versões por rede" className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === activeKey}
          onClick={() => onSelect(t.key)}
          className={cn(
            'flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
            t.key === activeKey ? 'bg-surface font-semibold text-foreground shadow-[var(--shadow-sm)]' : 'text-muted hover:text-foreground',
          )}
        >
          <AccountAvatar name={t.accountName} avatarUrl={t.avatarUrl} provider={t.provider} size="xs" />
          <span className="truncate">{t.label}</span>
          {t.state ? (
            <span className={cn('h-2 w-2 shrink-0 rounded-full', STATE_DOT[t.state])} title={DISPLAY_LABEL[t.state]} />
          ) : (
            <span className="text-muted">· nova</span>
          )}
          {t.errors > 0 && <CircleAlert className="h-3 w-3 shrink-0 text-danger" aria-label={`${t.errors} ponto(s) a corrigir`} />}
          {t.dirty && <span className="text-warning" aria-label="Alterações por guardar">•</span>}
        </button>
      ))}
    </div>
  );
}

/** Contadores por rede escolhida (caracteres e, no Instagram, hashtags). */
export function TextCounters({ providers, length, hashtags }: { providers: SocialProviderName[]; length: number; hashtags: number }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums">
      {providers.map((p) => {
        const limits = SOCIAL_LIMITS[p];
        return (
          <span key={p} className={cn(length > limits.maxText ? 'text-danger' : 'text-muted')}>
            {PROVIDER_LABEL[p]}: {length} / {limits.maxText}
            {p === 'INSTAGRAM' && (
              <span className={cn(hashtags > SOCIAL_LIMITS.INSTAGRAM.maxHashtags && 'text-danger')}>
                {' '}
                · {hashtags} / {SOCIAL_LIMITS.INSTAGRAM.maxHashtags} hashtags
              </span>
            )}
          </span>
        );
      })}
    </p>
  );
}
