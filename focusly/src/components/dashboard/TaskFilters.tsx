import type { TaskFilter } from '../../types';
import { SegmentedControl } from '../ui/SegmentedControl';
import { cn } from '../../lib/cn';

interface TaskFiltersProps {
  value: TaskFilter;
  onChange: (filter: TaskFilter) => void;
  counts: Record<TaskFilter, number>;
}

const LABELS: Record<TaskFilter, string> = { all: 'Todas', pending: 'Pendientes', completed: 'Completadas' };
const ORDER: TaskFilter[] = ['all', 'pending', 'completed'];

export function TaskFilters({ value, onChange, counts }: TaskFiltersProps) {
  return (
    <SegmentedControl
      label="Filtrar tareas"
      value={value}
      onChange={onChange}
      size="sm"
      className="w-full sm:w-auto"
      fullWidth
      options={ORDER.map((filter) => ({
        value: filter,
        ariaLabel: `${LABELS[filter]} (${counts[filter]})`,
        label: (
          <>
            {LABELS[filter]}
            <span
              aria-hidden="true"
              className={cn(
                'rounded-md px-1.5 text-xs tabular-nums transition-colors max-[419px]:hidden',
                value === filter ? 'bg-accent-soft text-accent-text' : 'bg-muted text-fg-subtle',
              )}
            >
              {counts[filter]}
            </span>
          </>
        ),
      }))}
    />
  );
}
