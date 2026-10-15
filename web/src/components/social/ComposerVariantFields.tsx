'use client';

import { AlertTriangle, CircleAlert, Copy, CornerUpLeft, ExternalLink, Sparkles } from 'lucide-react';
import { PLACEMENT_LABEL, PLACEMENTS, PROVIDER_LABEL, SOCIAL_LIMITS, countHashtags, textLength, type SocialPlacement, type SocialProviderName } from '@app/social/rules';
import { nextOccurrence } from '@app/social/analyze';
import { Button, Checkbox, Combobox, DatePicker, Field, Input, LinkButton, Segmented, Select, Textarea } from '@/components/ui';
import { ComposerMedia, TextCounters } from './ComposerParts';
import { StateBadge } from './PostBits';
import { toLocalInput } from './format';
import type { BestSlot, WorkspaceMedia, WorkspacePost } from './types';

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export interface VariantFieldsChange {
  text?: string;
  media?: WorkspaceMedia[];
  linkUrl?: string;
  when?: string;
  placement?: SocialPlacement;
}

const PLACEMENT_HINT: Record<SocialPlacement, string> = {
  feed: 'Imagem (4:5) ou carrossel de até 10 imagens, com legenda.',
  reel: '1 vídeo MP4 vertical (9:16), de 3 s a 15 min. Aparece também no feed.',
  story: '1 imagem ou 1 vídeo de até 60 s, vertical (9:16). Fica 24 h. Sem legenda nem link: o texto vai na própria peça.',
};

/**
 * Os campos de UMA versão (uma rede): texto com os limites dessa rede,
 * imagens, link e horário. Num separador ainda vazio, oferece começar pelo
 * texto de outra rede — para adaptar, não para repetir.
 */
