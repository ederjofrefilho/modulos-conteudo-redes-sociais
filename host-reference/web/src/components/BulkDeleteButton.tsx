'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, useToast, useDataTableSelection } from '@/components/ui';
import type { ActionResult } from '@/lib/action-result';

/**
 * Botão + confirmação para excluir em massa — vive dentro do
 * `bulkActionsSlot` do `DataTable`, lê a seleção via contexto (não recebe
 * `ids` como prop: props de Server->Client só podem ser dados/Server
 * Actions, e a seleção é estado client-side que só o próprio DataTable tem).
 */
export function BulkDeleteButton({
  entityNamePlural,
  action,
}: {
  /** Ex.: "contas", "negócios" — usado em "Excluir 3 {entityNamePlural}". */
  entityNamePlural: string;
  action: (ids: string[]) => Promise<ActionResult<{ count: number }>>;
}) {
  const { selectedIds, clearSelection } = useDataTableSelection();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function confirm() {
    startTransition(async () => {
      const result = await action(selectedIds);
      setConfirming(false);
      if (result.ok) {
        toast(`${result.data?.count ?? selectedIds.length} registro(s) excluído(s).`, 'success');
        clearSelection();
        router.refresh();
      } else {
        toast(result.error ?? 'Não foi possível excluir', 'error');
      }
    });
  }

  const label = `Excluir ${selectedIds.length} ${entityNamePlural}`;

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 className="h-3.5 w-3.5" /> {label}
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Excluir registros"
        message={`${label}? Esta ação não pode ser desfeita.`}
        pending={pending}
        onConfirm={confirm}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
