'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Select, type SelectOption } from '@/components/ui';

/**
 * Filtro de lista num seletor compacto (32px) que escreve um parâmetro da
 * URL, preservando os demais e voltando à primeira página — a mesma mecânica
 * do `OwnerFilter`, para filtros com mais de três opções.
 */
export function UrlParamSelect({
  param,
  options,
  label,
  className = 'w-40',
}: {
  param: string;
  /** A opção de valor vazio é o "todos" (remove o parâmetro). */
  options: SelectOption[];
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(param, value);
    else sp.delete(param);
    sp.delete('page');
    router.replace(`${pathname}${sp.size ? `?${sp}` : ''}`);
  }

  return (
    <Select
      inputSize="sm"
      aria-label={label}
      className={className}
      options={options}
      value={params.get(param) ?? ''}
      onChange={(e) => set(e.target.value)}
    />
  );
}
