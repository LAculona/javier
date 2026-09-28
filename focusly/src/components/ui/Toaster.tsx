import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useToast, type ToastItem, type ToastVariant } from '../../context/ToastContext';
import { cn } from '../../lib/cn';

const ICONS: Record<ToastVariant, typeof Info> = { success: CircleCheck, info: Info, error: CircleAlert };
const ICON_TONES: Record<ToastVariant, string> = { success: 'text-success', info: 'text-accent-text', error: 'text-danger' };

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);

  // Cuenta atrás que se pausa con el ratón encima o con el foco dentro del aviso.
  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const id = window.setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(id);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused, onDismiss, toast.id]);

  const Icon = ICONS[toast.variant];

  return (
    <li
      className="pointer-events-auto flex w-full animate-toast-in items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-lifted"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', ICON_TONES[toast.variant])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{toast.title}</p>
        {toast.description && <p className="mt-0.5 truncate text-sm text-fg-muted">{toast.description}</p>}
      </div>
      {toast.action && (
        <button
          type="button"
          className="-my-1 shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-soft"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Cerrar notificación"
        className="-m-1 grid size-7 shrink-0 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-subtle hover:text-fg"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <section
      aria-label="Notificaciones"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:justify-end sm:p-6"
    >
      <ol aria-live="polite" aria-relevant="additions" className="flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </ol>
    </section>
  );
}
