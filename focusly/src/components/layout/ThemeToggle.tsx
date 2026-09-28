import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/cn';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Activar modo claro' : 'Activar modo oscuro';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-theme-state={theme}
      className={cn(
        'relative grid size-10 place-items-center overflow-hidden rounded-xl border border-line bg-surface text-fg-muted shadow-soft',
        'transition-colors hover:border-line-strong hover:text-fg',
        className,
      )}
    >
      <Sun
        aria-hidden="true"
        className={cn(
          'absolute size-[18px] transition-all duration-300',
          isDark ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100',
        )}
      />
      <Moon
        aria-hidden="true"
        className={cn(
          'absolute size-[18px] transition-all duration-300',
          isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-90 opacity-0',
        )}
      />
    </button>
  );
}
