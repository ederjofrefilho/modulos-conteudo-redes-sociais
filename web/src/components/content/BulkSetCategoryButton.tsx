'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tag } from 'lucide-react';
import { Button, Input, Popover, useToast, useDataTableSelection } from '@/components/ui';
import type { ActionResult } from '@/lib/action-result';

/** Trocar a categoria em massa — mesmo molde de `BulkAssignOwnerButton`, mas texto livre em vez de select de usuários. */
export function BulkSetCategoryButton({
  action,
}: {
  action: (ids: string[], category: string) => Promise<ActionResult<{ count: number }>>;
}) {
  const { selectedIds, clearSelection } = useDataTableSelection();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function apply() {
    if (!category.trim()) {
      toast('Informe uma categoria.', 'error');
      return;
    }
    startTransition(async () => {
      const result = await action(selectedIds, category.trim());
      setOpen(false);
      if (result.ok) {
        toast(`Categoria atualizada em ${result.data?.count ?? selectedIds.length} post(s).`, 'success');
        clearSelection();
        router.refresh();
      } else {
        toast(result.error ?? 'Não foi possível atualizar a categoria.', 'error');
      }
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={({ toggle }) => (
        <Button variant="secondary" size="sm" onClick={toggle}>
          <Tag className="h-3.5 w-3.5" /> Categoria
        </Button>
      )}
    >
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-foreground">Nova categoria</label>
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Ex.: Analytics, BI, Dashboards"
          autoFocus
        />
        <Button size="sm" onClick={apply} disabled={pending}>
          {pending ? 'Aplicando...' : 'Aplicar'}
        </Button>
      </div>
    </Popover>
  );
}
