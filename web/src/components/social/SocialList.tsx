'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArrowDown, ArrowUp, Copy, ExternalLink, Share2, Tag } from 'lucide-react';
import { PLACEMENT_LABEL, PROVIDER_LABEL } from '@app/social/rules';
import { DISPLAY_LABEL } from '@app/social/status';
import { FORMAT_LABEL } from '@app/social/metrics';
import { Button, Checkbox, Combobox, ConfirmDialog, Dialog, EmptyState, Field, Menu, MenuItem, useToast } from '@/components/ui';
import {
  archiveSocialPostsAction,
  duplicateSocialPostAction,
  setSocialPostsTopicAction,
} from '@/app/(app)/social/actions';
import { cn } from '@/lib/cn';
import { PostThumb, StateBadge, dateTimeLabel, snippet } from './PostBits';
import { postDate, type WorkspaceGroup } from './types';
import { MediaThumb } from '@/components/content/MediaThumb';
import { REMOTE_TYPE_LABEL } from '@app/social/remote';
import { AccountAvatar } from './AccountAvatar';

type SortKey = 'when' | 'state' | 'network' | 'topic' | 'author';

const TH = 'sticky top-0 z-10 bg-surface px-3 py-2 text-left text-xs font-medium text-muted';

/**
 * Lista de posts com seleção e ações em massa (arquivar, definir tema,
 * duplicar). Aprovar NÃO é ação em massa de propósito: cada post é aprovado
 * com a pré-visualização à frente, no painel. A tabela é a única região que rola.
 */
