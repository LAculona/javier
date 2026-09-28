import type { Priority, Task } from '../types';
import { addDays, toDateKey, weekdayInitial, weekdayName } from './dates';

export interface DayActivity {
  key: string;
  /** Inicial del día («L», «M», «X»...). */
  label: string;
  /** Nombre completo del día, para lectores de pantalla. */
  name: string;
  count: number;
  isToday: boolean;
}

export interface TaskStats {
  total: number;
  completed: number;
  pending: number;
  /** Porcentaje entero (0-100) de tareas completadas. */
  completionRate: number;
  pendingByPriority: Record<Priority, number>;
  /** Actividad de los últimos 7 días, del más antiguo a hoy. */
  week: DayActivity[];
  completedThisWeek: number;
  /**
   * Productividad semanal (0-100): tareas cerradas en los últimos 7 días
   * frente a toda la carga de la semana (cerradas + pendientes).
   */
  weeklyProductivity: number;
  /** Días consecutivos con al menos una tarea completada. */
  streak: number;
  completedToday: number;
}

const WEEK_LENGTH = 7;

export function computeTaskStats(tasks: Task[], now: Date = new Date()): TaskStats {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const pending = total - completed;

  const pendingByPriority: Record<Priority, number> = { low: 0, medium: 0, high: 0 };
  const completionsByDay = new Map<string, number>();

  for (const task of tasks) {
    if (!task.completed) {
      pendingByPriority[task.priority] += 1;
    } else if (task.completedAt) {
      const key = toDateKey(new Date(task.completedAt));
      completionsByDay.set(key, (completionsByDay.get(key) ?? 0) + 1);
    }
  }

  const todayKey = toDateKey(now);
  const week: DayActivity[] = [];
  for (let offset = WEEK_LENGTH - 1; offset >= 0; offset -= 1) {
    const day = addDays(now, -offset);
    const key = toDateKey(day);
    week.push({
      key,
      label: weekdayInitial(day),
      name: weekdayName(day),
      count: completionsByDay.get(key) ?? 0,
      isToday: key === todayKey,
    });
  }

  const completedThisWeek = week.reduce((sum, day) => sum + day.count, 0);
  const weeklyLoad = completedThisWeek + pending;

  return {
    total,
    completed,
    pending,
    completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
    pendingByPriority,
    week,
    completedThisWeek,
    weeklyProductivity: weeklyLoad === 0 ? 0 : Math.round((completedThisWeek / weeklyLoad) * 100),
    streak: computeStreak(completionsByDay, now),
    completedToday: completionsByDay.get(todayKey) ?? 0,
  };
}

/**
 * La racha sigue viva si hoy todavía no se ha completado nada pero ayer sí:
 * así no se «pierde» a primera hora de la mañana.
 */
export function computeStreak(completionsByDay: Map<string, number>, now: Date = new Date()): number {
  let cursor = now;
  if (!completionsByDay.has(toDateKey(cursor))) {
    cursor = addDays(cursor, -1);
  }
  let streak = 0;
  while (completionsByDay.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
