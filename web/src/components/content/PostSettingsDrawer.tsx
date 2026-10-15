'use client';

import { Check, CheckCircle2, Circle } from 'lucide-react';
import { Checkbox, Combobox, Drawer, Field, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { PickedAsset } from './MediaPicker';
import type { ContentKindLike } from './meta';
import type { PostForm, ReadinessItem } from './postForm';

const ACCENT_OPTIONS: { value: string; label: string; className: string }[] = [
  { value: 'blue', label: 'Azul', className: 'bg-blue' },
  { value: 'teal', label: 'Verde-azulado', className: 'bg-teal' },
  { value: 'crimson', label: 'Carmim', className: 'bg-crimson' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</p>;
}

/**
 * Configurações do post (slug, capa, SEO, caso de sucesso, chamada final e o
 * checklist de prontidão) — sempre um painel deslizante, em qualquer tamanho
 * de tela.
 */
export function PostSettingsDrawer({
  open,
  onClose,
  kind,
  form,
  update,
  categories,
  cover,
  onPickCover,
  readiness,
  onFocusField,
  promotion,
}: {
  open: boolean;
  onClose: () => void;
  kind: ContentKindLike;
  form: PostForm;
  update: (patch: Partial<PostForm>) => void;
  categories: string[];
  cover: PickedAsset | null;
  onPickCover: () => void;
  readiness: ReadinessItem[];
  onFocusField: (fieldId: string) => void;
  promotion?: React.ReactNode;
}) {
  const pathSegment = kind === 'CASE' ? 'casos' : 'blog';

  return (
    <Drawer open={open} title="Configurações do post" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <Field label="Slug" hint="kebab-case — vira parte da URL pública">
            <div id="field-slug" className="flex flex-col gap-1">
              <Input value={form.slug} onChange={(e) => update({ slug: e.target.value })} />
              <span className="font-mono text-xs text-muted">
                example.com/{pathSegment}/{form.slug || '...'}
              </span>
            </div>
          </Field>
          <Field label="Resumo" hint="Usado em listagens e compartilhamento">
            <Textarea
              rows={2}
              value={form.excerpt}
              onChange={(e) => update({ excerpt: e.target.value })}
            />
          </Field>
          <Field label="Categoria">
            <div id="field-category">
              <Combobox
                value={form.category}
                onChange={(value) => update({ category: value })}
                options={categories.map((c) => ({ value: c, label: c }))}
                allowCustomValue
                placeholder="Escolha ou digite uma categoria"
                searchPlaceholder="Buscar categoria..."
              />
            </div>
          </Field>
          <Field label="Cor de destaque" hint="Token usado pelo site">
            <div className="flex items-center gap-2.5">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.label}
                  aria-label={opt.label}
                  aria-pressed={form.accent === opt.value}
                  onClick={() => update({ accent: opt.value })}
                  className={cn(
                    'h-7 w-7 rounded-full transition-transform',
                    opt.className,
                    form.accent === opt.value
                      ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-surface'
                      : 'hover:scale-105',
                  )}
                >
                  {form.accent === opt.value && (
                    <Check className="mx-auto h-3.5 w-3.5 text-on-media" />
                  )}
                </button>
              ))}
              {form.accent && !ACCENT_OPTIONS.some((o) => o.value === form.accent) && (
                <span className="text-xs text-muted">atual: {form.accent}</span>
              )}
            </div>
          </Field>
        </section>

        <section className="flex flex-col gap-3 pt-5" id="field-cover">
          <SectionLabel>Capa</SectionLabel>
          <button
            type="button"
            onClick={onPickCover}
            aria-label={cover ? 'Trocar capa' : 'Escolher capa'}
            className="flex h-32 w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-sm text-muted hover:bg-border"
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- host do Blob é dinâmico
              <img src={cover.url} alt={cover.alt} className="h-full w-full object-cover" />
            ) : (
              'Escolher capa'
            )}
          </button>
        </section>

        <section className="flex flex-col gap-3 pt-5">
          <SectionLabel>SEO</SectionLabel>
          <Field label="Título de SEO (opcional)">
            <Input value={form.seoTitle} onChange={(e) => update({ seoTitle: e.target.value })} />
          </Field>
          <Field
            label="Descrição de SEO"
            required
            hint={`${form.seoDescription.length}/160 caracteres`}
            error={form.seoDescription.length > 160 ? 'Mais de 160 caracteres.' : undefined}
          >
            <div id="field-seoDescription">
              <Textarea
                rows={2}
                value={form.seoDescription}
                onChange={(e) => update({ seoDescription: e.target.value })}
              />
            </div>
          </Field>
          <div className="rounded-lg bg-surface-2/70 p-3">
            <p className="truncate text-sm text-primary">
              {form.seoTitle || form.title || 'Título do post'}
            </p>
            <p className="truncate font-mono text-xs text-accent">
              example.com › {pathSegment} › {form.slug || 'slug'}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">
              {form.seoDescription ||
                'A descrição de SEO aparece aqui — como no resultado do Google.'}
            </p>
          </div>
        </section>

        {kind === 'CASE' && (
          <section className="flex flex-col gap-3 pt-5">
            <SectionLabel>Caso de sucesso</SectionLabel>
            <Field label="Cliente (como aparece no post)">
              <Input
                value={form.clienteExibicao}
                onChange={(e) => update({ clienteExibicao: e.target.value })}
                placeholder="Deixe vazio para não identificar o cliente"
              />
            </Field>
            <Field label="Setor">
              <Input value={form.setor} onChange={(e) => update({ setor: e.target.value })} />
            </Field>
            <div id="field-clienteAutorizou">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={form.clienteAutorizou}
                  onChange={(e) => update({ clienteAutorizou: e.target.checked })}
                />
                Cliente autorizou usar o nome
              </label>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3 pt-5">
          <SectionLabel>Fim do post</SectionLabel>
          <Field label="Título da chamada (opcional)">
            <Input
              value={form.ctaHeadline}
              onChange={(e) => update({ ctaHeadline: e.target.value })}
            />
          </Field>
          <Field label="Descrição da chamada (opcional)">
            <Input
              value={form.ctaDescription}
              onChange={(e) => update({ ctaDescription: e.target.value })}
            />
          </Field>
        </section>

        <section className="flex flex-col gap-2 pt-5">
          <SectionLabel>Prontidão para publicar</SectionLabel>
          <ul className="flex flex-col gap-1.5">
            {readiness.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onFocusField(item.fieldId)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs transition-colors hover:bg-surface-2"
                >
                  {item.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-muted" />
                  )}
                  <span className={item.ok ? 'text-muted' : 'text-foreground'}>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {promotion && (
          <section className="flex flex-col gap-2 pt-5">
            <SectionLabel>Divulgação</SectionLabel>
            {promotion}
          </section>
        )}
      </div>
    </Drawer>
  );
}
