'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Select, type SelectOption } from '@/components/ui';

/** Seletor de categoria (32px, com busca acima de 8 opções) — filtra a listagem via `?category=`, mesma mecânica de URL do `OwnerFilter`. */
export function CategoryFilter({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('category') ?? '';

  const options: SelectOption[] = [
    { value: '', label: 'Todas as categorias' },
    ...categories.map((c) => ({ value: c, label: c })),
  ];

  function set(value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set('category', value);
    else sp.delete('category');
    sp.delete('page');
    router.replace(`${pathname}${sp.size ? `?${sp}` : ''}`);
  }

  return (
    <Select
      inputSize="sm"
      aria-label="Categoria"
      className="w-44"
      value={current}
      onChange={(e) => set(e.target.value)}
      options={options}
    />
  );
}
