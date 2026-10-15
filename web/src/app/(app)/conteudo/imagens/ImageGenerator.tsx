'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, ImageIcon, Save } from 'lucide-react';
import { IMAGE_TEMPLATES, IMAGE_TEMPLATE_IDS, type ImageTemplateId } from '@app/content/image-templates';
import { Button, Card, CardBody, EmptyState, Field, Input, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { TemplateField } from './TemplateField';

// Texto de exemplo só para a prévia nascer com algo — quem usa troca tudo.
const SAMPLE: Record<ImageTemplateId, Record<string, string>> = {
  'social-cover': {
    title: 'De até 2 semanas para **1 dia** no fechamento do mês.',
    subtitle: 'Como uma operação trocou 11 planilhas por uma base única.',
    media: 'mockup-tablet-dashboard',
  },
  'social-slide': {
    label: 'O que fizemos',
    title: 'Uma base única, ==atualizada a cada 6 minutos.==',
    subtitle: '15 relatórios que se atualizam sozinhos.',
    media: 'print-painel-vendas',
    index: '3',
    total: '5',
  },
  'social-stat': { label: 'O resultado', value: '+7%', caption: 'de margem, com a meta **visível para a equipe.**', source: 'Caso de sucesso' },
  'social-quote': { quote: 'Dado bom é dado que alguém **usa para decidir.**', author: 'Nome do autor', role: 'Cargo, Empresa' },
  'social-mockup': { title: 'Receita, custos e lucro **numa tela só.**', media: 'print-painel-financeiro', frame: 'navegador' },
  'social-cta': {
    title: 'Em qual estágio a sua empresa está **hoje?**',
    subtitle: 'Seis perguntas, cerca de dois minutos.',
    button: 'Faça o diagnóstico',
    media: 'mockup-celular-diagnostico',
  },
  'social-question': {
    title: 'Três planilhas. !!Três respostas.!!',
    questions: 'FIN: Quanto caixa sobra?\nCOM: Qual produto dá lucro?\nOPS: Esse é o da planilha nova?',
  },
  'social-number': {
    label: 'Uma resposta',
    title: 'O mesmo número para **todo mundo.**',
    cards: 'Faturamento do mês: R$ 412.380\nMargem bruta: ==31,8%==',
    source: 'Painel de demonstração (ilustração)',
  },
  'blog-cover': { title: 'Como organizar os dados da sua empresa **antes de investir em IA**', category: 'Dados' },
};

type Issues = { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
type SavedAsset = { id: string; url: string; alt: string };

async function errorOf(res: Response): Promise<{ message: string; fields: Record<string, string> }> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; issues?: Issues };
  const fields: Record<string, string> = {};
  for (const [name, msgs] of Object.entries(data.issues?.fieldErrors ?? {})) if (msgs?.[0]) fields[name] = msgs[0];
  return { message: data.error ?? `Falha (${res.status})`, fields };
}

export function ImageGenerator() {
  const { toast } = useToast();
  const [template, setTemplate] = useState<ImageTemplateId>('social-cover');
  const [values, setValues] = useState<Record<string, string>>(SAMPLE['social-cover']);
  const [alt, setAlt] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedAsset | null>(null);
  const seq = useRef(0);
  const spec = IMAGE_TEMPLATES[template];

  function pick(id: ImageTemplateId) {
    setTemplate(id);
    setValues(SAMPLE[id]);
    setFieldErrors({});
    setSaved(null);
  }

  // Prévia com atraso curto: só redesenha quando a pessoa para de digitar.
  useEffect(() => {
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const res = await fetch('/api/content/assets/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template, fields: values }),
        });
        if (mine !== seq.current) return;
        if (!res.ok) {
          const err = await errorOf(res);
          setFieldErrors(err.fields);
          setPreviewError(Object.keys(err.fields).length ? 'Ajuste os campos destacados.' : err.message);
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
        setFieldErrors({});
        setPreviewError(null);
      } catch {
        if (mine === seq.current) setPreviewError('Não foi possível gerar a prévia.');
      } finally {
        if (mine === seq.current) setLoadingPreview(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [template, values]);

  async function save() {
    if (!alt.trim()) {
      setFieldErrors((e) => ({ ...e, alt: 'Descreva a imagem (texto alternativo) antes de salvar.' }));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/content/assets/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, fields: values, alt }),
      });
      if (!res.ok) {
        const err = await errorOf(res);
        setFieldErrors(err.fields);
        toast(err.message, 'error');
        return;
      }
      setSaved((await res.json()) as SavedAsset);
      toast('Imagem salva na biblioteca de conteúdo.', 'success');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-foreground">Modelo</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {IMAGE_TEMPLATE_IDS.map((id) => {
              const t = IMAGE_TEMPLATES[id];
              const active = id === template;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pick(id)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-foreground hover:bg-border',
                  )}
                >
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className={cn('font-mono text-xs', active ? 'text-primary-foreground' : 'text-muted')}>
                    {t.width}×{t.height}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">{spec.description}</p>
        </fieldset>

        <div className="flex flex-col gap-4">
          {spec.fields.map((field) => (
            <TemplateField
              key={`${template}-${field.name}`}
              field={field}
              value={values[field.name] ?? ''}
              error={fieldErrors[field.name]}
              onChange={(v) => {
                setValues((old) => ({ ...old, [field.name]: v }));
                setSaved(null);
              }}
            />
          ))}
        </div>

        <Field
          label="Texto alternativo (alt)"
          required
          error={fieldErrors.alt}
          hint="Descreve a imagem para quem não a vê. Obrigatório para publicar."
        >
          <Input value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} placeholder="Ex.: Capa com o título do artigo sobre dados" />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} loading={saving} disabled={Boolean(previewError)}>
            <Save className="h-3.5 w-3.5" /> Salvar na biblioteca
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-accent">
              <Check className="h-4 w-4" /> Salva.
              <a href={saved.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                Abrir <ExternalLink className="h-3 w-3" />
              </a>
            </span>
          )}
        </div>
        {saved && (
          <p className="text-xs text-muted">
            Já aparece na biblioteca ao escolher capa ou imagem no editor de post.
          </p>
        )}
      </div>

      <Card className="self-start">
        <CardBody className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="font-mono">
              {spec.width}×{spec.height} · JPEG
            </span>
            {loadingPreview && <span>Atualizando prévia…</span>}
          </div>
          <div
            className="relative w-full overflow-hidden rounded-lg bg-surface-2"
            style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob: local da prévia, sem otimização possível
              <img
                src={preview}
                alt="Prévia da imagem gerada"
                className={cn('h-full w-full object-contain', loadingPreview && 'opacity-60')}
              />
            ) : (
              <EmptyState icon={ImageIcon} title="Gerando prévia" size="inline" />
            )}
          </div>
          {previewError && <p className="text-sm text-danger">{previewError}</p>}
        </CardBody>
      </Card>
    </div>
  );
}
