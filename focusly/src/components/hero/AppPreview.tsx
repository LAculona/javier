import { Bell, CalendarDays, ChartColumn, Check, Flame, House, Inbox, Search, Timer } from 'lucide-react';
import { useTaskActions } from '../../hooks/useTaskActions';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { formatLongDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { ProgressRing } from '../ui/ProgressRing';
import { WeeklyBars } from '../ui/WeeklyBars';
import { PriorityBadge } from '../ui/PriorityBadge';

const SIDEBAR_ITEMS = [
  { label: 'Hoy', icon: House, active: true },
  { label: 'Bandeja', icon: Inbox },
  { label: 'Calendario', icon: CalendarDays },
  { label: 'Estadísticas', icon: ChartColumn },
  { label: 'Concentración', icon: Timer },
];

const PREVIEW_LIMIT = 4;

/**
 * Réplica en miniatura de la app, conectada a las mismas tareas que el dashboard:
 * marcar una tarea aquí actualiza el progreso, las estadísticas y la demo.
 */
export function AppPreview() {
  const { tasks, stats, toggle } = useTaskActions();
  const percent = useAnimatedNumber(stats.completionRate);

  // Orden estable (el mismo que la demo) para que las tareas no salten al marcarlas.
  const visibleTasks = tasks.slice(0, PREVIEW_LIMIT);

  return (
    <figure aria-label="Vista previa interactiva de la aplicación Focusly" className="relative">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-lifted">
        {/* Barra de ventana */}
        <div className="flex items-center gap-3 border-b border-line bg-subtle/60 px-4 py-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
          </div>
          <div
            className="mx-auto flex h-7 w-full max-w-60 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-xs text-fg-subtle"
            aria-hidden="true"
          >
            <Search className="size-3.5" />
            Buscar tareas…
          </div>
          <Bell className="size-4 text-fg-subtle" aria-hidden="true" />
        </div>

        <div className="flex">
          {/* Barra lateral: solo cuando hay espacio suficiente */}
          <nav aria-hidden="true" className="hidden w-44 shrink-0 border-r border-line p-3 sm:block">
            <ul className="space-y-0.5">
              {SIDEBAR_ITEMS.map(({ label, icon: Icon, active }) => (
                <li
                  key={label}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium',
                    active ? 'bg-accent-soft text-accent-text' : 'text-fg-muted',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-xl border border-line p-3">
              <p className="text-[11px] font-medium text-fg-subtle">Esta semana</p>
              <WeeklyBars week={stats.week} height={40} className="mt-2" />
            </div>
          </nav>

          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-fg-subtle">{formatLongDate(new Date())}</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight text-fg">Mi día</p>
              </div>
              <ProgressRing progress={stats.completionRate / 100} size={56} stroke={5}>
                <span className="text-xs font-semibold text-fg tabular-nums">{percent}%</span>
              </ProgressRing>
            </div>

            <ul className="mt-4 space-y-2">
              {visibleTasks.map((task) => (
                <li key={task.id}>
                  <label
                    className={cn(
                      'group flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors',
                      'hover:border-line-strong hover:bg-subtle/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggle(task.id)}
                      aria-label={task.title}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-[18px] shrink-0 place-items-center rounded-md border transition-colors',
                        task.completed
                          ? 'border-accent bg-accent text-on-accent'
                          : 'border-line-strong group-hover:border-accent',
                      )}
                    >
                      <Check
                        className={cn('size-3 transition-transform', task.completed ? 'scale-100' : 'scale-0')}
                        strokeWidth={3}
                      />
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[13px] font-medium transition-colors',
                        task.completed ? 'text-fg-subtle line-through' : 'text-fg',
                      )}
                    >
                      {task.title}
                    </span>
                    <PriorityBadge priority={task.priority} className="hidden shrink-0 min-[400px]:inline-flex" />
                  </label>
                </li>
              ))}
              {visibleTasks.length === 0 && (
                <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[13px] text-fg-subtle">
                  No hay tareas. ¡Crea una en la demo!
                </li>
              )}
            </ul>

            <dl className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-subtle px-3 py-2.5">
                <dt className="text-[11px] font-medium text-fg-subtle">Hechas</dt>
                <dd className="mt-0.5 text-base font-semibold text-fg tabular-nums">{stats.completed}</dd>
              </div>
              <div className="rounded-xl bg-subtle px-3 py-2.5">
                <dt className="text-[11px] font-medium text-fg-subtle">Pendientes</dt>
                <dd className="mt-0.5 text-base font-semibold text-fg tabular-nums">{stats.pending}</dd>
              </div>
              <div className="rounded-xl bg-subtle px-3 py-2.5">
                <dt className="text-[11px] font-medium text-fg-subtle">Racha</dt>
                <dd className="mt-0.5 flex items-center gap-1 text-base font-semibold text-fg tabular-nums">
                  {stats.streak}
                  <Flame className="size-3.5 text-orange-500" aria-hidden="true" />
                  <span className="sr-only">días</span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Tarjetas flotantes decorativas: solo en pantallas grandes */}
      <div
        aria-hidden="true"
        className="absolute -bottom-7 -left-8 hidden animate-float items-center gap-3 rounded-2xl border border-line bg-surface p-3 pr-4 shadow-card xl:flex"
      >
        <span className="grid size-9 place-items-center rounded-xl bg-orange-500/10 text-orange-500">
          <Flame className="size-5" />
        </span>
        <span>
          <span className="block text-[11px] text-fg-subtle">Racha actual</span>
          <span className="block text-sm font-semibold text-fg">{stats.streak} días seguidos</span>
        </span>
      </div>
      <div
        aria-hidden="true"
        className="absolute -top-7 -right-6 hidden animate-float items-center gap-3 rounded-2xl border border-line bg-surface p-3 pr-4 shadow-card [animation-delay:-3s] xl:flex"
      >
        <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent-text">
          <Timer className="size-5" />
        </span>
        <span>
          <span className="block text-[11px] text-fg-subtle">Modo concentración</span>
          <span className="block text-sm font-semibold text-fg tabular-nums">25:00</span>
        </span>
      </div>
    </figure>
  );
}
