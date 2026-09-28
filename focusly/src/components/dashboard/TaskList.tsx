import { useEffect, useRef, type RefObject } from 'react';
import { CircleCheck, Inbox, ListTodo } from 'lucide-react';
import type { Priority, Task, TaskFilter } from '../../types';
import { TaskItem } from './TaskItem';

interface TaskListProps {
  tasks: Task[];
  filter: TaskFilter;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onPriorityChange: (id: string, priority: Priority) => void;
  /** Campo al que devolver el foco si la lista se queda vacía. */
  fallbackFocusRef: RefObject<HTMLInputElement | null>;
}

const EMPTY_STATES: Record<TaskFilter, { icon: typeof Inbox; title: string; text: string }> = {
  all: { icon: Inbox, title: 'Tu lista está vacía', text: 'Escribe arriba tu primera tarea y pulsa Intro.' },
  pending: { icon: CircleCheck, title: '¡No tienes nada pendiente!', text: 'Has completado todas tus tareas. Buen trabajo.' },
  completed: { icon: ListTodo, title: 'Aún no has completado tareas', text: 'Marca una tarea como hecha y aparecerá aquí.' },
};

export function TaskList({ tasks, filter, onToggle, onDelete, onPriorityChange, fallbackFocusRef }: TaskListProps) {
  const checkboxes = useRef(new Map<string, HTMLInputElement>());
  const pendingFocus = useRef<string | null | undefined>(undefined);

  // Tras eliminar (o sacar de la vista filtrada) una tarea, el foco pasa a la
  // siguiente para que el usuario de teclado no pierda su posición.
  useEffect(() => {
    if (pendingFocus.current === undefined) return;
    const target = pendingFocus.current ? checkboxes.current.get(pendingFocus.current) : null;
    (target ?? fallbackFocusRef.current)?.focus();
    pendingFocus.current = undefined;
  }, [tasks, fallbackFocusRef]);

  const neighbourOf = (id: string): string | null => {
    const index = tasks.findIndex((task) => task.id === id);
    return tasks[index + 1]?.id ?? tasks[index - 1]?.id ?? null;
  };

  const handleDelete = (id: string) => {
    const hadFocus = document.activeElement?.closest('li') === checkboxes.current.get(id)?.closest('li');
    if (hadFocus) pendingFocus.current = neighbourOf(id);
    onDelete(id);
  };

  const handleToggle = (id: string) => {
    // En las vistas filtradas la tarea desaparece al cambiar de estado.
    if (filter !== 'all') pendingFocus.current = neighbourOf(id);
    onToggle(id);
  };

  if (tasks.length === 0) {
    const empty = EMPTY_STATES[filter];
    const Icon = empty.icon;
    return (
      <div className="flex animate-fade-in flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-subtle text-fg-subtle">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <p className="mt-4 font-medium text-fg">{empty.title}</p>
        <p className="mt-1 text-sm text-fg-muted">{empty.text}</p>
      </div>
    );
  }

  return (
    <ul aria-label="Tareas" className="space-y-2">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          ref={(element) => {
            if (element) checkboxes.current.set(task.id, element);
            else checkboxes.current.delete(task.id);
          }}
          task={task}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onPriorityChange={onPriorityChange}
        />
      ))}
    </ul>
  );
}
