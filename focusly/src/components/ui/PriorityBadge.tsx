import type { Priority } from '../../types';
import { PRIORITIES } from '../../data/priorities';
import { cn } from '../../lib/cn';

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const meta = PRIORITIES[priority];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', meta.tone, className)}>
      <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
