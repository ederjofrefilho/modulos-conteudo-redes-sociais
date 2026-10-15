'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, Copy, Repeat2 } from 'lucide-react';
import { PROVIDER_LABEL } from '@app/social/rules';
import { METRIC_KEYS, METRIC_LABEL, engagementRate, interactions } from '@app/social/metrics';
import { Badge, Button, Drawer, useToast } from '@/components/ui';
import { REMOTE_TYPE_LABEL, remotePreviewMedia } from '@app/social/remote';
import { PostPerformanceDrawer } from './performance/PostPerformanceDrawer';
import { duplicateSocialPostAction } from '@/app/(app)/social/actions';
import { StateBadge, dateTimeLabel, formatCount, formatRate } from './PostBits';
import { SocialPostActions } from './SocialPostActions';
import { SocialPreview } from './SocialPreview';
import type { WorkspaceAccount, WorkspacePost } from './types';

/**
 * Post que já não se edita (publicado, a publicar ou arquivado): como saiu,
 * os números mais recentes e o que ainda se pode fazer com ele — duplicar,
 * adaptar para a outra rede, arquivar.
 */
export function PostDetail({
  post,
  accounts,
  onClose,
  onOpen,
}: {
  post: WorkspacePost;
  accounts: WorkspaceAccount[];
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [performance, setPerformance] = useState(false);
  const others = accounts.filter((a) => a.isActive && a.provider !== post.account.provider && (a.access === 'DRAFT' || a.access === 'PUBLISH'));
  const rate = engagementRate(post.metrics);

  function copyTo(accountId?: string) {
    startTransition(async () => {
      const res = await duplicateSocialPostAction(post.id, accountId);
      if (!res.ok || !res.data) {
        toast(res.error ?? 'Não foi possível copiar.', 'error');
        return;
      }
      toast('Cópia criada como rascunho.', 'success');
      router.refresh();
      onOpen(res.data.id);
    });
  }

  return (
    <Drawer
      open
      title="Post"
      onClose={onClose}
      headerActions={
        <>
          {post.simulated && <Badge>Simulação</Badge>}
          <StateBadge state={post.state} />
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {post.account.access !== 'VIEW' && (
            <Button size="sm" variant="secondary" onClick={() => copyTo()} disabled={pending}>
              <Copy className="h-3.5 w-3.5" /> Duplicar
            </Button>
          )}
          {others.map((a) => (
            <Button key={a.id} size="sm" variant="secondary" onClick={() => copyTo(a.id)} disabled={pending}>
              <Repeat2 className="h-3.5 w-3.5" /> Adaptar para {PROVIDER_LABEL[a.provider]}
            </Button>
          ))}
          <SocialPostActions
            id={post.id}
            status={post.status}
            provider={post.account.provider}
            accountName={post.account.displayName}
            scheduledAt={post.scheduledAt}
            canApprove={false}
            externalUrl={post.externalUrl}
            onDone={onClose}
            access={post.account.access}
            reviewState={post.review.state}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Rede</dt>
          <dd className="text-foreground">
            {PROVIDER_LABEL[post.account.provider]} · {post.account.displayName}
          </dd>
          <dt className="text-muted">{post.publishedAt ? 'Publicado' : 'Data'}</dt>
          <dd className="text-foreground">{dateTimeLabel(post.publishedAt ?? post.scheduledAt)}</dd>
          <dt className="text-muted">Origem</dt>
          <dd className="text-foreground">
            {post.origin === 'imported' ? 'Publicado direto na rede' : 'Criado no CRM'}
            {post.remote ? ` · ${REMOTE_TYPE_LABEL[post.remote.type]}` : ''}
          </dd>
          {post.origin !== 'imported' && (
            <>
              <dt className="text-muted">Autor</dt>
              <dd className="text-foreground">{post.author.name}</dd>
            </>
          )}
          {post.review.submittedBy && (
            <>
              <dt className="text-muted">Enviado por</dt>
              <dd className="text-foreground">{post.review.submittedBy}</dd>
            </>
          )}
          {post.scheduledByName && (
            <>
              <dt className="text-muted">Agendado por</dt>
              <dd className="text-foreground">{post.scheduledByName}</dd>
            </>
          )}
          {post.publishedByName && (
            <>
              <dt className="text-muted">Publicado por</dt>
              <dd className="text-foreground">{post.publishedByName}</dd>
            </>
          )}
          {post.approvedByName && (
            <>
              <dt className="text-muted">Aprovado por</dt>
              <dd className="text-foreground">{post.approvedByName}</dd>
            </>
          )}
          {post.topic && (
            <>
              <dt className="text-muted">Tema</dt>
              <dd className="text-foreground">{post.topic}</dd>
            </>
          )}
        </dl>

        {post.status === 'PUBLISHED' && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-foreground">Desempenho</h3>
              <Button size="sm" variant="ghost" onClick={() => setPerformance(true)} disabled={!post.account.metrics}>
                <BarChart3 className="h-3.5 w-3.5" /> Ver evolução
              </Button>
            </div>
            {post.metrics ? (
              <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
                {METRIC_KEYS.filter((k) => post.metrics![k] !== null).map((k) => (
                  <div key={k}>
                    <dt className="text-xs text-muted">{METRIC_LABEL[k]}</dt>
                    <dd className="tabular-nums text-foreground">{formatCount(post.metrics![k])}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-xs text-muted">Interações</dt>
                  <dd className="tabular-nums text-foreground">{formatCount(interactions(post.metrics))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Taxa de engagement</dt>
                  <dd className="tabular-nums text-foreground">{formatRate(rate?.rate)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-muted">
                {post.simulated
                  ? 'Publicação simulada: não existe na rede, por isso não tem métricas.'
                  : 'Ainda sem métricas recolhidas para este post.'}
              </p>
            )}
          </section>
        )}

        <SocialPreview
          provider={post.account.provider}
          accountName={post.account.displayName}
          avatarUrl={post.account.avatarUrl}
          text={post.text}
          media={post.media.length ? post.media : remotePreviewMedia(post.remote, post.account.provider)}
          linkUrl={post.linkUrl ?? post.remote?.linkUrl ?? null}
          placement={post.placement}
        />
      </div>
      {performance && <PostPerformanceDrawer postId={post.id} onClose={() => setPerformance(false)} />}
    </Drawer>
  );
}
