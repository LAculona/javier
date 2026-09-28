export type Priority = 'low' | 'medium' | 'high';

export type TaskFilter = 'all' | 'pending' | 'completed';

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  completed: boolean;
  /** Fecha ISO de creación. */
  createdAt: string;
  /** Fecha ISO en la que se completó, o `null` si sigue pendiente. */
  completedAt: string | null;
}

export type Theme = 'light' | 'dark';

export type BillingCycle = 'monthly' | 'yearly';

export type PlanId = 'free' | 'pro' | 'team';
