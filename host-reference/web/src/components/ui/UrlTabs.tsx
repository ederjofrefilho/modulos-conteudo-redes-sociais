'use client';

import { useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Tabs } from './Tabs';

/**
 * Mesmo `<Tabs>`, mas com a aba refletida em `?tab=` na URL — sem disparar
 * uma navegação Next.js a cada clique. As fichas (accounts/contacts/deals
 * [id]) são `force-dynamic`; `router.replace()` bateria no servidor (request
 * RSC) só pra trocar de aba. Em vez disso, troca no estado do cliente
 * (instantâneo) e sincroniza a URL via `window.history.replaceState` puro —
 * refresh e link compartilhado continuam abrindo na aba certa. Uso idêntico
 * ao `<Tabs>` (mesmo `key={activeTab}` no chamador força remount quando o
 * servidor recalcula a aba inicial, ex.: clique num link real como
 * `?tab=activities` de um fato da `RecordFacts`).
 */
export function UrlTabs({
  defaultValue,
  paramName = 'tab',
  className,
  children,
}: {
  defaultValue: string;
  paramName?: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);

  function onValueChange(next: string) {
    setValue(next);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(paramName, next);
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      {children}
    </Tabs>
  );
}
