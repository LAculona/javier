import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import type { Priority, Task } from '../types';
import { createSampleTasks } from '../data/sampleTasks';
import { createId } from '../lib/id';
import { readStorage, STORAGE_KEYS, writeStorage } from '../lib/storage';
import { computeTaskStats, type TaskStats } from '../lib/taskStats';
import { normalizeTitle } from '../lib/taskValidation';
import { parseTasks, tasksReducer } from '../state/tasksReducer';

export interface RemovedTask {
  task: Task;
  index: number;
}

interface TasksContextValue {
  tasks: Task[];
  stats: TaskStats;
  /** `false` si localStorage no está disponible (modo privado, cuota llena...). */
  persisted: boolean;
  addTask: (title: string, priority: Priority) => Task;
  toggleTask: (id: string) => Task | null;
  removeTask: (id: string) => RemovedTask | null;
  restoreTask: (removed: RemovedTask) => void;
  setPriority: (id: string, priority: Priority) => void;
  clearCompleted: () => Task[];
  replaceTasks: (tasks: Task[]) => void;
  resetToSample: () => Task[];
}

const TasksContext = createContext<TasksContextValue | null>(null);

function loadInitialTasks(): Task[] {
  return readStorage(STORAGE_KEYS.tasks, parseTasks) ?? createSampleTasks();
}

/** Fuerza un recálculo de las estadísticas cuando cambia el día (p. ej. a medianoche). */
function useCurrentDay(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => {
      const current = new Date();
      setNow((previous) => (previous.toDateString() === current.toDateString() ? previous : current));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, dispatch] = useReducer(tasksReducer, undefined, loadInitialTasks);
  const [persisted, setPersisted] = useState(true);
  const today = useCurrentDay();

  useEffect(() => {
    setPersisted(writeStorage(STORAGE_KEYS.tasks, tasks));
  }, [tasks]);

  // Sincroniza entre pestañas abiertas del mismo navegador.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.tasks || event.newValue === null) return;
      try {
        const parsed = parseTasks(JSON.parse(event.newValue));
        if (parsed) dispatch({ type: 'replace', tasks: parsed });
      } catch {
        /* valor corrupto: se ignora */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const stats = useMemo(() => computeTaskStats(tasks, today), [tasks, today]);

  const addTask = useCallback((title: string, priority: Priority) => {
    const task: Task = {
      id: createId(),
      title: normalizeTitle(title),
      priority,
      completed: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    dispatch({ type: 'add', task });
    return task;
  }, []);

  const toggleTask = useCallback(
    (id: string) => {
      const task = tasks.find((item) => item.id === id);
      if (!task) return null;
      dispatch({ type: 'toggle', id, now: new Date().toISOString() });
      return { ...task, completed: !task.completed };
    },
    [tasks],
  );

  const removeTask = useCallback(
    (id: string) => {
      const index = tasks.findIndex((item) => item.id === id);
      const task = tasks[index];
      if (!task) return null;
      dispatch({ type: 'remove', id });
      return { task, index };
    },
    [tasks],
  );

  const restoreTask = useCallback(({ task, index }: RemovedTask) => {
    dispatch({ type: 'restore', task, index });
  }, []);

  const setPriority = useCallback((id: string, priority: Priority) => {
    dispatch({ type: 'setPriority', id, priority });
  }, []);

  const clearCompleted = useCallback(() => {
    const removed = tasks.filter((task) => task.completed);
    dispatch({ type: 'clearCompleted' });
    return removed;
  }, [tasks]);

  const replaceTasks = useCallback((next: Task[]) => {
    dispatch({ type: 'replace', tasks: next });
  }, []);

  const resetToSample = useCallback(() => {
    const previous = tasks;
    dispatch({ type: 'replace', tasks: createSampleTasks() });
    return previous;
  }, [tasks]);

  const value = useMemo<TasksContextValue>(
    () => ({
      tasks,
      stats,
      persisted,
      addTask,
      toggleTask,
      removeTask,
      restoreTask,
      setPriority,
      clearCompleted,
      replaceTasks,
      resetToSample,
    }),
    [
      tasks,
      stats,
      persisted,
      addTask,
      toggleTask,
      removeTask,
      restoreTask,
      setPriority,
      clearCompleted,
      replaceTasks,
      resetToSample,
    ],
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks(): TasksContextValue {
  const context = useContext(TasksContext);
  if (!context) throw new Error('useTasks debe usarse dentro de <TasksProvider>');
  return context;
}
