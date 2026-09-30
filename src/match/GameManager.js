import { bus } from '../core/EventBus.js';
import { GRAPHICS_PRESETS, DEFAULT_SETTINGS } from '../config.js';
import { MatchManager, PHASE } from './MatchManager.js';
import { MenuStage } from '../world/MenuStage.js';
import { UIManager } from '../ui/UIManager.js';
import { AudioManager } from '../audio/AudioManager.js';

// ─────────────────────────────────────────────────────────────
//  GameManager · flujo de la aplicación
//  menú (escena viva) ⇄ partida (intro, cuenta atrás, juego, final,
//  resultados) con pausa, captura del ratón y opciones persistentes.
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'inkrush.settings.v1';

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* almacenamiento no disponible: valores por defecto */
  }
  return { ...DEFAULT_SETTINGS };
}

export class GameManager {
  constructor(game) {
    this.game = game;
    this.mode = 'boot';
    this.paused = false;
    this.pausedAt = 0;
    this.lockSeen = false;
    // las opciones guardadas sustituyen a las de fábrica (mismo objeto compartido)
    Object.assign(game.settings, loadSettings());
    this.settings = game.settings;
  }

  /** Tras la carga: interfaz, escena de menú, partida y eventos. */
  init() {
    const g = this.game;
    this.match = new MatchManager(g);
    g.match = this.match;
    this.stage = new MenuStage(g);
    this.ui = new UIManager(g, this);
    this.hud = this.ui.hud;
    this.menus = this.ui.menus;
    this.audio = new AudioManager(g);
    g.audio = this.audio;
    this.applyGraphics(this.settings.graphics, true);
    bus.emit('settings:changed', this.settings);

    bus.on('input:key', (code) => {
      if (code !== 'Escape' && code !== 'KeyP') return;
      if (this.mode !== 'match') return;
      if (this.paused) {
        // el mismo ESC que liberó el ratón no debe reanudar la partida
        if (performance.now() - this.pausedAt < 400) return;
        if (this.menus.current === 'pause') this.resume();
        else this.menus.pop();
      } else if (this.canPause()) this.pause();
    });
    bus.on('input:lock', (locked) => {
      if (locked) {
        this.lockSeen = true;
        this.hud.setLockHint(false);
        return;
      }
      if (this.mode === 'match' && !this.paused && this.lockSeen && this.canPause()) this.pause();
    });
    bus.on('input:lockerror', () => {
      if (this.mode === 'match' && !this.paused) this.hud.setLockHint(true);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'match' && !this.paused && this.canPause()) this.pause();
    });
    g.renderer.canvas.addEventListener('mousedown', () => {
      if (this.mode === 'match' && !this.paused && this.canPause() && !g.input.locked) g.input.requestLock();
    });
    bus.on('match:end', () => {
      g.input.exitLock();
      this.hud.setLockHint(false);
    });
    bus.on('match:results', (r) => {
      this.hud.setMode('hidden');
      this.menus.showResults(r);
    });
    bus.on('match:start', () => this.hud.setMode('play'));
    bus.on('match:countdown', ({ step }) => {
      if (step === 0) this.hud.setMode('play');
    });

