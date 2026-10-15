'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Eye, ListTree, Settings2, Trash2 } from 'lucide-react';
import { Badge, Button, ConfirmDialog, Menu, MenuItem, PageHeader, useToast } from '@/components/ui';
import {
  publishPostAction,
  unpublishPostAction,
  duplicatePostAction,
  deletePostAction,
  schedulePostAction,
  cancelScheduleAction,
} from '@/app/(app)/conteudo/actions';
import { PostBodyEditor } from './PostBodyEditor';
import { PostPreviewFrame } from './PostPreviewFrame';
import { MediaPicker, type PickedAsset } from './MediaPicker';
import { StructurePanel } from './StructurePanel';
import { PostSettingsDrawer } from './PostSettingsDrawer';
import { PublishControls } from './PublishControls';
import { STATUS_META } from './meta';
import { postReadiness, type PostEditorPost } from './postForm';
import { usePostAutosave } from './usePostAutosave';

export type { PostEditorPost } from './postForm';

export function PostEditor({
  post,
  categories,
  initialAssetsById,
  initialCover,
  promotion,
}: {
  post: PostEditorPost;
  categories: string[];
  initialAssetsById: Record<string, PickedAsset>;
  initialCover: PickedAsset | null;
  /** Seção "Divulgação" (posts sociais deste artigo), montada no servidor. */
  promotion?: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const { form, update, save, label: autosaveLabel, conflict, hasUnpublishedChanges, setHasUnpublishedChanges, previewRefreshKey } =
    usePostAutosave(post, startTransition);

  const [cover, setCover] = useState<PickedAsset | null>(initialCover);
  const [assetsById, setAssetsById] = useState<Record<string, PickedAsset>>(initialAssetsById);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');

  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (post.title === 'Sem título' && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = 'auto';
      titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
    }
  }, [form.title]);

  function publish() {
    save(() => {
      startTransition(async () => {
        const res = await publishPostAction(post.id);
        if (res.ok) {
          toast(post.status === 'PUBLISHED' ? 'Publicação atualizada.' : 'Publicado.', 'success');
          setHasUnpublishedChanges(false);
          router.refresh();
        } else {
          const issues = res.fieldErrors ? Object.values(res.fieldErrors).flat().filter(Boolean).join(' · ') : undefined;
          toast(issues || res.error || 'Não foi possível publicar.', 'error');
        }
      });
    }, { silent: false });
  }

  function unpublish() {
    startTransition(async () => {
      const res = await unpublishPostAction(post.id);
      if (res.ok) {
        toast('Despublicado.', 'success');
        router.refresh();
      } else {
        toast(res.error ?? 'Não foi possível despublicar. Tente de novo.', 'error');
      }
    });
  }

  function schedule() {
    if (!scheduleValue) {
      toast('Escolha data e hora.', 'error');
      return;
    }
    const iso = new Date(scheduleValue).toISOString();
    save(() => {
      startTransition(async () => {
        const res = await schedulePostAction(post.id, iso);
        if (res.ok) {
          toast('Agendado.', 'success');
          setScheduleOpen(false);
          router.refresh();
        } else {
          const issues = res.fieldErrors ? Object.values(res.fieldErrors).flat().filter(Boolean).join(' · ') : undefined;
          toast(issues || res.error || 'Não foi possível agendar.', 'error');
        }
      });
    }, { silent: false });
  }

  function cancelScheduling() {
    startTransition(async () => {
      const res = await cancelScheduleAction(post.id);
      if (res.ok) {
        toast('Agendamento cancelado.', 'success');
        router.refresh();
      } else {
        toast(res.error ?? 'Não foi possível cancelar agendamento. Tente de novo.', 'error');
      }
    });
  }

  function duplicate() {
    startTransition(async () => {
      const res = await duplicatePostAction(post.id);
      if (res.ok && res.data) {
        toast('Duplicado.', 'success');
        router.push(`/conteudo/${res.data.id}`);
      } else {
        toast(res.error ?? 'Não foi possível duplicar. Tente de novo.', 'error');
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deletePostAction(post.id);
      setConfirmingDelete(false);
      if (res.ok) {
        toast('Excluído.', 'success');
        router.push('/conteudo');
      } else {
        toast(res.error ?? 'Não foi possível excluir. Tente de novo.', 'error');
      }
    });
  }

  const readiness = postReadiness(form, post.kind, assetsById);
  const readyToPublish = readiness.every((i) => i.ok);

  function focusField(fieldId: string) {
    setSettingsOpen(true);
    requestAnimationFrame(() => {
      const el = document.getElementById(fieldId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el?.querySelector('input,textarea,button') as HTMLElement | null)?.focus?.();
    });
  }

  const statusMeta = STATUS_META[post.status];

  return (
    <div className="flex h-full flex-col">
      {conflict && (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-3 bg-danger px-4 py-2 text-center text-sm text-danger-foreground">
          Este post foi alterado em outro lugar (outra aba ou outra pessoa). Suas últimas edições NÃO foram salvas —
          recarregue a página para ver a versão atual antes de continuar.
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              // Reload de verdade, não `router.refresh()`: o estado local do
              // formulário (`useState(initialForm)`) só é inicializado uma vez
              // no mount — um refresh do RSC troca a prop `post`, mas não
              // reseta o form já montado. Precisa da página inteira de novo.
              window.location.reload();
            }}
          >
            Recarregar
          </Button>
        </div>
      )}
      {/* Barra superior = cabeçalho da página (PageHeader de uma linha). O
          título é o tipo do post: o título do post é o campo editável do
          canvas, e repeti-lo aqui duplicaria o h1. */}
      <div className="sticky top-0 z-20 bg-surface-2/90 px-4 backdrop-blur sm:px-6">
        <PageHeader
          showTitle
          className="bg-transparent! lg:static!"
          leading={
            <Link
              href="/conteudo"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
              title="Voltar para Conteúdo"
              aria-label="Voltar para Conteúdo"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          }
          title={post.kind === 'CASE' ? 'Caso de sucesso' : 'Artigo'}
          badges={<Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>}
          meta={autosaveLabel || undefined}
          actions={
            <>
              <Button
                variant={structureOpen ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setStructureOpen((v) => !v)}
                className="hidden md:inline-flex"
              >
                <ListTree className="h-3.5 w-3.5" /> Estrutura
              </Button>

              <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
                <Eye className="h-3.5 w-3.5" /> Prévia
              </Button>

              <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)} className="relative">
                <Settings2 className="h-3.5 w-3.5" /> Configurações
                {!readyToPublish && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-surface" />
                )}
              </Button>

              <PublishControls
                status={post.status}
                pending={pending}
                hasUnpublishedChanges={hasUnpublishedChanges}
                scheduledAt={post.scheduledAt}
                onPublish={publish}
                onUnpublish={unpublish}
                onCancelSchedule={cancelScheduling}
                scheduleOpen={scheduleOpen}
                setScheduleOpen={setScheduleOpen}
                scheduleValue={scheduleValue}
                setScheduleValue={setScheduleValue}
                onSchedule={schedule}
              />

              <Menu label="Mais ações">
                <MenuItem>
                  <button type="button" onClick={duplicate} disabled={pending}>
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </button>
                </MenuItem>
                <MenuItem destructive>
                  <button type="button" onClick={() => setConfirmingDelete(true)} disabled={pending}>
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </MenuItem>
              </Menu>
            </>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {structureOpen && (
          <div className="hidden w-56 shrink-0 overflow-y-auto bg-surface-2/40 p-3 md:block">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Estrutura</p>
            <StructurePanel blocks={form.blocks} />
          </div>
        )}
        {/* Canvas — só título e corpo, nada mais */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-10 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <textarea
              ref={titleRef}
              value={form.title}
              onChange={(e) => update({ title: e.target.value })}
              rows={1}
              placeholder="Título do post"
              aria-label="Título do post"
              className="w-full resize-none overflow-hidden border-none bg-transparent text-3xl font-semibold leading-tight text-foreground outline-none placeholder:text-muted focus-visible:shadow-[inset_0_-1.5px_0_var(--ring-field)] sm:text-4xl"
            />
            <div className="mt-8" id="field-blocks">
              <PostBodyEditor
                initialBlocks={post.blocks}
                onChange={(blocks) => update({ blocks })}
                assetsById={assetsById}
                onAssetPicked={(asset) => setAssetsById((prev) => ({ ...prev, [asset.id]: asset }))}
              />
            </div>
          </div>
        </div>
      </div>

      <PostSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        kind={post.kind}
        form={form}
        update={update}
        categories={categories}
        cover={cover}
        onPickCover={() => setCoverPickerOpen(true)}
        readiness={readiness}
        onFocusField={focusField}
        promotion={promotion}
      />

      <MediaPicker
        open={coverPickerOpen}
        onClose={() => setCoverPickerOpen(false)}
        onSelect={(asset) => {
          setCover(asset);
          update({ coverAssetId: asset.id });
          setAssetsById((prev) => ({ ...prev, [asset.id]: asset }));
        }}
      />

      <PostPreviewFrame open={previewOpen} onClose={() => setPreviewOpen(false)} postId={post.id} refreshKey={previewRefreshKey} />

      <ConfirmDialog
        open={confirmingDelete}
        title="Excluir post"
        message={`Excluir "${form.title}"? Não é possível desfazer.`}
        pending={pending}
        onConfirm={remove}
        onClose={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
