'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Laptop, Smartphone, Tablet, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useBodyScrollLock } from '@/lib/useFocusTrap';
import { getPreviewUrlAction } from '@/app/(app)/conteudo/actions';

const DEVICES = [
  { key: 'mobile', label: 'Celular', icon: Smartphone, width: 390 },
  { key: 'tablet', label: 'Tablet', icon: Tablet, width: 834 },
  { key: 'desktop', label: 'Computador', icon: Laptop, width: 1280 },
] as const;
type DeviceKey = (typeof DEVICES)[number]['key'];

/**
 * Prévia de verdade — iframe do site institucional (`/preview/[id]`), não mais uma
 * réplica da tipografia dentro do CRM (`PostPreviewPane`, apagado). O que o
 * autor vê aqui É o que o leitor vai ver: mesmo componente de renderização
 * de blocos dos dois lados, não uma terceira implementação divergente.
 *
 * A prévia lê a linha PERSISTIDA no banco (via `getPreviewUrlAction` ->
 * `GET /api/content/preview/[id]` na CRM), então ela atrasa o autosave por
 * natureza — `refreshKey` (bumped pelo `PostEditor` a cada save bem-sucedido)
 * é o gatilho pra buscar uma URL nova e recarregar o iframe.
 */
export function PostPreviewFrame({
  open,
  onClose,
  postId,
  refreshKey,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  refreshKey: number;
}) {
  const [device, setDevice] = useState<DeviceKey>('desktop');
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('loading');
    getPreviewUrlAction(postId).then((res) => {
      if (cancelled) return;
      const nextUrl = res.ok ? (res.data?.url ?? null) : null;
      setUrl(nextUrl);
      setStatus(nextUrl ? 'ready' : 'unavailable');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `refreshKey` é o gatilho de propósito (post salvou de novo), `postId` não muda no mount de um editor
  }, [open, refreshKey]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const activeDevice = DEVICES.find((d) => d.key === device)!;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-2">
      <div className="flex items-center justify-between bg-surface px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
          {DEVICES.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDevice(d.key)}
              title={d.label}
              aria-label={d.label}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                device === d.key ? 'bg-surface text-foreground shadow-[var(--shadow-sm)]' : 'text-muted hover:text-foreground',
              )}
            >
              <d.icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">Prévia — o site real, servindo a última versão salva</span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-border hover:text-foreground"
          aria-label="Fechar prévia"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mx-auto h-full overflow-hidden rounded-xl bg-background shadow-[var(--shadow-lg)]" style={{ maxWidth: activeDevice.width }}>
          {status === 'loading' && <div className="flex h-full items-center justify-center text-sm text-muted">Carregando prévia...</div>}
          {status === 'unavailable' && (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">
              Prévia indisponível — faltam `SITE_REVALIDATE_URL`/`SITE_PREVIEW_SECRET` no ambiente. Configure-os pra habilitar
              a prévia do site real.
            </div>
          )}
          {status === 'ready' && url && <iframe key={url} src={url} title="Prévia do post" className="h-full w-full" />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