export function VariantFields({
  text,
  media,
  linkUrl,
  when,
  provider,
  multi,
  errors,
  bestSlots,
  copyFrom,
  onChange,
  placement,
}: {
  placement: SocialPlacement;
  text: string;
  media: WorkspaceMedia[];
  linkUrl: string;
  when: string;
  provider: SocialProviderName;
  /** Há mais de uma rede: o rótulo diz para qual é este texto. */
  multi: boolean;
  errors: Record<string, string>;
  bestSlots: BestSlot[];
  copyFrom: { provider: SocialProviderName; text: string; media: WorkspaceMedia[] } | null;
  onChange: (change: VariantFieldsChange) => void;
}) {
  const story = provider === 'INSTAGRAM' && placement === 'story';
  return (
    <>
      {provider === 'INSTAGRAM' && (
        <Field label="Formato" hint={PLACEMENT_HINT[placement]} error={errors.placement}>
          <Segmented
            label="Formato no Instagram"
            value={placement}
            onChange={(next) => onChange({ placement: next })}
            options={PLACEMENTS.map((p) => ({ value: p, label: PLACEMENT_LABEL[p] }))}
          />
        </Field>
      )}
      <div className="flex flex-col gap-1.5">
        <Field
          label={story ? 'Notas (não aparecem no story)' : multi ? `Texto para o ${PROVIDER_LABEL[provider]}` : 'Texto'}
          error={errors.text}
        >
          <Textarea rows={9} value={text} onChange={(e) => onChange({ text: e.target.value })} placeholder="O que quer dizer?" />
        </Field>
        <TextCounters providers={[provider]} length={textLength(text)} hashtags={countHashtags(text)} />
        {!text.trim() && copyFrom && (
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => onChange({ text: copyFrom.text, ...(media.length ? {} : { media: copyFrom.media }) })}
          >
            <Copy className="h-3.5 w-3.5" /> Começar pelo texto do {PROVIDER_LABEL[copyFrom.provider]}
          </Button>
        )}
      </div>

      <ComposerMedia
        media={media}
        onChange={(next) => onChange({ media: next })}
        maxLabel={provider === 'INSTAGRAM' && placement !== 'feed' ? '1' : `máx. ${SOCIAL_LIMITS[provider].maxMedia}`}
        label={provider === 'INSTAGRAM' && placement === 'reel' ? 'Vídeo do reel' : story ? 'Imagem ou vídeo do story' : 'Imagens ou vídeo'}
        hint={provider === 'INSTAGRAM' ? PLACEMENT_HINT[placement] : undefined}
        error={errors.mediaAssetIds}
      />

      {!story && (
      <Field
        label="Link"
        hint={provider === 'LINKEDIN' ? 'Vira prévia do link (só sem imagens).' : 'No Instagram não é clicável: use "link na bio".'}
        error={errors.linkUrl}
      >
        <Input type="url" placeholder="https://example.com/blog/..." value={linkUrl} onChange={(e) => onChange({ linkUrl: e.target.value })} />
      </Field>
      )}

      <Field label="Data e hora" hint="Confirmada na aprovação. Vazio = assim que aprovar." error={errors.scheduledAt}>
        <DatePicker type="datetime-local" value={when} onChange={(e) => onChange({ when: e.target.value })} />
      </Field>
      {bestSlots.length > 0 && (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Sparkles className="h-3.5 w-3.5" /> Melhores horários pelo histórico:
          {bestSlots.map((slot) => (
            <button
              key={`${slot.weekday}-${slot.hour}`}
              type="button"
              className="rounded-full bg-surface-2 px-2 py-0.5 text-foreground hover:bg-[var(--active)]"
              onClick={() => onChange({ when: toLocalInput(nextOccurrence(slot, new Date()).toISOString())! })}
            >
              {WEEKDAY[slot.weekday]} {String(slot.hour).padStart(2, '0')}h
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Avisos da versão guardada: falhou, mexer desfaz a aprovação, devolvida com comentário. */
export function VariantNotices({ post, editable }: { post: WorkspacePost; editable: boolean }) {
  const network = PROVIDER_LABEL[post.account.provider];
  return (
    <>
      {post.status === 'FAILED' && post.lastError && (
        <p className="flex gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">A publicação no {network} falhou.</strong> {post.lastError}
          </span>
        </p>
      )}
      {(post.status === 'APPROVED' || post.status === 'FAILED') && editable && (
        <p className="flex gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Mudar texto, imagens ou link devolve o post a rascunho. Mudar só a data, o tema ou o artigo mantém a aprovação.
        </p>
      )}
      {post.review.state === 'returned' && post.review.comment && (
        <p className="flex gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-foreground">
          <CornerUpLeft className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            <strong className="font-semibold">Devolvido{post.review.reviewedBy ? ` por ${post.review.reviewedBy}` : ''}:</strong>{' '}
            {post.review.comment}
          </span>
        </p>
      )}
    </>
  );
}

/** Versão que já não se edita (publicada, a publicar, arquivada ou só leitura). */
export function ReadOnlyVariant({ post }: { post: WorkspacePost }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 text-sm text-muted">
      <p className="flex items-center gap-2">
        <StateBadge state={post.state} /> Este post do {PROVIDER_LABEL[post.account.provider]} já não se edita
        {post.account.access === 'VIEW' ? ' (só tem acesso de leitura a esta conta)' : ''}.
      </p>
      {post.externalUrl && (
        <LinkButton href={post.externalUrl} target="_blank" rel="noreferrer" size="sm" variant="secondary" className="self-start">
          <ExternalLink className="h-3.5 w-3.5" /> Ver na rede
        </LinkButton>
      )}
    </div>
  );
}

/** O que vale para todos os posts criados de uma vez: UTM, tema e artigo de origem. */
export function SharedFields({
  multi,
  utmAuto,
  onUtm,
  utmExample,
  topic,
  onTopic,
  topics,
  sourceId,
  onSource,
  articles,
  error,
}: {
  multi: boolean;
  utmAuto: boolean;
  onUtm: (value: boolean) => void;
  utmExample: string | null;
  topic: string;
  onTopic: (value: string) => void;
  topics: string[];
  sourceId: string;
  onSource: (value: string) => void;
  articles: { id: string; title: string }[];
  error?: string;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-4">
      <p className="text-xs font-semibold text-foreground">{multi ? 'Igual em todos os posts' : 'Organização'}</p>
      <label className="flex items-center gap-2 text-xs text-foreground">
        <Checkbox checked={utmAuto} onChange={(e) => onUtm(e.target.checked)} />
        Acrescentar UTM aos links ao publicar (mede as visitas vindas de cada rede)
      </label>
      {utmExample && <p className="-mt-2 break-all text-xs text-muted">Sai como: {utmExample}</p>}
      <Field label="Tema" hint="Tag interna para filtrar e comparar.">
        <Combobox value={topic} onChange={(v) => onTopic(v)} options={topics.map((t) => ({ value: t, label: t }))} allowCustomValue placeholder="Ex.: Power BI" />
      </Field>
      <Field label="Artigo que divulga" error={error}>
        <Select value={sourceId} onChange={(e) => onSource(e.target.value)}>
          <option value="">Nenhum</option>
          {articles.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </Select>
      </Field>
    </section>
  );
}
