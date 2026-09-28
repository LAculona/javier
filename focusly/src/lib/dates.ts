const DAY_MS = 24 * 60 * 60 * 1000;

/** Clave de día local con formato AAAA-MM-DD. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, amount: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

/** Días naturales entre dos fechas (b - a), ignorando la hora. */
export function diffInDays(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

const weekdayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });
const longDateFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Inicial del día de la semana: «L», «M», «X»... */
export function weekdayInitial(date: Date): string {
  // En español el miércoles se abrevia con «X» para no confundirlo con el martes.
  if (date.getDay() === 3) return 'X';
  return weekdayFormatter.format(date).charAt(0).toUpperCase();
}

const weekdayLongFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

export function weekdayName(date: Date): string {
  return weekdayLongFormatter.format(date);
}

export function formatLongDate(date: Date): string {
  const text = longDateFormatter.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «hoy», «ayer», «hace 3 días»... */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const days = diffInDays(new Date(iso), now);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days < 14) return 'hace 1 semana';
  if (days < 31) return `hace ${Math.floor(days / 7)} semanas`;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(iso));
}
