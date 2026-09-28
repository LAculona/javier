import { CircleCheck, Flame, ListTodo, TrendingUp } from 'lucide-react';
import { useTasks } from '../../context/TasksContext';
import { pluralize } from '../../lib/format';
import { cn } from '../../lib/cn';
import { Container } from '../ui/Container';
import { ProgressBar } from '../ui/ProgressBar';
import { Reveal } from '../ui/Reveal';
import { SectionHeader } from '../ui/SectionHeader';
import { WeeklyBars } from '../ui/WeeklyBars';
import { StatCard } from './StatCard';

export function StatsSection() {
  const { stats } = useTasks();
  const highPending = stats.pendingByPriority.high;

  return (
    <section id="estadisticas" aria-labelledby="stats-title" className="py-20 outline-none sm:py-28">
      <Container>
        <SectionHeader
          id="stats-title"
          eyebrow="Estadísticas"
          title="Tu productividad, de un vistazo"
          description="Estas métricas se calculan en tiempo real con las tareas de la demo. Completa una tarea arriba y observa cómo cambian."
        />

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-16 lg:gap-6 xl:grid-cols-4">
          <Reveal>
            <StatCard
              label="Tareas completadas"
              value={stats.completed}
              icon={CircleCheck}
              iconTone="bg-success-soft text-success"
              caption={`${stats.completionRate}% de tu lista`}
              testId="stat-completed"
            >
              <ProgressBar value={stats.completionRate} label="Tareas completadas sobre el total" size="sm" />
            </StatCard>
          </Reveal>
          <Reveal delay={80}>
            <StatCard
              label="Tareas pendientes"
              value={stats.pending}
              icon={ListTodo}
              iconTone="bg-warning-soft text-warning"
              caption={
                highPending > 0 ? `${pluralize(highPending, 'con prioridad alta', 'con prioridad alta')}` : 'Ninguna urgente'
              }
              testId="stat-pending"
            >
              <div className="flex h-1.5 gap-1 overflow-hidden rounded-full" aria-hidden="true">
                {(['high', 'medium', 'low'] as const).map((priority) => (
                  <div
                    key={priority}
                    className={cn(
                      'h-full rounded-full transition-[flex-grow] duration-700',
                      priority === 'high' ? 'bg-danger' : priority === 'medium' ? 'bg-warning' : 'bg-info',
                    )}
                    style={{ flexGrow: stats.pendingByPriority[priority] }}
                  />
                ))}
                {stats.pending === 0 && <div className="h-full flex-1 rounded-full bg-muted" />}
              </div>
            </StatCard>
          </Reveal>
          <Reveal delay={160}>
            <StatCard
              label="Productividad semanal"
              value={stats.weeklyProductivity}
              suffix="%"
              icon={TrendingUp}
              iconTone="bg-accent-soft text-accent-text"
              caption={`${pluralize(stats.completedThisWeek, 'tarea cerrada', 'tareas cerradas')} en 7 días`}
              testId="stat-weekly"
            >
              <WeeklyBars week={stats.week} height={44} />
            </StatCard>
          </Reveal>
          <Reveal delay={240}>
            <StatCard
              label="Racha de días"
              value={stats.streak}
              suffix={stats.streak === 1 ? 'día' : 'días'}
              icon={Flame}
              iconTone="bg-orange-500/10 text-orange-600 dark:text-orange-400"
              caption={stats.completedToday > 0 ? '¡Hoy ya has sumado!' : 'Completa una tarea hoy para mantenerla'}
              testId="stat-streak"
            >
              <ol className="flex gap-1.5" aria-label="Actividad de los últimos 7 días">
                {stats.week.map((day) => (
                  <li key={day.key} className="flex flex-1 flex-col items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-7 place-items-center rounded-full text-[11px] font-semibold transition-colors',
                        day.count > 0 ? 'bg-orange-500 text-orange-950' : 'bg-muted text-fg-subtle',
                        day.isToday && day.count === 0 && 'ring-2 ring-orange-500/40',
                      )}
                    >
                      {day.label}
                    </span>
                    <span className="sr-only">
                      {day.isToday ? 'Hoy' : day.name}: {day.count > 0 ? 'con actividad' : 'sin actividad'}
                    </span>
                  </li>
                ))}
              </ol>
            </StatCard>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
