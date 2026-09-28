import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse' | 'inverse-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent shadow-soft hover:bg-accent-hover active:translate-y-px disabled:bg-accent/50 dark:disabled:bg-accent/40',
  secondary: 'border border-line bg-surface text-fg shadow-soft hover:border-line-strong hover:bg-subtle active:translate-y-px',
  ghost: 'text-fg-muted hover:bg-subtle hover:text-fg',
  danger: 'text-fg-muted hover:bg-danger-soft hover:text-danger',
  // Para fondos oscuros fijos (banner final), iguales en modo claro y oscuro.
  inverse: 'bg-white text-zinc-950 shadow-soft hover:bg-zinc-200 active:translate-y-px',
  'inverse-ghost': 'text-zinc-300 ring-1 ring-white/15 hover:bg-white/10 hover:text-white',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 rounded-lg px-3 text-sm',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-6 text-base',
};

export function buttonClasses({ variant = 'primary', size = 'md', fullWidth = false }: StyleProps = {}): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out-soft',
    'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:translate-y-0',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & StyleProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, fullWidth, className, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonClasses({ variant, size, fullWidth }), className)} {...props} />;
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Texto accesible obligatorio: el botón solo muestra un icono. */
  label: string;
  variant?: 'ghost' | 'danger' | 'secondary';
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', className, type = 'button', title, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-lg transition-colors duration-200',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...props}
    />
  );
});
