import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Texto accesible alternativo si `label` no es solo texto. */
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
}

/**
 * Grupo de opciones exclusivas con el patrón «radiogroup» de WAI-ARIA:
 * Tab entra en la opción activa y las flechas cambian de opción.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
  fullWidth = false,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (index: number) => {
    const option = options[(index + options.length) % options.length];
    if (!option) return;
    onChange(option.value);
    refs.current[options.indexOf(option)]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: options.length - 1,
    };
    const target = keys[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('rounded-xl border border-line bg-subtle p-1', fullWidth ? 'flex w-full' : 'inline-flex', className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.ariaLabel}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-all duration-200',
              size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-4 text-sm',
              fullWidth && 'min-w-0 flex-1 px-2 text-[13px] sm:px-3 sm:text-sm',
              checked ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
