'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { inputBaseClass } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Busca reativa: atualiza ?q= com debounce enquanto digita (sem Enter),
 * resetando a página. O restante dos parâmetros da URL é preservado.
 */
export function SearchInput({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (next.trim()) sp.set('q', next.trim());
      else sp.delete('q');
      sp.delete('page'); // nova busca volta à primeira página
      router.replace(`${pathname}${sp.size ? `?${sp}` : ''}`);
    }, 350);
  }

  return (
    <div className="relative w-64 min-w-40 shrink">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar"
        className={cn(inputBaseClass.replace('px-3', 'pl-9 pr-3'), 'h-8')}
      />
    </div>
  );
}
