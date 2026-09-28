import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { MAX_TASKS, normalizeTitle, validateTaskTitle } from './taskValidation';

const base: Task = {
  id: '1',
  title: 'Enviar informe',
  priority: 'low',
  completed: false,
  createdAt: new Date().toISOString(),
  completedAt: null,
};

describe('validateTaskTitle', () => {
  it('rechaza títulos vacíos o solo con espacios', () => {
    expect(validateTaskTitle('', [])).toMatch(/Escribe un título/);
    expect(validateTaskTitle('    ', [])).toMatch(/Escribe un título/);
  });

  it('exige una longitud mínima y máxima', () => {
    expect(validateTaskTitle('ab', [])).toMatch(/al menos 3/);
    expect(validateTaskTitle('a'.repeat(81), [])).toMatch(/80/);
    expect(validateTaskTitle('abc', [])).toBeNull();
  });

  it('detecta duplicados pendientes sin distinguir mayúsculas ni espacios', () => {
    expect(validateTaskTitle('  enviar   INFORME ', [base])).toMatch(/Ya tienes/);
    expect(validateTaskTitle('Enviar informe', [{ ...base, completed: true }])).toBeNull();
  });

  it('respeta el límite de tareas', () => {
    const many = Array.from({ length: MAX_TASKS }, (_, i) => ({ ...base, id: String(i), title: `Tarea ${i}` }));
    expect(validateTaskTitle('Nueva tarea', many)).toMatch(/límite/);
  });

  it('normaliza espacios', () => {
    expect(normalizeTitle('  hola   mundo ')).toBe('hola mundo');
  });
});
