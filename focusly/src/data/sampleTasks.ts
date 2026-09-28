import type { Priority, Task } from '../types';
import { addDays } from '../lib/dates';
import { createId } from '../lib/id';

interface SampleTask {
  title: string;
  priority: Priority;
  /** Días atrás en que se creó. */
  createdDaysAgo: number;
  /** Días atrás en que se completó (`null` = pendiente). */
  completedDaysAgo: number | null;
}

// Las tareas completadas en días consecutivos generan una racha inicial de 4 días:
// al completar cualquier tarea hoy, la racha sube a 5 y se ve el efecto en vivo.
const SAMPLE_TASKS: SampleTask[] = [
  { title: 'Preparar la presentación trimestral', priority: 'high', createdDaysAgo: 2, completedDaysAgo: null },
  { title: 'Revisar el feedback del equipo de diseño', priority: 'medium', createdDaysAgo: 1, completedDaysAgo: null },
  { title: 'Planificar el sprint de la próxima semana', priority: 'high', createdDaysAgo: 0, completedDaysAgo: null },
  { title: 'Llamar al proveedor de hosting', priority: 'low', createdDaysAgo: 3, completedDaysAgo: null },
  { title: 'Actualizar la documentación de la API', priority: 'medium', createdDaysAgo: 4, completedDaysAgo: 1 },
  { title: 'Enviar la factura de septiembre', priority: 'high', createdDaysAgo: 5, completedDaysAgo: 2 },
  { title: 'Leer 20 páginas de «Deep Work»', priority: 'low', createdDaysAgo: 6, completedDaysAgo: 3 },
  { title: 'Ordenar las notas de la reunión', priority: 'low', createdDaysAgo: 6, completedDaysAgo: 4 },
];

export function createSampleTasks(now: Date = new Date()): Task[] {
  return SAMPLE_TASKS.map((sample, index) => {
    // Pequeño desfase por índice para que el orden sea estable y realista.
    const created = addDays(now, -sample.createdDaysAgo);
    created.setHours(9, 0 + index, 0, 0);
    let completedAt: string | null = null;
    if (sample.completedDaysAgo !== null) {
      const completed = addDays(now, -sample.completedDaysAgo);
      completed.setHours(17, 30, 0, 0);
      completedAt = completed.toISOString();
    }
    return {
      id: createId(),
      title: sample.title,
      priority: sample.priority,
      completed: completedAt !== null,
      createdAt: created.toISOString(),
      completedAt,
    };
  });
}
