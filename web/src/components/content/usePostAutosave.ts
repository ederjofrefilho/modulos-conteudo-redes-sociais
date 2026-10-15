'use client';

import { useEffect, useRef, useState, type TransitionStartFunction } from 'react';
import { useToast } from '@/components/ui';
import { updatePostAction } from '@/app/(app)/conteudo/actions';
import { toPostForm, type PostEditorPost, type PostForm } from './postForm';

/** Debounce com teto: pausa de 2s salva; digitação contínua além de 10s força um save de qualquer jeito. */
const AUTOSAVE_DEBOUNCE_MS = 2000;
const AUTOSAVE_MAX_WAIT_MS = 10000;

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Estado do formulário do `PostEditor` + autosave: debounce, bloqueio
 * otimista (`contentUpdatedAt`), aviso ao sair da aba e flush no desmonte.
 * `startTransition` vem do editor para que `pending` cubra também as ações
 * de publicar/agendar, que salvam antes (`save(after)`).
 */
export function usePostAutosave(post: PostEditorPost, startTransition: TransitionStartFunction) {
  const { toast } = useToast();
  const initialForm = toPostForm(post);

  const [form, setForm] = useState<PostForm>(initialForm);
  const formRef = useRef<PostForm>(initialForm);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const contentUpdatedAtRef = useRef(post.contentUpdatedAt);

  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [conflict, setConflict] = useState(false);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(
    post.status === 'PUBLISHED' && post.contentUpdatedAt !== post.publishedContentUpdatedAt,
  );
  // A prévia (se aberta) busca uma URL nova a cada mudança desta chave.
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstPendingChangeAt = useRef<number | null>(null);

  function save(after?: () => void, opts: { silent?: boolean } = {}) {
    const { silent = true } = opts;
    if (conflictRef.current) return; // já sabemos que este post mudou por baixo — não empilha mais saves até recarregar
    const payload = formRef.current;
    setStatus('saving');
    startTransition(async () => {
      const res = await updatePostAction(
        post.id,
        {
          title: payload.title,
          slug: payload.slug,
          excerpt: payload.excerpt,
          category: payload.category,
          accent: payload.accent,
          seoTitle: payload.seoTitle || null,
          seoDescription: payload.seoDescription || null,
          ctaHeadline: payload.ctaHeadline || null,
          ctaDescription: payload.ctaDescription || null,
          coverAssetId: payload.coverAssetId,
          blocks: payload.blocks,
          ...(post.kind === 'CASE'
            ? {
                clienteExibicao: payload.clienteExibicao || null,
                setor: payload.setor || null,
                clienteAutorizou: payload.clienteAutorizou,
              }
            : {}),
        },
        contentUpdatedAtRef.current,
      );
      if (!res.ok) {
        setStatus('error');
        // Mensagem exata de `posts.updatePost` (bloqueio otimista) — ver
        // modules/content/src/posts.ts. Substring, não um código de erro
        // dedicado: simples o bastante pro único lugar que precisa distinguir
        // esse caso de qualquer outra falha de validação.
        if (res.error?.includes('outro lugar')) {
          conflictRef.current = true;
          setConflict(true);
        } else if (!silent) {
          toast(res.error ?? 'Não foi possível salvar. Tente de novo.', 'error');
        }
        return;
      }
      if (!res.data) return;
      if (res.data.slug !== formRef.current.slug) {
        formRef.current = { ...formRef.current, slug: res.data.slug };
        setForm((f) => ({ ...f, slug: res.data!.slug }));
      }
      contentUpdatedAtRef.current = res.data.contentUpdatedAt;
      dirtyRef.current = false;
      setDirty(false);
      setStatus('saved');
      setPreviewRefreshKey((k) => k + 1);
      if (post.status === 'PUBLISHED') setHasUnpublishedChanges(true);
      if (!silent) toast('Salvo.', 'success');
      after?.();
    });
  }

  function update(patch: Partial<PostForm>) {
    setForm((f) => {
      const next = { ...f, ...patch };
      formRef.current = next;
      return next;
    });
    dirtyRef.current = true;
    setDirty(true);

    const now = Date.now();
    if (firstPendingChangeAt.current === null) firstPendingChangeAt.current = now;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (now - firstPendingChangeAt.current > AUTOSAVE_MAX_WAIT_MS) {
      firstPendingChangeAt.current = null;
      save();
      return;
    }
    debounceTimer.current = setTimeout(() => {
      firstPendingChangeAt.current = null;
      save();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  // Rede de segurança pra janela entre a última tecla e a confirmação do
  // autosave (não é o mecanismo principal — o debounce de 2s já é curto).
  // `dirtyRef` (não o state `dirty`) porque este listener é registrado uma
  // vez só; ler o state aqui fecharia sobre o valor da primeira renderização.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Flush no desmonte — navegar para outra rota do CRM (Link/router.push) não
  // dispara `beforeunload`, só a saída da aba/janela. Sem isto, a última
  // edição dentro da janela do debounce se perdia ao sair pelo breadcrumb.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (dirtyRef.current) save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label =
    status === 'saving'
      ? 'Salvando...'
      : status === 'error'
        ? 'Falha ao salvar'
        : dirty
          ? 'Alterações pendentes'
          : status === 'saved'
            ? 'Salvo'
            : '';

  return {
    form,
    update,
    save,
    label,
    conflict,
    hasUnpublishedChanges,
    setHasUnpublishedChanges,
    previewRefreshKey,
  };
}
