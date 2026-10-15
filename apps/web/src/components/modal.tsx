'use client';

import { X } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef } from 'react';

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-line bg-surface-2 p-0 text-fg shadow-float backdrop:bg-black/60"
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 id={titleId} className="text-xl leading-7 font-semibold tracking-[-0.015em]">{title}</h2>
            <button onClick={onClose} className="rounded p-1 text-fg-subtle hover:bg-surface hover:text-fg" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          {children}
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
