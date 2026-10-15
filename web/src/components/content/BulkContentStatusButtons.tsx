'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button, useToast, useDataTableSelection } from '@/components/ui';
import type { ActionResult } from '@/lib/action-result';

/**
 * Publicar/despublicar em massa a partir da listagem — vive no
 * `bulkActionsSlot` do `DataTable` (mesmo molde de `BulkDeleteButton`), lê a
 * seleção via contexto. Sucesso parcial (ex.: 2 de 3 publicáveis) ainda
 * conta como sucesso — a mensagem informa quantos foram de fato.
 */
export function BulkPublishButton({
  action,
}: {
  action: (ids: string[]) => Promise<ActionResult<{ count: number }>>;
}) {
  const { selectedIds, clearSelection } = useDataTableSelection();
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const result = await action(selectedIds);
      if (result.ok) {
        const count = result.data?.count ?? 0;
        toast(
          count === selectedIds.length
            ? `${count} post(s) publicado(s).`
            : `${count} de ${selectedIds.length} post(s) publicado(s) — os demais têm campos pendentes.`,
          count > 0 ? 'success' : 'error',
        );
        clearSelection();
        router.refresh();
      } else {
        toast(result.error ?? 'Não foi possível publicar.', 'error');
      }
    });
  }

  return (
    <Button variant="secondary" size="sm" onClick={run} disabled={pending}>
      <Eye className="h-3.5 w-3.5" /> Publicar
    </Button>
  );
}

export function BulkUnpublishButton({
  action,
}: {
  action: (ids: string[]) => Promise<ActionResult<{ count: number }>>;
}) {
  const { selectedIds, clearSelection } = useDataTableSelection();
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const result = await action(selectedIds);
      if (result.ok) {
        toast(`${result.data?.count ?? selectedIds.length} post(s) despublicado(s).`, 'success');
        clearSelection();
        router.refresh();
      } else {
        toast(result.error ?? 'Não foi possível despublicar.', 'error');
      }
    });
  }

  return (
    <Button variant="secondary" size="sm" onClick={run} disabled={pending}>
      <EyeOff className="h-3.5 w-3.5" /> Despublicar
    </Button>
  );
}
