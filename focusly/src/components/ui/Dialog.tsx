import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Diálogo modal sobre <dialog> nativo: el navegador gestiona el foco atrapado,
 * la tecla Escape, el contenido inerte de fondo y la devolución del foco.
 */
export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.classList.add('overflow-hidden');
      // Enfoca el campo marcado con data-autofocus (React no emite el atributo autofocus).
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    if (!open) document.documentElement.classList.remove('overflow-hidden');
  }, [open]);

  useEffect(() => () => document.documentElement.classList.remove('overflow-hidden'), []);

  return (
    // El clic en el fondo es un atajo de ratón; con teclado se cierra con Escape (nativo) o el botón «Cerrar».
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        // Un clic directamente sobre <dialog> es un clic en el fondo.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-fg shadow-lifted',
        'open:animate-fade-up',
        className,
      )}
    >
      <div className="relative p-6 sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 grid size-9 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-subtle hover:text-fg"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <h2 id={titleId} className="pr-10 text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-1.5 text-sm text-fg-muted">
            {description}
          </p>
        )}
        <div className="mt-6">{children}</div>
      </div>
    </dialog>
  );
}
