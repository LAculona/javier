import { useCallback } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { formatClock, TIMER_DURATIONS, useFocusTimer, type TimerMode } from '../../hooks/useFocusTimer';
import { Button, IconButton } from '../ui/Button';
import { ProgressRing } from '../ui/ProgressRing';
import { SegmentedControl } from '../ui/SegmentedControl';

const MODE_LABELS: Record<TimerMode, string> = { focus: 'Enfoque', break: 'Descanso' };

export function FocusTimer() {
  const { toast } = useToast();
  const onComplete = useCallback(
    (mode: TimerMode) => {
      toast(
        mode === 'focus'
          ? { title: '¡Sesión completada!', description: 'Tómate 5 minutos de descanso.' }
          : { title: 'Descanso terminado', description: 'Listo para otra sesión de enfoque.', variant: 'info' },
      );
    },
    [toast],
  );
  const timer = useFocusTimer(onComplete);

  return (
    <section aria-labelledby="timer-title" className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="timer-title" className="text-sm font-medium text-fg-muted">
          Modo concentración
        </h3>
        <SegmentedControl
          label="Tipo de sesión"
          size="sm"
          value={timer.mode}
          onChange={timer.setMode}
          options={(Object.keys(MODE_LABELS) as TimerMode[]).map((mode) => ({
            value: mode,
            label: MODE_LABELS[mode],
            ariaLabel: `${MODE_LABELS[mode]}, ${TIMER_DURATIONS[mode] / 60} minutos`,
          }))}
        />
      </div>

      <div className="mt-5 flex items-center gap-5">
        <ProgressRing progress={timer.progress} size={88} stroke={6}>
          <span
            className="text-lg font-semibold text-fg tabular-nums"
            role="timer"
            aria-label={`Tiempo restante ${formatClock(timer.remaining)}`}
          >
            {formatClock(timer.remaining)}
          </span>
        </ProgressRing>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {timer.running ? (
            <Button variant="secondary" onClick={timer.pause} className="flex-1">
              <Pause className="size-4" aria-hidden="true" />
              Pausar
            </Button>
          ) : (
            <Button onClick={timer.start} className="flex-1">
              <Play className="size-4" aria-hidden="true" />
              {timer.isPristine ? 'Empezar' : 'Reanudar'}
            </Button>
          )}
          <IconButton label="Reiniciar temporizador" variant="secondary" onClick={timer.reset} disabled={timer.isPristine}>
            <RotateCcw className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </section>
  );
}