export function SocialList({
  posts,
  topics,
  hasAnyPost,
  onOpen,
  onNew,
}: {
  /** Uma linha por publicação (as versões de cada rede juntas). */
  posts: WorkspaceGroup[];
  topics: string[];
  hasAnyPost: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'when', dir: -1 });
  const [dialog, setDialog] = useState<null | 'archive' | 'topic'>(null);
  const [topic, setTopic] = useState('');

  const sorted = useMemo(() => {
    const value = (p: WorkspaceGroup): string => {
      if (sort.key === 'when') return postDate(p) ?? (sort.dir === 1 ? '9999' : '0000');
      if (sort.key === 'state') return p.state;
      if (sort.key === 'network') return p.account.displayName;
      if (sort.key === 'topic') return p.topic ?? '';
      return p.author.name;
    };
    return [...posts].sort((a, b) => value(a).localeCompare(value(b)) * sort.dir || b.createdAt.localeCompare(a.createdAt));
  }, [posts, sort]);

  const visibleSelected = sorted.filter((p) => selected.has(p.id)).map((p) => p.id);
  const allSelected = sorted.length > 0 && visibleSelected.length === sorted.length;
  // As ações em massa valem para todas as versões da publicação.
  const variantIds = (groupIds: string[]) => sorted.filter((g) => groupIds.includes(g.id)).flatMap((g) => g.variants.map((v) => v.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run(work: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const { ok, message } = await work();
      setDialog(null);
      toast(message, ok ? 'success' : 'error');
      if (ok) setSelected(new Set());
      router.refresh();
    });
  }

  const archive = (ids: string[]) =>
    run(async () => {
      const res = await archiveSocialPostsAction(ids);
      if (!res.ok || !res.data) return { ok: false, message: res.error ?? 'Não foi possível arquivar.' };
      const { done, failed } = res.data;
      return {
        ok: done > 0,
        message: failed ? `${done} arquivado(s); ${failed} não puderam (a publicar ou já arquivados).` : `${done} post(s) arquivado(s).`,
      };
    });

  const applyTopic = () =>
    run(async () => {
      const res = await setSocialPostsTopicAction(variantIds(visibleSelected), topic.trim() || null);
      return { ok: res.ok, message: res.ok ? `Tema atualizado em ${res.data?.done ?? 0} post(s).` : (res.error ?? 'Não foi possível definir o tema.') };
    });

  // Copiar uma publicação: as versões copiadas ficam juntas numa campanha nova.
  const duplicate = (groupIds: string[]) =>
    run(async () => {
      let created: string | null = null;
      const groups = sorted.filter((g) => groupIds.includes(g.id));
      for (const [i, g] of groups.entries()) {
        const key = g.variants.length > 1 ? `camp-${Date.now().toString(36)}-${i}` : null;
        for (const v of g.variants) {
          const res = await duplicateSocialPostAction(v.id, undefined, key);
          if (!res.ok) return { ok: false, message: res.error ?? 'Não foi possível duplicar.' };
          created = created ?? res.data?.id ?? null;
        }
      }
      if (groups.length === 1 && created) onOpen(created);
      return { ok: true, message: groups.length === 1 ? 'Cópia criada como rascunho.' : `${groups.length} cópias criadas como rascunho.` };
    });

  if (sorted.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-surface">
        <EmptyState
          icon={Share2}
          title={hasAnyPost ? 'Nenhum post com estes filtros' : 'Ainda não há posts'}
          description={
            hasAnyPost
              ? 'Mude ou limpe os filtros para ver mais.'
              : 'Escreva o primeiro aqui, ou peça ao Claude para preparar os posts (create_social_post).'
          }
          action={
            <Button size="sm" onClick={onNew}>
              Novo post
            </Button>
          }
        />
      </div>
    );
  }

  const header = (key: SortKey, label: string, className?: string) => (
    <th className={cn(TH, className)} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {visibleSelected.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
          <span className="font-medium text-foreground">{visibleSelected.length} selecionado(s)</span>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDialog('topic')}>
            <Tag className="h-3.5 w-3.5" /> Definir tema
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => duplicate(visibleSelected)}>
            <Copy className="h-3.5 w-3.5" /> Duplicar
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDialog('archive')}>
            <Archive className="h-3.5 w-3.5" /> Arquivar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={cn(TH, 'w-10')}>
                <Checkbox
                  aria-label="Selecionar todos"
                  checked={allSelected}
                  indeterminate={!allSelected && visibleSelected.length > 0}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(sorted.map((p) => p.id)))}
                />
              </th>
              <th className={cn(TH, 'w-[42%]')}>Post</th>
              {header('network', 'Conta')}
              {header('state', 'Estado')}
              {header('when', 'Quando')}
              {header('topic', 'Tema')}
              {header('author', 'Autor')}
              <th className={cn(TH, 'w-10')} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const states = [...new Set(p.variants.map((v) => v.state))];
              return (
                <tr key={p.id} className="group cursor-pointer hover:bg-[var(--hover)]" onClick={() => onOpen(p.id)}>
                  <td className="border-t border-border px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox aria-label={`Selecionar: ${snippet(p.text, 40)}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td className="w-[42%] max-w-0 border-t border-border px-3 py-2">
                    <button type="button" className="flex w-full min-w-0 items-center gap-3 text-left" onClick={() => onOpen(p.id)}>
                      {p.media[0] ? (
                        <MediaThumb url={p.media[0].url} alt="" mimeType={p.media[0].mimeType} className="h-9 w-9 shrink-0 rounded-md" />
                      ) : p.thumbUrl ? (
                        <PostThumb url={p.thumbUrl} className="h-9 w-9 rounded-md" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-xs text-muted">
                          {FORMAT_LABEL[p.format].slice(0, 3)}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-foreground">{snippet(p.text, 110)}</span>
                        <span className="block truncate text-xs text-muted">
                          {p.placement !== 'feed'
                            ? PLACEMENT_LABEL[p.placement]
                            : p.remote && !p.media.length
                              ? REMOTE_TYPE_LABEL[p.remote.type]
                              : FORMAT_LABEL[p.format]}
                          {p.variants.length > 1 ? ` · ${p.variants.length} redes` : ''}
                          {p.media.length > 1 ? ` · ${p.media.length} imagens` : ''}
                          {p.remote && p.remote.items.length > 1 ? ` · ${p.remote.items.length} itens` : ''}
                          {p.origin === 'imported' ? ' · publicado direto na rede' : ''}
                          {p.review.state === 'pending' ? ' · à espera de aprovação' : p.review.state === 'returned' ? ' · devolvido' : ''}
                          {p.state === 'FAILED' && p.lastError ? ` · ${p.lastError}` : ''}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="whitespace-nowrap border-t border-border px-3 py-2 text-foreground">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      {p.variants.map((v) => (
                        <AccountAvatar key={v.id} name={v.account.displayName} avatarUrl={v.account.avatarUrl} provider={v.account.provider} />
                      ))}
                      <span className="max-w-40 truncate">
                        {p.variants.length > 1 ? p.variants.map((v) => PROVIDER_LABEL[v.account.provider]).join(' + ') : p.account.displayName}
                      </span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-t border-border px-3 py-2">
                    {states.length === 1 ? (
                      <StateBadge state={states[0]!} />
                    ) : (
                      <span className="flex flex-col items-start gap-0.5">
                        {p.variants.map((v) => (
                          <span key={v.id} className="text-xs text-muted" title={DISPLAY_LABEL[v.state]}>
                            {PROVIDER_LABEL[v.account.provider]}: <StateBadge state={v.state} />
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-t border-border px-3 py-2 tabular-nums text-foreground">{dateTimeLabel(postDate(p))}</td>
                  <td className="whitespace-nowrap border-t border-border px-3 py-2 text-muted">{p.topic ?? '–'}</td>
                  <td className="whitespace-nowrap border-t border-border px-3 py-2 text-muted">{p.author.name}</td>
                  <td className="border-t border-border px-1 py-2" onClick={(e) => e.stopPropagation()}>
                    <Menu label="Ações do post">
                      <MenuItem>
                        <button type="button" onClick={() => duplicate([p.id])}>
                          <Copy className="h-4 w-4" /> Duplicar
                        </button>
                      </MenuItem>
                      {p.externalUrl && (
                        <MenuItem>
                          <button type="button" onClick={() => window.open(p.externalUrl!, '_blank', 'noreferrer')}>
                            <ExternalLink className="h-4 w-4" /> Ver na rede
                          </button>
                        </MenuItem>
                      )}
                      {p.variants.some((v) => v.status !== 'ARCHIVED' && v.status !== 'PUBLISHING') && (
                        <MenuItem>
                          <button type="button" onClick={() => archive(p.variants.map((v) => v.id))}>
                            <Archive className="h-4 w-4" /> Arquivar
                          </button>
                        </MenuItem>
                      )}
                    </Menu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={dialog === 'archive'}
        title={`Arquivar ${visibleSelected.length} publicação(ões)?`}
        message="Saem da fila e não serão publicados. Os que já foram publicados continuam na rede."
        confirmLabel="Arquivar"
        pending={pending}
        onClose={() => setDialog(null)}
        onConfirm={() => archive(variantIds(visibleSelected))}
      />
      <Dialog open={dialog === 'topic'} title="Definir tema" onClose={() => setDialog(null)}>
        <Field label="Tema" hint="Vazio tira o tema. Mudar o tema não desfaz aprovações.">
          <Combobox
            value={topic}
            onChange={(v) => setTopic(v)}
            options={topics.map((t) => ({ value: t, label: t }))}
            allowCustomValue
            placeholder="Escolha ou escreva um tema"
          />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDialog(null)} disabled={pending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={applyTopic} loading={pending}>
            Aplicar a {visibleSelected.length}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
