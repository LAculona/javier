import { forwardRef, useId, useState } from 'react';
import { Check, Clock, Trash2 } from 'lucide-react';
import type { Priority, Task } from '../../types';
import { formatRelativeDay } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { IconButton } from '../ui/Button';
import { PrioritySelect } from '../ui/PrioritySelect';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onPriorityChange: (id: string, priority: Priority) => void;
}

const EXIT_MS = 180;

export const TaskItem = forwardRef<HTMLInputElement, TaskItemProps>(function TaskItem(
  { task, onToggle, onDelete, onPriorityChange },
  checkboxRef,
) {
  const [leaving, setLeaving] = useState(false);
  const titleId = useId();
  const metaText =
    task.completed && task.completedAt
      ? `Completada ${formatRelativeDay(task.completedAt)}`
      : `Creada ${formatRelativeDay(task.createdAt)}`;

  const handleDelete = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => onDelete(task.id), EXIT_MS);
  };

  return (
    <li
      data-testid="task-item"
      data-completed={task.completed}
      className={cn(
        'group flex animate-fade-up gap-3 rounded-xl border bg-surface p-3 transition-all duration-200 sm:items-center sm:px-4',
        task.completed ? 'border-line bg-subtle/50' : 'border-line hover:border-line-strong hover:shadow-soft',
        leaving && 'pointer-events-none -translate-x-2 opacity-0',
      )}
    >
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center sm:mt-0">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggle(task.id)}
          aria-labelledby={titleId}
          className={cn(
            'peer size-5 appearance-none rounded-md border-2 border-line-strong bg-surface transition-colors',
            'hover:border-accent checked:border-accent checked:bg-accent',
          )}
        />
        <Check
          aria-hidden="true"
          strokeWidth={3.5}
          className="pointer-events-none absolute size-3 scale-0 text-on-accent transition-transform duration-200 peer-checked:scale-100"
        />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <p
            id={titleId}
            className={cn(
              'text-sm font-medium break-words transition-colors',
              task.completed ? 'text-fg-subtle line-through decoration-fg-subtle/60' : 'text-fg',
            )}
          >
            {task.title}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-subtle">
            <Clock className="size-3" aria-hidden="true" />
            {metaText}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <PrioritySelect
            size="sm"
            value={task.priority}
            onChange={(priority) => onPriorityChange(task.id, priority)}
            ariaLabel={`Prioridad de «${task.title}»`}
            disabled={task.completed}
            title={task.completed ? 'Marca la tarea como pendiente para cambiar su prioridad' : undefined}
            className="w-28"
          />
          <IconButton label={`Eliminar «${task.title}»`} variant="danger" size="sm" onClick={handleDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </li>
  );
});
