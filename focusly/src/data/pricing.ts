import type { BillingCycle, PlanId } from '../types';

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  /** Precio por mes (y por usuario en el plan Equipo) según el ciclo. */
  price: Record<BillingCycle, number>;
  unit: string;
  cta: string;
  features: string[];
  recommended?: boolean;
}

export const YEARLY_DISCOUNT_LABEL = '-20%';

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Gratis',
    description: 'Para organizar tu día a día sin complicaciones.',
    price: { monthly: 0, yearly: 0 },
    unit: '/mes',
    cta: 'Empezar gratis',
    features: ['Hasta 50 tareas activas', 'Prioridades y filtros', 'Estadísticas básicas', 'Sincronización en 2 dispositivos'],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Para quien quiere sacar el máximo partido a su tiempo.',
    price: { monthly: 8, yearly: 6.4 },
    unit: '/mes',
    cta: 'Probar Pro 14 días',
    recommended: true,
    features: [
      'Tareas y proyectos ilimitados',
      'Estadísticas avanzadas y rachas',
      'Modo concentración con sonidos',
      'Recordatorios inteligentes',
      'Sincronización ilimitada',
    ],
  },
  {
    id: 'team',
    name: 'Equipo',
    description: 'Para equipos que planifican y avanzan juntos.',
    price: { monthly: 14, yearly: 11.2 },
    unit: '/usuario/mes',
    cta: 'Crear espacio de equipo',
    features: [
      'Todo lo incluido en Pro',
      'Espacios y listas compartidas',
      'Roles y permisos',
      'Informes de equipo',
      'Soporte prioritario',
    ],
  },
];
