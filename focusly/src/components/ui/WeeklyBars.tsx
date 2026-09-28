import type { DayActivity } from '../../lib/taskStats';
import { cn } from '../../lib/cn';

interface WeeklyBarsProps {
  week: DayActivity[];
  className?: string;
  /** Altura del área de barras en px. */
  height?: number;
  showLabels?: boolean;
}

/** Mini gráfico de barras de los últimos 7 días. */
export function WeeklyBars({ week, className, height = 64, showLabels = true }: WeeklyBarsProps) {
  const max = Math.max(1, ...week.map((day) => day.count));
  const summary = week.map((day) => `${day.isToday ? 'hoy' : day.name}: ${day.count}`).join(', ');
  return (
    <div
      className={cn('w-full', className)}
      role="img"
      aria-label={`Tareas completadas por día en los últimos 7 días. ${summary}`}
    >
      <div className="flex items-end gap-1.5" style={{ height }} aria-hidden="true">
        {week.map((day) => (
          <div key={day.key} className="flex h-full flex-1 items-end">
            <div
              className={cn(
                'w-full rounded-md transition-[height] duration-700 ease-out-soft',
                day.count === 0 ? 'bg-muted' : day.isToday ? 'bg-accent' : 'bg-accent/35 dark:bg-accent/45',
              )}
              style={{ height: day.count === 0 ? 4 : `${Math.max(12, (day.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      {showLabels && (
        <div className="mt-2 flex gap-1.5" aria-hidden="true">
          {week.map((day) => (
            <span
              key={day.key}
              className={cn('flex-1 text-center text-[11px] font-medium', day.isToday ? 'text-accent-text' : 'text-fg-subtle')}
            >
              {day.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
