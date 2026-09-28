import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { parseTasks, tasksReducer } from './tasksReducer';

const make = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: `Tarea ${id}`,
  priority: 'medium',
  completed: false,
  createdAt: '2026-09-20T10:00:00.000Z',
  completedAt: null,
  ...extra,
});

describe('tasksReducer', () => {
  const initial = [make('a'), make('b'), make('c', { completed: true, completedAt: '2026-09-21T10:00:00.000Z' })];

  it('añade tareas al principio', () => {
    expect(tasksReducer(initial, { type: 'add', task: make('z') }).map((t) => t.id)).toEqual(['z', 'a', 'b', 'c']);
  });

  it('alterna el estado y registra/limpia la fecha de finalización', () => {
    const done = tasksReducer(initial, { type: 'toggle', id: 'a', now: '2026-09-28T09:00:00.000Z' });
    expect(done[0]).toMatchObject({ completed: true, completedAt: '2026-09-28T09:00:00.000Z' });
    const undone = tasksReducer(done, { type: 'toggle', id: 'a', now: 'x' });
    expect(undone[0]).toMatchObject({ completed: false, completedAt: null });
  });

  it('elimina y restaura en la misma posición', () => {
    const removed = tasksReducer(initial, { type: 'remove', id: 'b' });
    expect(removed.map((t) => t.id)).toEqual(['a', 'c']);
    const restored = tasksReducer(removed, { type: 'restore', task: initial[1]!, index: 1 });
    expect(restored.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    // Restaurar dos veces no duplica
    expect(tasksReducer(restored, { type: 'restore', task: initial[1]!, index: 1 })).toBe(restored);
  });

  it('cambia la prioridad sin tocar el resto', () => {
    const next = tasksReducer(initial, { type: 'setPriority', id: 'b', priority: 'high' });
    expect(next[1]?.priority).toBe('high');
    expect(next[0]).toBe(initial[0]);
  });

  it('limpia las completadas', () => {
    expect(tasksReducer(initial, { type: 'clearCompleted' }).map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('parseTasks', () => {
  it('acepta datos válidos', () => {
    const data = [make('a')];
    expect(parseTasks(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('rechaza datos corruptos o con forma incorrecta', () => {
    expect(parseTasks(null)).toBeNull();
    expect(parseTasks({})).toBeNull();
    expect(parseTasks([{ id: 1 }])).toBeNull();
    expect(parseTasks([{ ...make('a'), priority: 'urgent' }])).toBeNull();
    expect(parseTasks([{ ...make('a'), createdAt: 'no-es-fecha' }])).toBeNull();
  });
});
