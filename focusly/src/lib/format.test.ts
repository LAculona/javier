import { describe, expect, it } from 'vitest';
import { formatPrice, pluralize } from './format';
import { formatRelativeDay } from './dates';

describe('formatPrice', () => {
  it('muestra decimales solo cuando hacen falta', () => {
    expect(formatPrice(8).replace(/\s/g, ' ')).toBe('8 €');
    expect(formatPrice(6.4).replace(/\s/g, ' ')).toBe('6,40 €');
  });
});

describe('pluralize', () => {
  it('elige singular o plural', () => {
    expect(pluralize(1, 'tarea')).toBe('1 tarea');
    expect(pluralize(3, 'tarea')).toBe('3 tareas');
  });
});

describe('formatRelativeDay', () => {
  const now = new Date(2026, 8, 28, 12);
  it('describe fechas cercanas', () => {
    expect(formatRelativeDay(new Date(2026, 8, 28, 8).toISOString(), now)).toBe('hoy');
    expect(formatRelativeDay(new Date(2026, 8, 27, 23).toISOString(), now)).toBe('ayer');
    expect(formatRelativeDay(new Date(2026, 8, 24).toISOString(), now)).toBe('hace 4 días');
  });
});
