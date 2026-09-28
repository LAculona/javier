import type { Priority } from '../types';

export interface PriorityMeta {
  value: Priority;
  label: string;
  /** Peso para ordenar: mayor = más urgente. */
  weight: number;
  /** Clases de color (texto + fondo suave) coherentes en claro y oscuro. */
  tone: string;
  dot: string;
}

export const PRIORITIES: Record<Priority, PriorityMeta> = {
  high: { value: 'high', label: 'Alta', weight: 3, tone: 'text-danger bg-danger-soft', dot: 'bg-danger' },
  medium: { value: 'medium', label: 'Media', weight: 2, tone: 'text-warning bg-warning-soft', dot: 'bg-warning' },
  low: { value: 'low', label: 'Baja', weight: 1, tone: 'text-info bg-info-soft', dot: 'bg-info' },
};

/** Orden de presentación en selectores y leyendas. */
export const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high'];

export function isPriority(value: unknown): value is Priority {
  return value === 'low' || value === 'medium' || value === 'high';
}
