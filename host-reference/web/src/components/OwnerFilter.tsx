'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Segmented } from '@/components/ui';

/** Segmentado Todos|Meus — escreve ?mine=1 preservando os demais parâmetros da URL. */
export function OwnerFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mine = params.get('mine') === '1';

  function set(next: boolean) {
    const sp = new URLSearchParams(params.toString());
    if (next) sp.set('mine', '1');
    else sp.delete('mine');
    sp.delete('page'); // troca de filtro volta à primeira página
    router.replace(`${pathname}${sp.size ? `?${sp}` : ''}`);
  }

  return (
    <Segmented
      label="Filtrar por responsável"
      value={mine ? 'on' : 'off'}
      onChange={(v) => set(v === 'on')}
      options={[
        { value: 'off', label: 'Todos' },
        { value: 'on', label: 'Meus' },
      ]}
    />
  );
}
