import { ChevronDown } from 'lucide-react';
import type { Priority } from '../../types';
import { PRIORITIES, PRIORITY_ORDER, isPriority } from '../../data/priorities';
import { cn } from '../../lib/cn';

interface PrioritySelectProps {
  id?: string;
  value: Priority;
  onChange: (priority: Priority) => void;
  /** Etiqueta accesible cuando no hay un <label> visible asociado. */
  ariaLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  title?: string;
}

/** Selector nativo (accesible por defecto) con estilo propio y color según prioridad. */
export function PrioritySelect({ id, value, onChange, ariaLabel, size = 'md', className, disabled, title }: PrioritySelectProps) {
  const meta = PRIORITIES[value];
  return (
    <div className={cn('relative inline-flex', className)} title={title}>
      <span
        className={cn('pointer-events-none absolute top-1/2 left-3 size-2 -translate-y-1/2 rounded-full', meta.dot)}
        aria-hidden="true"
      />
      <select
        id={id}
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => {
          if (isPriority(event.target.value)) onChange(event.target.value);
        }}
        className={cn(
          'w-full appearance-none rounded-lg border border-line bg-surface pr-8 pl-7 font-medium text-fg',
          'transition-colors hover:border-line-strong focus-visible:border-accent',
          'disabled:cursor-not-allowed disabled:opacity-60',
          size === 'sm' ? 'h-8 text-xs' : 'h-11 text-sm',
        )}
      >
        {PRIORITY_ORDER.map((priority) => (
          <option key={priority} value={priority}>
            {PRIORITIES[priority].label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-subtle"
        aria-hidden="true"
      />
    </div>
  );
}
