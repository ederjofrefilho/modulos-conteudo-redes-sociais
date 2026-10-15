'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

/** Ação opcional no aviso (ex.: "Desfazer"); clicar fecha o aviso. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 5000;

const TONE_META: Record<ToastTone, { icon: typeof Info; accent: string }> = {
  success: { icon: CheckCircle2, accent: 'text-accent' },
  error: { icon: AlertCircle, accent: 'text-danger' },
  info: { icon: Info, accent: 'text-primary' },
};

/** Feedback global não-bloqueante. Use `const { toast } = useToast()`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  // O portal só existe no cliente: montar após a hidratação evita mismatch
  // (servidor e 1ª render do cliente não renderizam nada).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info', action?: ToastAction) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-3), { id, tone, message, action }]);
      // Com ação (desfazer) o aviso fica mais tempo: dá para ler e decidir.
      setTimeout(() => dismiss(id), action ? DURATION_MS + 3000 : DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-80 flex-col gap-2"
          >
            {items.map((t) => {
              const Icon = TONE_META[t.tone].icon;
              return (
                <div
                  key={t.id}
                  role="status"
                  className={cn(
                    'pointer-events-auto flex items-start gap-2.5 rounded-xl',
                    'bg-surface p-3 text-sm text-foreground shadow-[var(--shadow-lg)]',
                    'animate-[toast-in_0.18s_ease-out]',
                  )}
                >
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_META[t.tone].accent)} />
                  <span className="flex-1 leading-snug">{t.message}</span>
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        t.action!.onClick();
                        dismiss(t.id);
                      }}
                      className="-my-0.5 shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold text-foreground underline-offset-2 transition-colors hover:bg-surface-2 hover:underline"
                    >
                      {t.action.label}
                    </button>
                  )}
                  <button
                    onClick={() => dismiss(t.id)}
                    aria-label="Fechar aviso"
                    className="rounded-md p-0.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa do <ToastProvider> no layout.');
  return ctx;
}
