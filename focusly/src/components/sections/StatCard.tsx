import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { cn } from '../../lib/cn';

interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
  icon: LucideIcon;
  iconTone: string;
  caption: ReactNode;
  children?: ReactNode;
  testId?: string;
}

export function StatCard({ label, value, suffix, icon: Icon, iconTone, caption, children, testId }: StatCardProps) {
  const display = useAnimatedNumber(value);
  return (
    <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lifted sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-fg-muted">{label}</h3>
        <span className={cn('grid size-9 place-items-center rounded-xl', iconTone)}>
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-fg tabular-nums sm:text-4xl" data-testid={testId}>
        {display}
        {suffix && <span className="ml-1 text-lg font-medium text-fg-subtle">{suffix}</span>}
      </p>
      <p className="mt-1 text-sm text-fg-muted">{caption}</p>
      {children && <div className="mt-auto pt-5">{children}</div>}
    </article>
  );
}
