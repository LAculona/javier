import { useCallback } from 'react';
import type { Priority } from '../types';
import { useTasks } from '../context/TasksContext';
import { useToast } from '../context/ToastContext';
import { PRIORITIES } from '../data/priorities';

function quote(title: string): string {
  return title.length > 40 ? `«${title.slice(0, 38)}…»` : `«${title}»`;
}

/**
 * Acciones sobre tareas con feedback visual (toasts y opción de deshacer).
 * Se usa tanto en el dashboard como en la vista previa del hero.
 */
export function useTaskActions() {
  const tasksApi = useTasks();
  const { toast } = useToast();
  const { addTask, toggleTask, removeTask, restoreTask, setPriority, clearCompleted, replaceTasks, resetToSample, tasks } =
    tasksApi;

  const add = useCallback(
    (title: string, priority: Priority) => {
      const task = addTask(title, priority);
      toast({
        title: 'Tarea creada',
        description: `${quote(task.title)} · prioridad ${PRIORITIES[priority].label.toLowerCase()}`,
      });
      return task;
    },
    [addTask, toast],
  );

  const toggle = useCallback(
    (id: string) => {
      const task = toggleTask(id);
      if (!task) return;
      toast(
        task.completed
          ? { title: '¡Tarea completada!', description: quote(task.title) }
          : { title: 'Tarea marcada como pendiente', description: quote(task.title), variant: 'info' },
      );
    },
    [toggleTask, toast],
  );

  const remove = useCallback(
    (id: string) => {
      const removed = removeTask(id);
      if (!removed) return;
      toast({
        title: 'Tarea eliminada',
        description: quote(removed.task.title),
        variant: 'info',
        action: { label: 'Deshacer', onClick: () => restoreTask(removed) },
      });
    },
    [removeTask, restoreTask, toast],
  );

  const changePriority = useCallback(
    (id: string, priority: Priority) => {
      const task = tasks.find((item) => item.id === id);
      if (!task || task.priority === priority) return;
      setPriority(id, priority);
      toast({
        title: `Prioridad cambiada a ${PRIORITIES[priority].label.toLowerCase()}`,
        description: quote(task.title),
        variant: 'info',
      });
    },
    [setPriority, tasks, toast],
  );

  const clear = useCallback(() => {
    const previous = tasks;
    const removed = clearCompleted();
    if (removed.length === 0) return;
    toast({
      title: removed.length === 1 ? '1 tarea completada eliminada' : `${removed.length} tareas completadas eliminadas`,
      variant: 'info',
      action: { label: 'Deshacer', onClick: () => replaceTasks(previous) },
    });
  }, [clearCompleted, replaceTasks, tasks, toast]);

  const reset = useCallback(() => {
    const previous = resetToSample();
    toast({
      title: 'Demo restablecida',
      description: 'Se han cargado de nuevo las tareas de ejemplo.',
      variant: 'info',
      action: { label: 'Deshacer', onClick: () => replaceTasks(previous) },
    });
  }, [replaceTasks, resetToSample, toast]);

  return { ...tasksApi, add, toggle, remove, changePriority, clear, reset };
}
