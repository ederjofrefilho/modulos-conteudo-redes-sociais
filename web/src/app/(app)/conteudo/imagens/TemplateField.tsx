'use client';

import { useState } from 'react';
import { Check, ImagePlus, X } from 'lucide-react';
import { BRAND_MEDIA, BRAND_MEDIA_BY_ID, plainRich, type ImageFieldSpec } from '@app/content/image-templates';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { MediaPicker, type PickedAsset } from '@/components/content/MediaPicker';
import { cn } from '@/lib/cn';

const KIND_LABEL = { mockup: 'Mockup', print: 'Print', photo: 'Foto' } as const;

/** Um campo do modelo: texto (com contador do texto visível), número, escolha ou mídia. */
export function TemplateField({
  field,
  value,
  error,
  onChange,
}: {
  field: ImageFieldSpec;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  if (field.kind === 'media') return <MediaField field={field} value={value} error={error} onChange={onChange} />;
  if (field.kind === 'choice') {
    return (
      <Field label={field.label} error={error} hint={field.hint}>
        <Select value={value || field.default} onChange={(e) => onChange(e.target.value)}>
          {field.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  if (field.kind === 'int') {
    return (
      <Field label={field.label} error={error} required={!field.optional} hint={field.optional ? 'Opcional' : undefined}>
        <Input
          type="number"
          inputMode="numeric"
          min={field.min}
          max={field.max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    );
  }
  const max = field.max ?? 0;
  const length = field.rich ? plainRich(value).length : value.length;
  const over = length > max;
  const hint = [`${length}/${max} caracteres`, field.optional ? 'opcional' : '', field.hint ?? '']
    .filter(Boolean)
    .join(' · ');
  const props = {
    value,
    placeholder: field.placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
  };
  return (
    <Field label={field.label} error={error ?? (over ? `No máximo ${max} caracteres` : undefined)} hint={hint} required={!field.optional}>
      {field.multiline ? <Textarea rows={max > 100 ? 4 : 2} {...props} /> : <Input {...props} />}
    </Field>
  );
}

/**
 * Mídia da peça: catálogo de mockups e prints que vem com o CRM (miniaturas
 * em `/conteudo-midia/miniaturas`) ou qualquer imagem da biblioteca de
 * conteúdo — é por ali que entram prints novos de painel (enviar e escolher).
 */
function MediaField({
  field,
  value,
  error,
  onChange,
}: {
  field: ImageFieldSpec;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<PickedAsset | null>(null);
  const items = BRAND_MEDIA.filter((m) => (field.accepts ?? []).includes(m.kind));
  const fromLibrary = value && !BRAND_MEDIA_BY_ID[value];

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-foreground">
        {field.label}
        {field.optional ? <span className="ml-1 text-xs font-normal text-muted">opcional</span> : null}
      </legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((m) => {
          const active = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              title={m.description}
              onClick={() => onChange(active && field.optional ? '' : m.id)}
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-lg border text-left transition-colors',
                active ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-muted',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura estática do catálogo */}
              <img src={`/conteudo-midia/miniaturas/${m.id}.jpg`} alt="" className="aspect-square w-full bg-surface-2 object-cover" />
              <span className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs text-foreground">
                <span className="truncate">{m.label}</span>
                {active ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
              </span>
              <span className="absolute left-1.5 top-1.5 rounded-full bg-surface px-1.5 text-xs text-muted">
                {KIND_LABEL[m.kind]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
          <ImagePlus className="h-3.5 w-3.5" /> Print da biblioteca
        </Button>
        {fromLibrary ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            {picked ? (
              // eslint-disable-next-line @next/next/no-img-element -- miniatura do Blob
              <img src={picked.url} alt="" className="h-8 w-8 rounded object-cover" />
            ) : null}
            {picked?.alt ?? 'Imagem da biblioteca'}
            <button type="button" aria-label="Tirar a imagem" onClick={() => onChange('')} className="text-muted hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted">Envie um print de painel novo e ele vira mockup na peça.</span>
        )}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(asset) => {
          setPicked(asset);
          onChange(asset.id);
          setPickerOpen(false);
        }}
      />
    </fieldset>
  );
}
