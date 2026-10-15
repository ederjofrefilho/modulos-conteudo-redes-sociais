'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { syncSocialPostsAction } from '@/app/(app)/social/account-actions';
import Link from 'next/link';
import { Images, Plus, RefreshCw, Search, Settings, Users, X } from 'lucide-react';
import { DISPLAY_LABEL, type DisplayState } from '@app/social/status';
import {
  Badge,
  Button,
  DateRangePicker,
  FilterChip,
  FilterField,
  FiltersPopover,
  IconButton,
  Input,
  Menu,
  MenuItem,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import type { PageTab } from '@/lib/page-chrome';
import { MediaPicker } from '@/components/content/MediaPicker';
import { SocialCalendar } from './SocialCalendar';
import { SocialList } from './SocialList';
import { SocialComposer, type ComposerTarget } from './SocialComposer';
import { PostDetail } from './PostDetail';
import { AccountAvatar } from './AccountAvatar';
import { STATE_ORDER, localDayKey } from './PostBits';
import { asItems, canEditPost, postDate, type BestSlot, type WorkspaceAccount, type WorkspacePost } from './types';

type View = 'calendario' | 'lista';

export interface WorkspaceInitial {
  view: View;
  postId: string | null;
  isNew: boolean;
  articleId: string | null;
}

interface Filters {
  q: string;
  provider: string;
  account: string;
  state: string;
  author: string;
  topic: string;
  from: string;
  to: string;
}

const NO_FILTERS: Filters = { q: '', provider: '', account: '', state: 'ativos', author: '', topic: '', from: '', to: '' };

/**
 * Tela de gestão de posts: a linha de ferramentas (o `<PageHeader>`, desenhado
 * aqui porque filtros e "Novo post" são do cliente), duas vistas da MESMA lista
 * (calendário e lista) e o composer num painel lateral. Os posts vêm todos do
 * servidor e filtram aqui (o volume é de dezenas por mês), por isso trocar de
 * vista ou de filtro é instantâneo. Vista e post aberto ficam na URL.
 */
export function SocialWorkspace({
  posts,
  accounts,
  articles,
  topics,
  bestSlots,
  initial,
  tabs,
  description,
  badges,
  team,
}: {
  /** ADMIN: 'mine' (as dele + as da empresa) ou 'all' (equipa toda); null para quem não é ADMIN. */
  team: 'mine' | 'all' | null;
  /** Peças do cabeçalho que vêm do servidor: abas irmãs, descrição e selos. */
  tabs: PageTab[];
  description: string;
  badges?: React.ReactNode;
  posts: WorkspacePost[];
  accounts: WorkspaceAccount[];
  articles: { id: string; title: string }[];
  topics: string[];
  bestSlots: BestSlot[];
  initial: WorkspaceInitial;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [syncing, startSync] = useTransition();
  // Publicações reais da rede (inclusive as feitas fora do CRM) + métricas, já.
  const sync = () =>
    startSync(async () => {
      const res = await syncSocialPostsAction();
      if (!res.ok || !res.data) return toast(res.error ?? 'Não foi possível atualizar.', 'error');
      const { imported, updated, accounts: n, errors } = res.data;
      if (n === 0) toast('Nenhuma conta sua sincroniza publicações (perfil pessoal do LinkedIn não deixa ler).', 'info');
      else
        toast(
          `${n} conta(s): ${imported} publicação(ões) nova(s), ${updated} atualizada(s).${errors.length ? ` ${errors[0]}` : ''}`,
          errors.length ? 'error' : 'success',
        );
      router.refresh();
    });
  const [view, setView] = useState<View>(initial.view);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Datas e horas são do fuso de quem vê: só se desenham no navegador (o servidor está em UTC).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [target, setTarget] = useState<ComposerTarget | null>(
    initial.isNew ? { mode: 'new', articleId: initial.articleId } : initial.postId ? { mode: 'edit', id: initial.postId } : null,
  );

  // Vista e post aberto refletidos na URL sem navegação do servidor (link partilhável, F5 volta ao mesmo sítio).
  useEffect(() => {
    const sp = new URLSearchParams();
    if (view !== 'calendario') sp.set('vista', view);
    if (target?.mode === 'edit') sp.set('post', target.id);
    if (target?.mode === 'new') sp.set('novo', '1');
    if (team === 'all') sp.set('equipa', '1');
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }, [view, target, pathname, team]);

  const authors = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of posts) map.set(p.author.id, p.author.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [posts]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return posts.filter((p) => {
      if (filters.state === 'ativos' ? p.state === 'ARCHIVED' : filters.state && p.state !== filters.state) return false;
      if (filters.provider && p.account.provider !== filters.provider) return false;
      if (filters.account && p.account.id !== filters.account) return false;
      if (filters.author && p.author.id !== filters.author) return false;
      if (filters.topic && (filters.topic === '__none' ? p.topic : p.topic !== filters.topic)) return false;
      if (q && !`${p.text} ${p.topic ?? ''} ${p.account.displayName}`.toLowerCase().includes(q)) return false;
      if (view === 'lista' && (filters.from || filters.to)) {
        const iso = postDate(p);
        if (!iso) return false;
        const day = localDayKey(new Date(iso));
        if (filters.from && day < filters.from) return false;
        if (filters.to && day > filters.to) return false;
      }
      return true;
    });
  }, [posts, filters, view]);

  const counts = useMemo(() => {
    const out = {} as Record<DisplayState, number>;
    for (const p of posts) out[p.state] = (out[p.state] ?? 0) + 1;
    return out;
  }, [posts]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const dirty = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const open = useCallback((id: string) => setTarget({ mode: 'edit', id }), []);
  const openNew = useCallback((date?: string) => setTarget({ mode: 'new', date: date ?? null, articleId: null }), []);
  const current = target?.mode === 'edit' ? (posts.find((p) => p.id === target.id) ?? null) : null;
  // Cada post é independente: o modal abre só ele, e calendário/lista mostram um item por post.
  const group = useMemo(() => (current ? [current] : []), [current]);
  const readOnly = current !== null && !canEditPost(current);
  const groups = useMemo(() => asItems(filtered), [filtered]);
  const canCreate = accounts.some((a) => a.isActive && (a.access === 'DRAFT' || a.access === 'PUBLISH'));
  const accountLabel = (a: WorkspaceAccount) => (team === 'all' && a.ownerName && !a.shared ? `${a.displayName} (${a.ownerName})` : a.displayName);

  const moreCount = [filters.provider, filters.account, filters.state !== 'ativos', filters.topic, filters.author].filter(Boolean).length;
  const stateLabel = filters.state === '' ? 'Todos os estados' : DISPLAY_LABEL[filters.state as DisplayState];

  return (
    <>
      <PageHeader
        title="Redes sociais"
        description={description}
        tabs={tabs}
        badges={
          badges || team === 'all' ? (
            <>
              {badges}
              {team === 'all' && <Badge tone="info">Equipa toda</Badge>}
            </>
          ) : undefined
        }
        filters={
          <>
            <Segmented
              label="Vista"
              value={view}
              onChange={setView}
              options={[
                { value: 'calendario', label: 'Calendário' },
                { value: 'lista', label: 'Lista' },
              ]}
            />
            <div className="relative w-48 min-w-32 shrink">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <Input
                inputSize="sm"
                aria-label="Buscar posts"
                placeholder="Buscar no texto..."
                className="pl-8"
                value={filters.q}
                onChange={(e) => set({ q: e.target.value })}
              />
            </div>
            {view === 'lista' && (
              <DateRangePicker
                inputSize="sm"
                clearable
                aria-label="Intervalo de datas"
                placeholder="Qualquer data"
                className="w-52"
                from={filters.from}
                to={filters.to}
                onChange={(r) => set({ from: r.from, to: r.to })}
              />
            )}
            <FiltersPopover
              count={moreCount}
              onClear={() => set({ provider: '', account: '', state: 'ativos', topic: '', author: '' })}
            >
              <FilterField label="Conta">
                <Select
                  inputSize="sm"
                  value={filters.account}
                  onChange={(e) => set({ account: e.target.value })}
                  options={[
                    { value: '', label: 'Todas as contas' },
                    ...accounts.map((a) => ({
                      value: a.id,
                      label: accountLabel(a),
                      hint: a.shared ? 'Conta da empresa' : 'Pessoal',
                      icon: <AccountAvatar name={a.displayName} avatarUrl={a.avatarUrl} provider={a.provider} size="xs" />,
                    })),
                  ]}
                />
              </FilterField>
              <FilterField label="Rede">
                <Select inputSize="sm" value={filters.provider} onChange={(e) => set({ provider: e.target.value })}>
                  <option value="">Todas as redes</option>
                  <option value="LINKEDIN">LinkedIn</option>
                  <option value="INSTAGRAM">Instagram</option>
                </Select>
              </FilterField>
              <FilterField label="Estado">
                <Select inputSize="sm" value={filters.state} onChange={(e) => set({ state: e.target.value })}>
                  <option value="ativos">Todos menos arquivados</option>
                  <option value="">Todos os estados</option>
                  {STATE_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {DISPLAY_LABEL[s]}
                      {counts[s] ? ` (${counts[s]})` : ''}
                    </option>
                  ))}
                </Select>
              </FilterField>
              <FilterField label="Tema">
                <Select inputSize="sm" value={filters.topic} onChange={(e) => set({ topic: e.target.value })}>
                  <option value="">Todos os temas</option>
                  <option value="__none">Sem tema</option>
                  {topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </FilterField>
              <FilterField label="Autor">
                <Select inputSize="sm" value={filters.author} onChange={(e) => set({ author: e.target.value })}>
                  <option value="">Todos os autores</option>
                  {authors.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </Select>
              </FilterField>
            </FiltersPopover>
            {filters.provider && (
              <FilterChip label={filters.provider === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'} onRemove={() => set({ provider: '' })} />
            )}
            {filters.account && (
              <FilterChip
                label={accounts.find((a) => a.id === filters.account)?.displayName ?? 'Conta'}
                onRemove={() => set({ account: '' })}
              />
            )}
            {filters.state !== 'ativos' && <FilterChip label={stateLabel} onRemove={() => set({ state: 'ativos' })} />}
            {filters.topic && (
              <FilterChip label={filters.topic === '__none' ? 'Sem tema' : filters.topic} onRemove={() => set({ topic: '' })} />
            )}
            {filters.author && (
              <FilterChip
                label={authors.find(([id]) => id === filters.author)?.[1] ?? 'Autor'}
                onRemove={() => set({ author: '' })}
              />
            )}
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
                <X className="h-3.5 w-3.5" /> Limpar
              </Button>
            )}
          </>
        }
        actions={
          <>
            <IconButton label="Biblioteca de imagens" icon={Images} onClick={() => setLibraryOpen(true)} />
            <Button
              size="sm"
              onClick={() => openNew()}
              disabled={!canCreate}
              title={canCreate ? undefined : 'Ligue uma conta sua ou peça acesso a uma conta da empresa'}
            >
              <Plus className="h-3.5 w-3.5" /> Novo post
            </Button>
            <Menu label="Mais ações de redes sociais">
              <MenuItem>
                <button type="button" onClick={sync} disabled={syncing}>
                  <RefreshCw className={syncing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                  {syncing ? 'A atualizar…' : 'Atualizar publicações da rede'}
                </button>
              </MenuItem>
              {team && (
                <MenuItem>
                  <a href={team === 'all' ? pathname : `${pathname}?equipa=1`}>
                    <Users className="h-3.5 w-3.5" /> {team === 'all' ? 'Ver só as minhas e as da empresa' : 'Ver o calendário da equipa'}
                  </a>
                </MenuItem>
              )}
              <MenuItem>
                <Link href="/settings/social">
                  <Settings className="h-3.5 w-3.5" /> Contas sociais
                </Link>
              </MenuItem>
            </Menu>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 pb-4">
      {!mounted ? (
        <Skeleton className="min-h-0 w-full flex-1 rounded-xl" />
      ) : view === 'calendario' ? (
        <SocialCalendar posts={groups} onOpen={open} onNew={openNew} />
      ) : (
        <SocialList posts={groups} topics={topics} hasAnyPost={posts.length > 0} onOpen={open} onNew={() => openNew()} />
      )}

      {readOnly ? (
        <PostDetail post={current} accounts={accounts} onClose={() => setTarget(null)} onOpen={open} />
      ) : (
        <SocialComposer
          target={target}
          group={group}
          accounts={accounts}
          articles={articles}
          topics={topics}
          bestSlots={bestSlots}
          onClose={() => setTarget(null)}
          onOpen={open}
        />
      )}

      {/* Biblioteca de media reutilizável: a mesma do conteúdo (envio, busca, texto alternativo). */}
      <MediaPicker open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelectMultiple={() => setLibraryOpen(false)} allowVideo minSelected={1} />
      </div>
    </>
  );
}
