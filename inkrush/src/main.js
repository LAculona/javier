// INKRUSH entry point.
import { GameManager } from './core/GameManager.js';

function showError(err) {
  const box = document.getElementById('errorBox');
  box.classList.remove('hidden');
  box.textContent = 'No se pudo iniciar INKRUSH.\n\n' + (err && err.message ? err.message : String(err)) +
    '\n\nComprueba que tu navegador soporta WebGL2.';
  document.getElementById('loading')?.classList.add('hidden');
  console.error(err);
}

window.addEventListener('DOMContentLoaded', () => {
  // Give the loading screen a frame to paint before the heavy setup.
  requestAnimationFrame(() => setTimeout(() => {
    try {
      window.__inkrush = new GameManager(document.getElementById('game'));
    } catch (err) {
      showError(err);
    }
  }, 30));
});
