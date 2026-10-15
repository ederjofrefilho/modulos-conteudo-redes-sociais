'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, CalendarClock, Check, CornerUpLeft, ExternalLink, RotateCcw, Send } from 'lucide-react';
import { PROVIDER_LABEL, type SocialProviderName } from '@app/social/rules';
import type { SocialStatus } from '@app/social/status';
import type { AccessLevel } from '@app/social/access';
import { Badge, Button, DatePicker, Dialog, Field, LinkButton, Textarea, useToast } from '@/components/ui';
import {
  approveSocialPostAction,
  archiveSocialPostAction,
  retrySocialPostAction,
  returnSocialPostAction,
  submitSocialPostAction,
} from '@/app/(app)/social/actions';
import { formatWhen, toLocalInput } from './format';

/**
 * Ações de um post na fila. "Aprovar" é a decisão humana que o Claude não
 * tem como tomar (não há tool MCP para isto): sempre passa por um diálogo
 * que mostra destino e horário antes de confirmar.
 */
export function SocialPostActions({
  id,
  status,
  provider,
  accountName,
  scheduledAt,
  canApprove,
  externalUrl,
  blockedReason,
  onDone,
  access,
  reviewState,
}: {
  /** O que quem vê pode fazer na conta: DRAFT envia para aprovação; PUBLISH aprova e devolve. */
  access: AccessLevel;
  reviewState: 'pending' | 'returned' | null;
  id: string;
  status: SocialStatus;
  provider: SocialProviderName;
  accountName: string;
  scheduledAt: string | null;
  canApprove: boolean;
  externalUrl: string | null;
  /** Motivo para não aprovar agora (ex.: alterações por guardar) — desativa e explica. */
  blockedReason?: string | null;
  /** Chamado depois de uma ação que tira o post do estado atual (aprovado, arquivado, publicado). */
  onDone?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | 'approve' | 'schedule' | 'archive' | 'return'>(null);
  const [when, setWhen] = useState('');
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const canPublish = access === 'PUBLISH';
  const canDraft = canPublish || access === 'DRAFT';

  function submit() {
    startTransition(async () => {
      const res = await submitSocialPostAction(id);
      if (!res.ok) {
        const fields = Object.values(res.fieldErrors ?? {}).flat().filter(Boolean);
        toast([res.error, ...fields].filter(Boolean).join(' '), 'error');
      } else toast('Enviado para aprovação. Quem pode publicar foi avisado.', 'success');
      router.refresh();
    });
  }

  function sendBack() {
    setCommentError(null);
    startTransition(async () => {
      const res = await returnSocialPostAction(id, comment);
      if (!res.ok) {
        setCommentError(res.fieldErrors?.reviewComment?.[0] ?? res.error ?? 'Não foi possível devolver.');
        return;
      }
      setDialog(null);
      setComment('');
      toast('Devolvido com comentário. O autor foi avisado.', 'success');
      router.refresh();
    });
  }

  function openSchedule() {
    setWhen(toLocalInput(scheduledAt) ?? toLocalInput(new Date(Date.now() + 3_600_000).toISOString())!);
    setDialog('schedule');
  }

  function approve(withSchedule: boolean) {
    const iso = withSchedule && when ? new Date(when).toISOString() : undefined;
    startTransition(async () => {
      const res = await approveSocialPostAction(id, iso);
      setDialog(null);
      if (!res.ok) {
        const fields = Object.values(res.fieldErrors ?? {}).flat().filter(Boolean);
        toast([res.error, ...fields].filter(Boolean).join(' '), 'error');
      } else if (res.data?.error) {
        toast(`Aprovado, mas a publicação falhou: ${res.data.error}`, 'error');
      } else if (res.data?.processing) {
        toast(`Aprovado. ${res.data.processing}`, 'success');
        onDone?.();
      } else {
        toast(res.data?.published ? 'Aprovado e publicado.' : 'Aprovado. Sai no horário marcado.', 'success');
        onDone?.();
      }
      router.refresh();
    });
  }

  function archive() {
    startTransition(async () => {
      const res = await archiveSocialPostAction(id);
      setDialog(null);
      toast(res.ok ? 'Arquivado.' : (res.error ?? 'Não foi possível arquivar. Tente de novo.'), res.ok ? 'success' : 'error');
      if (res.ok) onDone?.();
      router.refresh();
    });
  }

  function retry() {
    startTransition(async () => {
      const res = await retrySocialPostAction(id);
      if (!res.ok) toast(res.error ?? 'Não foi possível tentar de novo. Tente de novo.', 'error');
      else if (res.data?.error) toast(`Falhou de novo: ${res.data.error}`, 'error');
      else if (res.data?.processing) toast(res.data.processing, 'success');
      else toast(res.data?.published ? 'Publicado.' : 'De volta à fila: sai no horário marcado.', 'success');
      router.refresh();
    });
  }

  const network = PROVIDER_LABEL[provider];
  const blocked = !canApprove || !!blockedReason;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'DRAFT' && reviewState === 'pending' && <Badge tone="info">À espera de aprovação</Badge>}
      {status === 'DRAFT' && canPublish && reviewState === 'pending' && (
        <Button size="sm" variant="secondary" onClick={() => setDialog('return')} disabled={pending}>
          <CornerUpLeft className="h-3.5 w-3.5" /> Devolver
        </Button>
      )}
      {status === 'DRAFT' && !canPublish && canDraft && reviewState !== 'pending' && (
        <Button size="sm" onClick={submit} disabled={blocked || pending} title={blockedReason ?? undefined} loading={pending}>
          <Send className="h-3.5 w-3.5" /> Enviar para aprovação
        </Button>
      )}
      {status === 'DRAFT' && canPublish && (
        <>
          <Button size="sm" onClick={() => setDialog('approve')} disabled={blocked || pending} title={blockedReason ?? undefined}>
            <Check className="h-3.5 w-3.5" /> Aprovar
          </Button>
          <Button size="sm" variant="secondary" onClick={openSchedule} disabled={blocked || pending} title={blockedReason ?? undefined}>
            <CalendarClock className="h-3.5 w-3.5" /> Aprovar e agendar
          </Button>
        </>
      )}
      {status === 'FAILED' && canPublish && (
        <Button size="sm" onClick={retry} loading={pending}>
          <RotateCcw className="h-3.5 w-3.5" /> Tentar de novo
        </Button>
      )}
      {status === 'PUBLISHED' && externalUrl && (
        <LinkButton href={externalUrl} target="_blank" rel="noreferrer" size="sm" variant="secondary">
          <ExternalLink className="h-3.5 w-3.5" /> Ver na rede
        </LinkButton>
      )}
      {status !== 'ARCHIVED' && status !== 'PUBLISHING' && (status === 'DRAFT' ? canDraft : canPublish) && (
        <Button size="sm" variant="ghost" onClick={() => setDialog('archive')} disabled={pending}>
          <Archive className="h-3.5 w-3.5" /> Arquivar
        </Button>
      )}

      <Dialog open={dialog === 'approve'} title="Aprovar publicação" onClose={() => setDialog(null)}>
        <ApprovalSummary network={network} accountName={accountName} when={formatWhen(scheduledAt)} />
        <DialogButtons pending={pending} label="Aprovar" onCancel={() => setDialog(null)} onConfirm={() => approve(false)} />
      </Dialog>

      <Dialog open={dialog === 'schedule'} title="Aprovar e agendar" onClose={() => setDialog(null)}>
        <div className="flex flex-col gap-4">
          <Field label="Publicar em" hint="Horário deste navegador">
            <DatePicker type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <ApprovalSummary network={network} accountName={accountName} when={when ? formatWhen(new Date(when).toISOString()) : '—'} />
        </div>
        <DialogButtons pending={pending} label="Aprovar e agendar" onCancel={() => setDialog(null)} onConfirm={() => approve(true)} />
      </Dialog>

      <Dialog open={dialog === 'return'} title="Devolver com comentário" onClose={() => setDialog(null)}>
        <Field label="O que precisa mudar" required error={commentError ?? undefined}>
          <Textarea rows={4} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <DialogButtons pending={pending} label="Devolver" onCancel={() => setDialog(null)} onConfirm={sendBack} />
      </Dialog>

      <Dialog open={dialog === 'archive'} title="Arquivar post" onClose={() => setDialog(null)}>
        <p className="text-sm leading-relaxed text-muted">
          {status === 'PUBLISHED'
            ? `O post sai da lista do CRM, mas continua no ${network} — apague lá se for o caso.`
            : 'O post sai da fila e não será publicado.'}
        </p>
        <DialogButtons pending={pending} label="Arquivar" onCancel={() => setDialog(null)} onConfirm={archive} />
      </Dialog>
    </div>
  );
}

function ApprovalSummary({ network, accountName, when }: { network: string; accountName: string; when: string }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-muted">Destino</dt>
      <dd className="text-foreground">
        {network} · {accountName}
      </dd>
      <dt className="text-muted">Quando</dt>
      <dd className="text-foreground">{when}</dd>
    </dl>
  );
}

function DialogButtons({
  pending,
  label,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
        Cancelar
      </Button>
      <Button size="sm" onClick={onConfirm} loading={pending}>
        {label}
      </Button>
    </div>
  );
}
