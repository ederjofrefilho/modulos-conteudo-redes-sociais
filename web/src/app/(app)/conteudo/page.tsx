import { posts } from '@app/content';
import { ContentKind, ContentStatus } from '@app/db';
import { ImagePlus, Newspaper } from 'lucide-react';
import { Avatar, Badge, Card, DataTable, EmptyState, IconLinkButton, PageHeader, PageShell } from '@/components/ui';
import { UrlParamSelect } from '@/components/UrlParamSelect';
import { SearchInput } from '@/components/SearchInput';
import { SortHeader, Pagination } from '@/components/ListControls';
import { OwnerFilter } from '@/components/OwnerFilter';
import { TransitionLink } from '@/components/TransitionLink';
import { CategoryFilter } from '@/components/content/CategoryFilter';
import { NewPostMenu } from '@/components/content/NewPostMenu';
import { ContentRowActionsMenu } from '@/components/content/ContentRowActionsMenu';
import { BulkPublishButton, BulkUnpublishButton } from '@/components/content/BulkContentStatusButtons';
import { BulkSetCategoryButton } from '@/components/content/BulkSetCategoryButton';
import { BulkDeleteButton } from '@/components/BulkDeleteButton';
import { STATUS_META, KIND_LABEL } from '@/components/content/meta';
import { requireCtx } from '@/lib/session';
import { bulkPublishPostsAction, bulkUnpublishPostsAction, bulkSetCategoryPostsAction, bulkDeletePostsAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conteúdo' };

const PAGE_SIZE = 20;

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    kind?: string;
    status?: string;
    category?: string;
    mine?: string;
  }>;
}) {
  const { q, page: pageParam, sort, kind: kindParam, status: statusParam, category, mine } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const kind = kindParam && kindParam in KIND_LABEL ? (kindParam as ContentKind) : undefined;
  const status = statusParam && statusParam in STATUS_META ? (statusParam as ContentStatus) : undefined;

  const ctx = await requireCtx();
  const [{ items, total }, categories] = await Promise.all([
    posts.listPosts({
      q,
      sort,
      kind,
      status,
      category: category || undefined,
      authorId: mine === '1' ? ctx.actor.id : undefined,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    posts.listCategories(),
  ]);

  const extra = { kind, status, category, mine };

  return (
    <PageShell fill>
      <PageHeader
        title="Conteúdo"
        description="Artigos do blog e casos de sucesso publicados no site."
        filters={
          <>
            <SearchInput placeholder="Buscar por título, resumo ou slug..." />
            <UrlParamSelect
              param="kind"
              label="Tipo"
              className="w-36"
              options={[
                { value: '', label: 'Todos os tipos' },
                { value: 'ARTICLE', label: 'Artigos' },
                { value: 'CASE', label: 'Casos de sucesso' },
              ]}
            />
            <UrlParamSelect
              param="status"
              label="Status"
              className="w-40"
              options={[
                { value: '', label: 'Todos os status' },
                { value: 'DRAFT', label: 'Rascunho' },
                { value: 'SCHEDULED', label: 'Agendado' },
                { value: 'PUBLISHED', label: 'Publicado' },
                { value: 'ARCHIVED', label: 'Despublicado' },
              ]}
            />
            <CategoryFilter categories={categories} />
            <OwnerFilter />
          </>
        }
        meta={`${total} post(s)`}
        actions={
          <>
            <IconLinkButton href="/conteudo/imagens" label="Gerar imagem" icon={ImagePlus} />
            <NewPostMenu />
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col pb-4">
        <Card className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden">
          {items.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title={q ? `Nada encontrado para "${q}"` : 'Nenhum post ainda'}
              description={
                q
                  ? 'Tente outro termo ou limpe a busca.'
                  : 'Artigos e casos de sucesso escritos aqui — via Claude (MCP) ou direto no editor.'
              }
              action={!q ? <NewPostMenu /> : undefined}
            />
          ) : (
            <DataTable
              selectable
              storageKey="content-list"
              bulkActionsSlot={
                <>
                  <BulkPublishButton action={bulkPublishPostsAction} />
                  <BulkUnpublishButton action={bulkUnpublishPostsAction} />
                  <BulkSetCategoryButton action={bulkSetCategoryPostsAction} />
                  <BulkDeleteButton entityNamePlural="post(s)" action={bulkDeletePostsAction} />
                </>
              }
              columns={[
                {
                  key: 'title',
                  header: <SortHeader base="/conteudo" label="Título" field="title" current={sort} q={q} extra={extra} />,
                  label: 'Título',
                  essential: true,
                },
                { key: 'kind', header: 'Tipo', label: 'Tipo' },
                { key: 'status', header: 'Status', label: 'Status' },
                { key: 'category', header: 'Categoria', label: 'Categoria', hiddenByDefault: true },
                { key: 'author', header: 'Autor', label: 'Autor', hiddenByDefault: true },
                {
                  key: 'updatedAt',
                  header: (
                    <SortHeader base="/conteudo" label="Atualizado" field="updated" current={sort} q={q} extra={extra} />
                  ),
                  label: 'Atualizado',
                  align: 'right',
                },
              ]}
              rows={items.map((p: any) => ({
                id: p.id,
                href: `/conteudo/${p.id}`,
                cells: {
                  title: (
                    <TransitionLink href={`/conteudo/${p.id}`} className="flex items-center gap-3">
                      {p.coverAsset ? (
                        // eslint-disable-next-line @next/next/no-img-element -- host do Blob é dinâmico
                        <img
                          src={p.coverAsset.url}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                          <Newspaper className="h-4 w-4" />
                        </div>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">{p.title}</span>
                        <span className="block truncate text-xs text-muted">{p.excerpt || p.slug}</span>
                      </span>
                    </TransitionLink>
                  ),
                  kind: <span className="text-muted">{KIND_LABEL[p.kind as ContentKind]}</span>,
                  status: (
                    <div className="flex flex-col gap-0.5">
                      <Badge tone={STATUS_META[p.status as ContentStatus].tone}>
                        {STATUS_META[p.status as ContentStatus].label}
                      </Badge>
                      {p.status === 'SCHEDULED' && p.scheduledAt && (
                        <span className="text-xs text-muted">
                          {new Date(p.scheduledAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  ),
                  category: p.category ? <Badge>{p.category}</Badge> : <span className="text-muted">—</span>,
                  author: p.author ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={p.author.name ?? p.author.email} size="sm" />
                      <span className="truncate text-muted">{p.author.name ?? p.author.email}</span>
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  ),
                  updatedAt: (
                    <span className="text-xs text-muted">
                      {new Date(p.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  ),
                },
                actions: (
                  <ContentRowActionsMenu id={p.id} kind={p.kind} status={p.status} slug={p.slug} title={p.title} />
                ),
              }))}
            />
          )}
        </Card>

        <Pagination base="/conteudo" page={page} take={PAGE_SIZE} total={total} q={q} sort={sort} extra={extra} />
      </div>
    </PageShell>
  );
}
