import { PartyPopper, TrendingUp } from 'lucide-react';
import type { TaskStats } from '../../lib/taskStats';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { pluralize } from '../../lib/format';
import { ProgressBar } from '../ui/ProgressBar';

export function ProgressCard({ stats }: { stats: TaskStats }) {
  const percent = useAnimatedNumber(stats.completionRate);
  const allDone = stats.total > 0 && stats.pending === 0;

  return (
    <section aria-labelledby="progress-title" className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-center justify-between">
        <h3 id="progress-title" className="text-sm font-medium text-fg-muted">
          Progreso total
        </h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
          <TrendingUp className="size-3" aria-hidden="true" />+{stats.completedToday} <span className="sr-only">completadas</span>{' '}
          hoy
        </span>
      </div>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tracking-tight text-fg tabular-nums" data-testid="completion-percent">
          {percent}%
        </span>
        <span className="text-sm text-fg-muted">completado</span>
      </p>
      <ProgressBar value={stats.completionRate} label="Porcentaje de tareas completadas" className="mt-4" />
      <p className="mt-3 text-sm text-fg-muted" aria-live="polite">
        {allDone ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-success">
            <PartyPopper className="size-4" aria-hidden="true" />
            ¡Todo hecho! Disfruta del resto del día.
          </span>
        ) : (
          <>
            <strong className="font-semibold text-fg">{stats.completed}</strong> de {pluralize(stats.total, 'tarea')} completadas
          </>
        )}
      </p>
    </section>
  );
}
