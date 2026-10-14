'use client';

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { cx } from './ui';

type Tone = 'info' | 'success' | 'error' | 'recording';
interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const hold = (id: number) => clearTimeout(timers.current.get(id));
  const resume = (id: number, tone: Tone) => {
    if (tone !== 'error') timers.current.set(id, setTimeout(() => dismiss(id), 5000));
  };
  const push = useCallback(
    (message: string, tone: Tone = 'info') => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, tone, message }]);
      // Errors stay until dismissed (WCAG 2.2.1); others time out unless hovered or focused.
      if (tone !== 'error') timers.current.set(id, setTimeout(() => dismiss(id), 5000));
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed top-16 left-1/2 z-[100] flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : undefined}
            onMouseEnter={() => hold(t.id)}
            onMouseLeave={() => resume(t.id, t.tone)}
            onFocus={() => hold(t.id)}
            onBlur={() => resume(t.id, t.tone)}
            className={cx(
              'pointer-events-auto flex items-start gap-3 rounded-md border bg-surface-3 px-3.5 py-3 shadow-float',
              t.tone === 'error' && 'border-danger/60',
              t.tone === 'success' && 'border-success/50',
              t.tone === 'recording' && 'border-danger',
              t.tone === 'info' && 'border-line-strong',
            )}
          >
            {t.tone === 'error' && <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />}
            {t.tone === 'success' && <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />}
            {t.tone === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-cyan" />}
            {t.tone === 'recording' && <span className="mt-1.5 size-2 shrink-0 animate-rec-pulse rounded-full bg-danger" />}
            <p className="flex-1 text-[13px] leading-5">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-fg-subtle hover:text-fg" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