    const p = g.params;
    if (p.has('demo') || p.has('sandbox')) {
      // escenas de depuración de fases anteriores: mundo libre sin menú
      this.mode = 'sandbox';
      this.hud.setMode(p.has('hud') ? 'play' : 'hidden');
      if (p.has('hud')) this.hud.reset();
    } else if (p.has('autostart') || p.has('autoplay')) this.startMatch();
    else this.toMenu();
  }

  canPause() {
    const ph = this.match.phase;
    return ph === PHASE.INTRO || ph === PHASE.COUNTDOWN || ph === PHASE.PLAY;
  }

  // ── transiciones ──────────────────────────────────────────

  toMenu() {
    const g = this.game;
    this.setPaused(false);
    this.match.stop();
    g.input.exitLock();
    this.mode = 'menu';
    Object.assign(g.flow, { look: false, control: false, ai: false, combat: false, camera: 'free', territory: false });
    g.health.enabled = false;
    this.stage.enter();
    this.hud.setMode('hidden');
    this.hud.setLockHint(false);
    this.menus.show('main');
    bus.emit('mode:menu');
  }

  /** JUGAR (desde el menú): captura el ratón con el gesto del clic. */
  play() {
    this.game.input.requestLock();
    this.startMatch();
  }

  startMatch() {
    this.stage.exit();
    this.setPaused(false);
    this.mode = 'match';
    this.menus.show(null);
    this.hud.reset();
    this.match.start();
    this.hud.setMode('intro');
    bus.emit('mode:match');
  }

  restart() {
    this.game.input.requestLock();
    this.startMatch();
  }

  pause() {
    if (this.paused) return;
    this.pausedAt = performance.now();
    this.setPaused(true);
    this.game.input.exitLock();
    this.menus.show('pause');
    this.hud.setLockHint(false);
    bus.emit('game:pause', true);
  }

  resume() {
    if (!this.paused) return;
    this.game.input.requestLock();
    this.setPaused(false);
    this.menus.show(null);
    bus.emit('game:pause', false);
  }

  setPaused(v) {
    this.paused = v;
    this.game.time.paused = v;
    this.game.input.releaseAll();
  }

  // ── opciones ──────────────────────────────────────────────

  setSetting(key, value) {
    const s = this.settings;
    if (s[key] === value) return;
    s[key] = value;
    if (key === 'graphics') this.applyGraphics(value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* sin almacenamiento: la opción dura hasta cerrar la pestaña */
    }
    bus.emit('settings:changed', s);
  }

  /** Aplica un preset: resolución, sombras, AO, bloom, SMAA y pintura. */
  applyGraphics(name, force = false) {
    const g = this.game;
    const preset = GRAPHICS_PRESETS[name] || GRAPHICS_PRESETS.medium;
    if (!force && g.preset === preset) return;
    g.preset = preset;
    g.renderer.applyPreset(preset);
    g.lighting.configureShadow(preset.shadowExtent, preset.shadowMapSize, preset.shadowRadius);
    g.postfx.applyPreset(preset);
    g.paint.setQuality(preset.paintQuality);
  }

  /**
   * Resolución adaptativa: si el rendimiento cae por debajo de ~50 FPS de
   * forma sostenida, baja la escala de render (hasta el 70 % del preset);
   * si sobra margen, la recupera poco a poco.
   */
  adaptResolution(rdt) {
    const g = this.game;
    if (g.params.has('frames') || g.params.has('fixedres')) return;
    const r = g.renderer;
    const base = g.preset.renderScale;
    this.fpsT = (this.fpsT || 0) + rdt;
    if (this.fpsT < 1) return;
    this.fpsT = 0;
    const fps = g.time.fps;
    this.slow = fps < 50 ? (this.slow || 0) + 1 : 0;
    this.fast = fps > 58 ? (this.fast || 0) + 1 : 0;
    let s = r.renderScale;
    if (this.slow >= 2 && s > base * 0.7 + 1e-3) s = Math.max(base * 0.7, s - 0.08);
    else if (this.fast >= 5 && s < base - 1e-3) s = Math.min(base, s + 0.04);
    else return;
    this.slow = 0;
    this.fast = 0;
    r.renderScale = s;
    r.resize();
  }

  // ── bucle ─────────────────────────────────────────────────

  /** dt: tiempo de juego (escalado), rdt: tiempo real. */
  update(dt, rdt) {
    const g = this.game;
    if (this.mode === 'menu') {
      this.stage.update(dt, rdt);
      g.update(dt);
    } else if (this.mode === 'sandbox') {
      g.update(dt);
    } else if (this.mode === 'match' && !this.paused) {
      this.match.update(dt, rdt);
      g.update(dt);
      // sin ratón capturado (p. ej. tras un error de pointer lock): pedir un clic
      const ph = this.match.phase;
      if (ph === PHASE.PLAY || ph === PHASE.COUNTDOWN) this.hud.setLockHint(!g.input.locked && !g.autoplay && !g.params.has('autostart'));
    }
    this.ui.update(rdt);
    this.audio.update(rdt);
    if (!this.paused) this.adaptResolution(rdt);
  }
}
