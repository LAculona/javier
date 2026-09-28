import type { LucideIcon } from 'lucide-react';
import { CalendarDays, ChartColumn, Flag, ListTodo, RefreshCw, Timer } from 'lucide-react';

export interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
  highlights: string[];
}

export const FEATURES: Feature[] = [
  {
    title: 'Gestión de tareas',
    description: 'Captura cualquier idea en segundos y conviértela en una tarea clara, con el contexto que necesitas.',
    icon: ListTodo,
    highlights: ['Creación rápida con teclado', 'Subtareas y notas'],
  },
  {
    title: 'Estadísticas',
    description: 'Descubre cuándo rindes más con métricas semanales, rachas y tendencias fáciles de entender.',
    icon: ChartColumn,
    highlights: ['Informe semanal', 'Rachas diarias'],
  },
  {
    title: 'Prioridades',
    description: 'Marca lo urgente con prioridad alta, media o baja y deja que Focusly ordene tu lista por ti.',
    icon: Flag,
    highlights: ['Tres niveles visuales', 'Orden automático'],
  },
  {
    title: 'Organización diaria',
    description: 'Empieza cada mañana con un plan realista: Focusly te propone qué hacer hoy según tu carga.',
    icon: CalendarDays,
    highlights: ['Vista «Hoy»', 'Planificación semanal'],
  },
  {
    title: 'Sincronización',
    description: 'Tus tareas te acompañan en el móvil, la tableta y el ordenador, siempre actualizadas al instante.',
    icon: RefreshCw,
    highlights: ['Web, iOS y Android', 'Funciona sin conexión'],
  },
  {
    title: 'Modo concentración',
    description: 'Bloques de trabajo Pomodoro sin distracciones, con descansos automáticos y sonido ambiente.',
    icon: Timer,
    highlights: ['Sesiones de 25 minutos', 'Bloqueo de avisos'],
  },
];
