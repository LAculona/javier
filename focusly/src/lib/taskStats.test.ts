import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { addDays } from './dates';
import { computeTaskStats } from './taskStats';

const NOW = new Date(2026, 8, 28, 12, 0, 0);

function task(partial: Partial<Task> & { completedDaysAgo?: number }): Task {
  const { completedDaysAgo, ...rest } = partial;
  const completedAt = completedDaysAgo === undefined ? null : addDays(NOW, -completedDaysAgo).toISOString();
  return {
    id: Math.random().toString(36),
    title: 'Tarea',
    priority: 'medium',
    createdAt: addDays(NOW, -10).toISOString(),
    completed: completedAt !== null,
    completedAt,
    ...rest,
  };
}

describe('computeTaskStats', () => {
  it('devuelve ceros con la lista vacía', () => {
    const stats = computeTaskStats([], NOW);
    expect(stats).toMatchObject({ total: 0, completed: 0, pending: 0, completionRate: 0, weeklyProductivity: 0, streak: 0 });
    expect(stats.week).toHaveLength(7);
    expect(stats.week.at(-1)?.isToday).toBe(true);
  });

  it('calcula porcentaje, pendientes por prioridad y productividad semanal', () => {
    const stats = computeTaskStats(
      [
        task({ priority: 'high' }),
        task({ priority: 'high' }),
        task({ priority: 'low' }),
        task({ completedDaysAgo: 0 }),
        task({ completedDaysAgo: 2 }),
        task({ completedDaysAgo: 20 }),
      ],
      NOW,
    );
    expect(stats.completed).toBe(3);
    expect(stats.pending).toBe(3);
    expect(stats.completionRate).toBe(50);
    expect(stats.pendingByPriority).toEqual({ high: 2, medium: 0, low: 1 });
    // 2 cerradas esta semana frente a 2 + 3 pendientes = 40 %
    expect(stats.completedThisWeek).toBe(2);
    expect(stats.weeklyProductivity).toBe(40);
    expect(stats.completedToday).toBe(1);
  });

  it('mantiene la racha viva si ayer hubo actividad aunque hoy aún no', () => {
    const tasks = [1, 2, 3].map((days) => task({ completedDaysAgo: days }));
    expect(computeTaskStats(tasks, NOW).streak).toBe(3);
    expect(computeTaskStats([...tasks, task({ completedDaysAgo: 0 })], NOW).streak).toBe(4);
  });

  it('corta la racha cuando falta un día', () => {
    const tasks = [0, 1, 3, 4].map((days) => task({ completedDaysAgo: days }));
    expect(computeTaskStats(tasks, NOW).streak).toBe(2);
    expect(computeTaskStats([task({ completedDaysAgo: 2 })], NOW).streak).toBe(0);
  });
});
