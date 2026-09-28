import type { TaskStats } from '../../lib/taskStats';
import { PRIORITIES } from '../../data/priorities';
import { cn } from '../../lib/cn';
import type { Priority } from '../../types';

const ORDER: Priority[] = ['high', 'medium', 'low'];

export function PriorityBreakdown({ stats }: { stats: TaskStats }) {
  const max = Math.max(1, ...ORDER.map((priority) => stats.pendingByPriority[priority]));
  return (
    <section aria-labelledby="breakdown-title" className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <h3 id="breakdown-title" className="text-sm font-medium text-fg-muted">
        Pendientes por prioridad
      </h3>
      <ul className="mt-4 space-y-3.5">
        {ORDER.map((priority) => {
          const count = stats.pendingByPriority[priority];
          const meta = PRIORITIES[priority];
          return (
            <li key={priority}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-fg">
                  <span className={cn('size-2 rounded-full', meta.dot)} aria-hidden="true" />
                  {meta.label}
                </span>
                <span className="font-medium text-fg tabular-nums">{count}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div
                  className={cn('h-full rounded-full transition-[width] duration-700 ease-out-soft', meta.dot)}
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
