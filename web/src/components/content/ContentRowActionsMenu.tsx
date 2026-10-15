'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, EyeOff, ExternalLink, Pencil, XCircle } from 'lucide-react';
import { Menu, MenuItem, useToast } from '@/components/ui';
import { RowDeleteButton } from '@/components/RowDeleteButton';
import {
  publishPostAction,
  unpublishPostAction,
  cancelScheduleAction,
  duplicatePostAction,
  bulkDeletePostsAction,
} from '@/app/(app)/conteudo/actions';
import type { ContentKindLike, ContentStatusLike } from './meta';

type Kind = ContentKindLike;
type Status = ContentStatusLike;

/**
 * Kebab por linha da listagem de conteúdo — mesmo molde de `RowActionsMenu`,
 * mas com as ações que só fazem sentido aqui (publicar/despublicar/cancelar
 * agendamento/duplicar/ver ao vivo), não só editar/excluir.
 */
export function ContentRowActionsMenu({
  id,
  kind,
  status,
  slug,
  title,
}: {
  id: string;
  kind: Kind;
  status: Status;
  slug: string;
  title: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function publish() {
    startTransition(async () => {
      const res = await publishPostAction(id);
      if (res.ok) {
        toast('Publicado.', 'success');
        router.refresh();
      } else {
        toast(res.error ?? 'Não foi possível publicar.', 'error');
      }
    });
  }

  function unpublish() {
    startTransition(async () => {
      const res = await unpublishPostAction(id);
      if (res.ok) {
        toast('Despublicado.', 'success');
        router.refresh();
      } else {
        toast(res.error ?? 'Não foi possível despublicar. Tente de novo.', 'error');
      }
    });
  }

  function cancelScheduling() {
    startTransition(async () => {
      const res = await cancelScheduleAction(id);
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
      const res = await duplicatePostAction(id);
      if (res.ok && res.data) {
        toast('Duplicado.', 'success');
        router.push(`/conteudo/${res.data.id}`);
      } else {
        toast(res.error ?? 'Não foi possível duplicar. Tente de novo.', 'error');
      }
    });
  }

  const liveHref = `https://example.com/${kind === 'CASE' ? 'casos' : 'blog'}/${slug}`;

  return (
    <Menu label={`Ações de "${title}"`} portal>
      <MenuItem>
        <Link href={`/conteudo/${id}`}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Link>
      </MenuItem>
      {status === 'PUBLISHED' && (
        <MenuItem>
          <a href={liveHref} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Ver ao vivo
          </a>
        </MenuItem>
      )}
      <MenuItem>
        <button type="button" onClick={duplicate} disabled={pending}>
          <Copy className="h-3.5 w-3.5" /> Duplicar
        </button>
      </MenuItem>
      {status === 'PUBLISHED' ? (
        <MenuItem>
          <button type="button" onClick={unpublish} disabled={pending}>
            <EyeOff className="h-3.5 w-3.5" /> Despublicar
          </button>
        </MenuItem>
      ) : status === 'SCHEDULED' ? (
        <MenuItem>
          <button type="button" onClick={cancelScheduling} disabled={pending}>
            <XCircle className="h-3.5 w-3.5" /> Cancelar agendamento
          </button>
        </MenuItem>
      ) : (
        <MenuItem>
          <button type="button" onClick={publish} disabled={pending}>
            <Eye className="h-3.5 w-3.5" /> Publicar
          </button>
        </MenuItem>
      )}
      <MenuItem destructive>
        <RowDeleteButton
          id={id}
          label="Excluir post"
          message={`Excluir "${title}"? Não é possível desfazer.`}
          action={bulkDeletePostsAction}
        />
      </MenuItem>
    </Menu>
  );
}
