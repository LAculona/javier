import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { MATCH, COLORS } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  MatchManager · una partida de principio a fin
//  intro (sobrevuelo 3 s) → cuenta atrás (PREPARADOS, 3, 2, 1) →
//  juego (3 min) → final (cámara lenta, cámara aérea, suspense) →
//  resultados. reset() deja todo listo para jugar otra vez sin recargar.
// ─────────────────────────────────────────────────────────────

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const PHASE = {
  IDLE: 'idle',
  INTRO: 'intro',
  COUNTDOWN: 'countdown',
  PLAY: 'play',
  END: 'end',
  RESULTS: 'results'
};

export class MatchManager {
  constructor(game) {
    this.game = game;
    this.phase = PHASE.IDLE;
    this.phaseT = 0;
    this.remaining = MATCH.duration;
    this.countStep = -1;
    this.lastMinuteFired = false;
    this.lastSecond = -1;
    this.result = null;
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._ctrlPos = new THREE.Vector3();
    this._ctrlLook = new THREE.Vector3();
    this._endFrom = new THREE.Vector3();
    this._endLookFrom = new THREE.Vector3();
    // sobrevuelo: del lado rival, por encima de la plaza, hasta la espalda del jugador
    this.introPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-30, 46, 48),
      new THREE.Vector3(-14, 30, 8),
      new THREE.Vector3(-4, 16, -30),
      new THREE.Vector3(0, 6, -58)
    ]);
    this.introLook = new THREE.CatmullRomCurve3([
      new THREE.Vector3(6, 0, 0),
      new THREE.Vector3(0, 0, -12),
      new THREE.Vector3(0, 1, -40),
      new THREE.Vector3(0, 3, -48)
    ]);
  }

  get playing() {
    return this.phase === PHASE.PLAY;
  }

  /** Limpia la partida anterior y coloca a todos en su base. */
  reset() {
    const g = this.game;
    g.time.resetEffects();
    g.paint.clear();
    g.paint.resetTime();
    g.territory.reset();
    g.stats.reset();
    g.projectiles.clear();
    g.particles.clear();
    g.respawn.reset();
    g.deathCam.active = false;
    for (const c of g.characters) {
      g.health.reset(c);
      c.protectT = 0;
      c.invulnerable = false;
      c.flashExtra = 0;
      c.frozen = false;
      c.weapons.reset();
      c.weapons.equip(0, true);
      const slot = g.respawn.entries.get(c).slot;
      g.respawn.placeAtSpawn(c, slot);
      c.setVisible(true);
      c.animator.setEmotion(0, 0);
      const it = c.intent;
      it.moveX = it.moveZ = 0;
      it.fire = it.firePressed = it.jump = it.aim = it.run = it.reload = it.melee = false;
      it.switchTo = -1;
      it.switchDelta = 0;
    }
    if (g.ai) g.ai.reset();
    const sp = g.map.spawns[g.player.team][g.respawn.entries.get(g.player).slot];
    g.playerInput.setView(sp.yaw, -0.12);
    g.cameraCtrl.snap(g.player.position, sp.yaw, -0.12);
    this.remaining = MATCH.duration;
    this.lastMinuteFired = false;
    this.lastSecond = -1;
    this.result = null;
    this.countStep = -1;
  }

  start() {
    this.reset();
    this.setPhase(PHASE.INTRO);
    bus.emit('match:intro');
  }

  setPhase(p) {
    this.phase = p;
    this.phaseT = 0;
    const g = this.game;
    const f = g.flow;
    switch (p) {
      case PHASE.INTRO:
        Object.assign(f, { look: false, control: false, ai: false, combat: false, camera: 'free', territory: false });
        break;
      case PHASE.COUNTDOWN:
        Object.assign(f, { look: true, control: false, ai: false, combat: false, camera: 'player', territory: false });
        break;
      case PHASE.PLAY:
        Object.assign(f, { look: true, control: true, ai: true, combat: true, camera: 'player', territory: true });
        break;
      case PHASE.END:
        Object.assign(f, { look: false, control: false, ai: false, combat: false, camera: 'free', territory: false });
        break;
      case PHASE.RESULTS:
        Object.assign(f, { look: false, control: false, ai: false, combat: false, camera: 'free', territory: false });
        break;
      default:
        break;
    }
    g.health.enabled = f.combat;
  }

  /** Avanza la fase actual. dt = tiempo de juego, rdt = tiempo real. */
  update(dt, rdt) {
    this.phaseT += rdt;
    switch (this.phase) {
      case PHASE.INTRO:
        this.updateIntro();
        if (this.phaseT >= MATCH.introDuration) {
          this.setPhase(PHASE.COUNTDOWN);
          this.countStep = -1;
        }
        break;
      case PHASE.COUNTDOWN: {
        // PREPARADOS → 3 → 2 → 1 → ¡A PINTAR!
        const step = Math.floor(this.phaseT / MATCH.countdownStep);
        if (step !== this.countStep && step <= 3) {
          this.countStep = step;
          bus.emit('match:countdown', { step, label: step === 0 ? 'PREPARADOS' : String(4 - step) });
        }
        if (step >= 4) {
          this.setPhase(PHASE.PLAY);
          bus.emit('match:start');
        }
        break;
      }
      case PHASE.PLAY: {
        this.remaining = Math.max(0, this.remaining - dt);
        if (!this.lastMinuteFired && this.remaining <= MATCH.lastMinute) {
          this.lastMinuteFired = true;
          bus.emit('match:lastMinute');
        }
        const sec = Math.ceil(this.remaining);
        if (sec !== this.lastSecond) {
          this.lastSecond = sec;
          if (sec <= MATCH.finalCountdown && sec > 0) bus.emit('match:final', { seconds: sec });
        }
        if (this.remaining <= 0) this.finish();
        break;
      }
      case PHASE.END:
        this.updateEndCamera(rdt);
        this.updateFinalSample();
        if (this.phaseT >= MATCH.endSlowmo + 1.4) {
          this.computeResult();
          this.setPhase(PHASE.RESULTS);
          bus.emit('match:results', this.result);
        }
        break;
      case PHASE.RESULTS:
        this.updateEndCamera(rdt);
        this.celebrate(dt);
        break;
      default:
        break;
    }
  }

  /** Tiempo agotado: congelar, medir territorio y preparar resultados. */
  finish() {
    const g = this.game;
    this.remaining = 0;
    g.time.slowMotion(0.3, MATCH.endSlowmo);
    // la medición final se hace cuando aterrizan los últimos proyectiles
    this.finalSample = 'wait';
    this.finalVersion = -1;
    this.result = null;
    this._endFrom.copy(g.camera.position);
    this._endLookFrom.copy(g.camera.position).add(g.cameraCtrl.dir);
    g.deathCam.active = false;
    for (const c of g.characters) {
      c.intent.moveX = 0;
      c.intent.moveZ = 0;
      c.intent.fire = false;
    }
    this.setPhase(PHASE.END);
    bus.emit('match:end');
  }

  /** Lectura asíncrona del territorio final (sin bloquear la GPU). */
  updateFinalSample() {
    const tr = this.game.territory;
    if (this.finalSample === 'wait' && this.phaseT > 1.2 && !tr.pending) {
      this.game.paint.flush();
      this.finalVersion = tr.version;
      tr.sample();
      this.finalSample = 'pending';
    }
  }

  computeResult() {
    const g = this.game;
    const tr = g.territory;
    // si la lectura asíncrona no ha llegado a tiempo, medir de forma síncrona
    this.syncFallback = this.finalSample !== 'pending' || tr.pending || tr.version === this.finalVersion;
    if (this.syncFallback) {
      g.paint.flush();
      tr.sample(true);
    }
    const o = tr.orange;
    const b = tr.blue;
    const winner = Math.abs(o - b) < 1e-4 ? -1 : o > b ? 0 : 1;
    const rows = g.stats.table(g.characters, winner);
    this.result = { orange: o, blue: b, winner, rows, playerTeam: g.player.team };
  }

  updateIntro() {
    const g = this.game;
    const t = clamp01(this.phaseT / MATCH.introDuration);
    const e = smooth(t);
    // la curva termina donde estará la cámara al hombro
    this.introPath.getPoint(e, this._camPos);
    this.introLook.getPoint(e, this._camLook);
    g.updatePlayerCamera(1 / 60);
    this._ctrlPos.copy(g.cameraCtrl.position);
    this._ctrlLook.copy(g.cameraCtrl.position).add(g.cameraCtrl.dir);
    const k = smooth(clamp01((t - 0.62) / 0.38));
    this._camPos.lerp(this._ctrlPos, k);
    this._camLook.lerp(this._ctrlLook, k);
    g.cameraCtrl.setFree(this._camPos, this._camLook, 62 + (g.settings.fov - 62) * k);
  }

  /** Cámara que sube hasta una vista aérea que gira lentamente. */
  updateEndCamera(rdt) {
    const g = this.game;
    const T = this.phase === PHASE.END ? this.phaseT : MATCH.endSlowmo + 1.4 + this.phaseT;
    const a = 0.35 + T * 0.05;
    const R = 62;
    this._camPos.set(Math.sin(a) * R * 0.55, 74, -Math.cos(a) * R);
    this._camLook.set(0, 0, 0);
    const k = smooth(clamp01((T - 0.5) / 2.2));
    const pos = this._ctrlPos.copy(this._endFrom).lerp(this._camPos, k);
    const look = this._ctrlLook.copy(this._endLookFrom).lerp(this._camLook, k);
    g.cameraCtrl.setFree(pos, look, 58 - 8 * k);
    void rdt;
  }

  /** Resultados: los ganadores saltan de alegría. */
  celebrate(dt) {
    const g = this.game;
    const r = this.result;
    if (!r) return;
    for (const c of g.characters) {
      if (!c.alive) continue;
      const won = r.winner === c.team;
      c.intent.jump = false;
      if (won) {
        c.celebrateT = (c.celebrateT || Math.random()) - dt;
        if (c.celebrateT <= 0) {
          c.celebrateT = 0.9 + Math.random() * 0.6;
          c.intent.jump = true;
          c.intent.jumpHeld = true;
        }
        c.animator.setEmotion(4, 0.5);
      } else {
        c.animator.setEmotion(2, 0.5);
      }
    }
    // confeti ocasional sobre el mapa
    this._confT = (this._confT || 0) - dt;
    if (this._confT <= 0 && r.winner >= 0) {
      this._confT = 0.8;
      const col = COLORS.team[r.winner];
      g.particles.confetti((Math.random() - 0.5) * 40, 14, (Math.random() - 0.5) * 60, [col.main, col.accent, COLORS.cream, COLORS.yellow], 60, 16);
    }
  }

  /** Salir de la partida (al menú). */
  stop() {
    this.setPhase(PHASE.IDLE);
    this.game.time.resetEffects();
  }
}
