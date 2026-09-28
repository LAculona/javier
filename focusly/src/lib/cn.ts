import { twMerge } from 'tailwind-merge';

/**
 * Une clases condicionales y resuelve conflictos de Tailwind
 * (p. ej. `inline-flex` + `hidden`): gana siempre la última.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(' '));
}
