import { useMemo, useRef, useState } from 'react';
import { CloudCheck, CloudOff, RotateCcw, Trash2 } from 'lucide-react';
import type { TaskFilter } from '../../types';
import { useTaskActions } from '../../hooks/useTaskActions';
import { filterTasks } from '../../lib/taskFilters';
import { Button } from '../ui/Button';
import { Container } from '../ui/Container';
import { Reveal } from '../ui/Reveal';
import { SectionHeader } from '../ui/SectionHeader';
import { FocusTimer } from './FocusTimer';
import { PriorityBreakdown } from './PriorityBreakdown';
import { ProgressCard } from './ProgressCard';
import { TaskComposer } from './TaskComposer';
import { TaskFilters } from './TaskFilters';
import { TaskList } from './TaskList';

export function Dashboard() {
  const { tasks, stats, persisted, toggle, remove, changePriority, clear, reset } = useTaskActions();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleTasks = useMemo(() => filterTasks(tasks, filter), [tasks, filter]);
  const counts = { all: stats.total, pending: stats.pending, completed: stats.completed };

  return (
    <section id="demo" aria-labelledby="demo-title" className="border-y border-line bg-surface/60 py-20 outline-none sm:py-28">
      <Container>
        <SectionHeader
          id="demo-title"
          eyebrow="Demostración en vivo"
          title="Pruébalo ahora, sin registrarte"
          description="Esta demo funciona de verdad: crea, prioriza y completa tareas. Todo se guarda en tu navegador, así que seguirá aquí cuando vuelvas."
        />

        <Reveal className="mt-12 grid grid-cols-1 gap-6 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* En móvil el progreso va primero; en escritorio pasa a la columna derecha. */}
          <div className="lg:col-start-2 lg:row-start-1">
            <ProgressCard stats={stats} />
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-fg">Mis tareas</h3>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                  {persisted ? (
                    <>
                      <CloudCheck className="size-3.5 text-success" aria-hidden="true" />
                      Guardado automáticamente en este navegador
                    </>
                  ) : (
                    <>
                      <CloudOff className="size-3.5 text-warning" aria-hidden="true" />
                      El almacenamiento local no está disponible: los cambios no se guardarán
                    </>
                  )}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Restablecer demo
              </Button>
            </div>

            <TaskComposer inputRef={inputRef} />

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TaskFilters value={filter} onChange={setFilter} counts={counts} />
              <Button
                variant="ghost"
                size="sm"
                onClick={clear}
                disabled={stats.completed === 0}
                className="self-end sm:self-auto"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Limpiar completadas
              </Button>
            </div>

            <div className="mt-4">
              <TaskList
                tasks={visibleTasks}
                filter={filter}
                onToggle={toggle}
                onDelete={remove}
                onPriorityChange={changePriority}
                fallbackFocusRef={inputRef}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 content-start gap-6 sm:grid-cols-2 lg:col-start-2 lg:row-start-2 lg:grid-cols-1">
            <PriorityBreakdown stats={stats} />
            <FocusTimer />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
