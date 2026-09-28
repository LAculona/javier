/**
 * Desplaza suavemente hasta una sección y le pasa el foco, para que la
 * navegación por teclado y los lectores de pantalla continúen desde allí.
 */
export function scrollToSection(id: string): void {
  const element = document.getElementById(id);
  if (!element) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  if (window.location.hash !== `#${id}`) {
    window.history.pushState(null, '', `#${id}`);
  }
  if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');
  element.focus({ preventScroll: true });
}
