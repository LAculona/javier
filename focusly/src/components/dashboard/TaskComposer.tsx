import { useId, useState, type FormEvent, type Ref } from 'react';
import { Plus } from 'lucide-react';
import type { Priority } from '../../types';
import { useTaskActions } from '../../hooks/useTaskActions';
import { MAX_TASKS, TITLE_MAX_LENGTH, validateTaskTitle } from '../../lib/taskValidation';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { PrioritySelect } from '../ui/PrioritySelect';

interface TaskComposerProps {
  inputRef: Ref<HTMLInputElement>;
}

export function TaskComposer({ inputRef }: TaskComposerProps) {
  const { tasks, add } = useTaskActions();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const inputId = useId();
  const priorityId = useId();
  const errorId = useId();
  const hintId = useId();

  const atLimit = tasks.length >= MAX_TASKS;
  const isEmpty = title.trim().length === 0;
  const remaining = TITLE_MAX_LENGTH - title.length;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = validateTaskTitle(title, tasks);
    setSubmitted(true);
    setError(message);
    if (message) return;
    add(title, priority);
    setTitle('');
    setSubmitted(false);
  };

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Crear una tarea nueva">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex">
        <div className="relative col-span-2 sm:flex-1">
          <label htmlFor={inputId} className="sr-only">
            Título de la tarea
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={title}
            maxLength={TITLE_MAX_LENGTH}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="¿Qué tienes que hacer? Ej.: revisar el informe"
            disabled={atLimit}
            aria-invalid={error ? true : undefined}
            aria-describedby={cn(error && errorId, hintId) || undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              // Tras un intento fallido, la validación acompaña mientras se escribe.
              if (submitted) setError(validateTaskTitle(event.target.value, tasks));
            }}
            className={cn(
              'h-11 w-full rounded-xl border bg-surface pr-16 pl-4 text-sm text-fg shadow-soft placeholder:text-fg-subtle',
              'transition-colors focus-visible:outline-2 disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-70',
              error ? 'border-danger focus-visible:outline-danger' : 'border-line hover:border-line-strong',
            )}
          />
          <span
            id={hintId}
            className={cn(
              'pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs tabular-nums transition-opacity',
              remaining <= 10 ? 'text-warning' : 'text-fg-subtle',
              title.length === 0 ? 'opacity-0' : 'opacity-100',
            )}
          >
            <span className="sr-only">Caracteres usados: </span>
            {title.length}/{TITLE_MAX_LENGTH}
          </span>
        </div>
        <label htmlFor={priorityId} className="sr-only">
          Prioridad de la nueva tarea
        </label>
        <PrioritySelect id={priorityId} value={priority} onChange={setPriority} className="sm:w-32" disabled={atLimit} />
        <Button type="submit" className="h-11" disabled={isEmpty || atLimit}>
          <Plus className="size-4" aria-hidden="true" />
          Añadir
        </Button>
      </div>
      <div aria-live="assertive">
        {error && (
          <p id={errorId} className="mt-2 flex items-center gap-1.5 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      {atLimit && !error && (
        <p className="mt-2 text-sm text-fg-muted">
          Has llegado al límite de {MAX_TASKS} tareas de la demo. Elimina alguna para añadir más.
        </p>
      )}
    </form>
  );
}
