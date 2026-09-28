import type { Task } from '../types';

export const TITLE_MIN_LENGTH = 3;
export const TITLE_MAX_LENGTH = 80;
export const MAX_TASKS = 50;

/** Normaliza espacios para comparar y guardar títulos. */
export function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

/** Devuelve un mensaje de error legible o `null` si el título es válido. */
export function validateTaskTitle(rawTitle: string, tasks: Task[]): string | null {
  const title = normalizeTitle(rawTitle);
  if (title.length === 0) return 'Escribe un título para la tarea.';
  if (title.length < TITLE_MIN_LENGTH) {
    return `El título debe tener al menos ${TITLE_MIN_LENGTH} caracteres.`;
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return `El título no puede superar los ${TITLE_MAX_LENGTH} caracteres.`;
  }
  const lower = title.toLocaleLowerCase('es');
  if (tasks.some((task) => !task.completed && task.title.toLocaleLowerCase('es') === lower)) {
    return 'Ya tienes una tarea pendiente con ese título.';
  }
  if (tasks.length >= MAX_TASKS) {
    return `Has alcanzado el límite de ${MAX_TASKS} tareas de la demo. Elimina alguna para continuar.`;
  }
  return null;
}
