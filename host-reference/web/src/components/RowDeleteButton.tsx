'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog, useToast } from '@/components/ui';
import type { ActionResult } from '@/lib/action-result';

/**
 * Excluir UM registro a partir do kebab de uma linha da lista — reusa a
 * mesma server action de exclusão em massa (`bulkDeleteXAction`) com um
 * array de um único id, nunca `deleteXAction` no singular quando essa
 * termina em `redirect()` (caso de `deleteDealAction`, que volta pro
 * `/pipeline` — chamado daqui deixaria a lista numa navegação indesejada).
 * `e.stopPropagation()` no gatilho pelo mesmo motivo de `ConfirmButton`: o
 * `Menu` pai fecha em QUALQUER clique dentro do painel, inclusive este —
 * sem barrar a propagação, o Menu fecha e desmonta este componente antes do
 * `ConfirmDialog` aparecer.
 */
export function RowDeleteButton({
  id,
  label,
  message,
  action,
}: {
  id: string;
  label: string;
  message: string;
  action: (ids: string[]) => Promise<ActionResult<{ count: number }>>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function confirm() {
    startTransition(async () => {
      const result = await action([id]);
      setOpen(false);
      if (result.ok) {
        toast('Excluído.', 'success');
        router.refresh();
      } else {
        toast(result.error ?? 'Não foi possível excluir', 'error');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" /> {label}
      </button>
      <ConfirmDialog
        open={open}
        title={label}
        message={message}
        pending={pending}
        onConfirm={confirm}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
