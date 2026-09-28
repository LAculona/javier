import type { Priority, Task } from '../types';
import { isPriority } from '../data/priorities';

export type TasksAction =
  | { type: 'add'; task: Task }
  | { type: 'toggle'; id: string; now: string }
  | { type: 'remove'; id: string }
  | { type: 'restore'; task: Task; index: number }
  | { type: 'setPriority'; id: string; priority: Priority }
  | { type: 'clearCompleted' }
  | { type: 'replace'; tasks: Task[] };

export function tasksReducer(state: Task[], action: TasksAction): Task[] {
  switch (action.type) {
    case 'add':
      return [action.task, ...state];
    case 'toggle':
      return state.map((task) =>
        task.id === action.id ? { ...task, completed: !task.completed, completedAt: task.completed ? null : action.now } : task,
      );
    case 'remove':
      return state.filter((task) => task.id !== action.id);
    case 'restore': {
      if (state.some((task) => task.id === action.task.id)) return state;
      const next = [...state];
      next.splice(Math.min(Math.max(action.index, 0), next.length), 0, action.task);
      return next;
    }
    case 'setPriority':
      return state.map((task) =>
        task.id === action.id && task.priority !== action.priority ? { ...task, priority: action.priority } : task,
      );
    case 'clearCompleted':
      return state.filter((task) => !task.completed);
    case 'replace':
      return action.tasks;
    default:
      return state;
  }
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/** Valida datos externos (localStorage) antes de usarlos como estado. */
export function parseTasks(raw: unknown): Task[] | null {
  if (!Array.isArray(raw)) return null;
  const tasks: Task[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.title !== 'string' ||
      !isPriority(candidate.priority) ||
      typeof candidate.completed !== 'boolean' ||
      !isValidDate(candidate.createdAt) ||
      !(candidate.completedAt === null || isValidDate(candidate.completedAt))
    ) {
      return null;
    }
    tasks.push({
      id: candidate.id,
      title: candidate.title,
      priority: candidate.priority,
      completed: candidate.completed,
      createdAt: candidate.createdAt,
      completedAt: candidate.completed ? (candidate.completedAt as string | null) : null,
    });
  }
  return tasks;
}
