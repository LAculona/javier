import '@fontsource/bungee/latin-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/latin-800.css';
import '@fontsource/rubik/latin-900.css';
import './ui/styles.css';
import { Game } from './Game.js';

const game = new Game();
window.__INKRUSH__ = game;
game.boot().catch((err) => {
  const el = document.getElementById('bootStatus');
  if (el) el.textContent = 'No se pudo iniciar: ' + (err && err.message ? err.message : err);
  throw err;
});
