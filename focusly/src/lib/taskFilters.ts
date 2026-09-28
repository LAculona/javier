import type { Task, TaskFilter } from '../types';

export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  if (filter === 'pending') return tasks.filter((task) => !task.completed);
  if (filter === 'completed') return tasks.filter((task) => task.completed);
  return tasks;
}

export function matchesFilter(task: Task, filter: TaskFilter): boolean {
  if (filter === 'pending') return !task.completed;
  if (filter === 'completed') return task.completed;
  return true;
}
