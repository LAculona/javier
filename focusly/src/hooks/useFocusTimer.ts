import { useCallback, useEffect, useRef, useState } from 'react';

export type TimerMode = 'focus' | 'break';

export const TIMER_DURATIONS: Record<TimerMode, number> = { focus: 25 * 60, break: 5 * 60 };

interface TimerState {
  mode: TimerMode;
  /** Segundos restantes cuando el temporizador está en pausa. */
  remaining: number;
  /** Marca de tiempo de fin mientras está en marcha. */
  endsAt: number | null;
}

/**
 * Temporizador Pomodoro basado en la hora real (no en contar ticks),
 * así no se desincroniza si la pestaña queda en segundo plano.
 */
export function useFocusTimer(onComplete?: (mode: TimerMode) => void) {
  const [state, setState] = useState<TimerState>({ mode: 'focus', remaining: TIMER_DURATIONS.focus, endsAt: null });
  const [now, setNow] = useState(() => Date.now());
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const running = state.endsAt !== null;
  const remaining = running ? Math.max(0, Math.ceil(((state.endsAt ?? 0) - now) / 1000)) : state.remaining;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running || remaining > 0) return;
    const finished = state.mode;
    const next: TimerMode = finished === 'focus' ? 'break' : 'focus';
    setState({ mode: next, remaining: TIMER_DURATIONS[next], endsAt: null });
    onCompleteRef.current?.(finished);
  }, [remaining, running, state.mode]);

  const start = useCallback(() => {
    const current = Date.now();
    setNow(current);
    setState((previous) => (previous.endsAt !== null ? previous : { ...previous, endsAt: current + previous.remaining * 1000 }));
  }, []);

  const pause = useCallback(() => {
    setState((previous) =>
      previous.endsAt === null
        ? previous
        : { ...previous, remaining: Math.max(0, Math.ceil((previous.endsAt - Date.now()) / 1000)), endsAt: null },
    );
  }, []);

  const reset = useCallback(() => {
    setState((previous) => ({ ...previous, remaining: TIMER_DURATIONS[previous.mode], endsAt: null }));
  }, []);

  const setMode = useCallback((mode: TimerMode) => {
    setState({ mode, remaining: TIMER_DURATIONS[mode], endsAt: null });
  }, []);

  const total = TIMER_DURATIONS[state.mode];

  return {
    mode: state.mode,
    remaining,
    running,
    total,
    progress: 1 - remaining / total,
    isPristine: !running && remaining === total,
    start,
    pause,
    reset,
    setMode,
  };
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
