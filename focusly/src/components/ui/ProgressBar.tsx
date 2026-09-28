import { cn } from '../../lib/cn';

interface ProgressBarProps {
  value: number;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function ProgressBar({ value, label, className, size = 'md' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={`${clamped}%`}
      className={cn('w-full overflow-hidden rounded-full bg-muted', size === 'sm' ? 'h-1.5' : 'h-2.5', className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out-soft"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
