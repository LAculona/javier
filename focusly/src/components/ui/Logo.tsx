import { cn } from '../../lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-accent" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="white" strokeWidth="2.5" opacity="0.45" />
      <path d="M11.5 16.2l3 3 6-6.4" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight text-fg">Focusly</span>
    </span>
  );
}
