import { bus } from '../core/EventBus.js';
import { SynthSFX } from './SynthSFX.js';
import { MusicGenerator } from './MusicGenerator.js';

// ─────────────────────────────────────────────────────────────
//  AudioManager · mezcla y reproducción
//  Buses música / SFX / UI → master → compresor → salida. Los disparos e
//  impactos de los bots suenan en 3D (PannerNode HRTF) respecto a la
//  cámara. Límite de voces y de frecuencia por tipo de sonido para que
//  el caos de pintura no sature. Se desbloquea con el primer gesto.
// ─────────────────────────────────────────────────────────────

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class AudioManager {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.ok = false;
    this.last = new Map(); // limitador por categoría
    this.voices = 0;
    this.squelchT = 0;
    this.surfLevel = 0;
    this.rollLevel = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      this.ctx = null;
      return;
    }
    this.ok = true;
    this.buildGraph();
    this.sfx = new SynthSFX(this.ctx);
    this.music = new MusicGenerator(this.ctx, this.musicBus, this.sfx);
    this.buildLoops();
    this.bindEvents();
    // desbloqueo con el primer gesto del usuario
    const unlock = () => {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      this.music.start();
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  buildGraph() {
    const ctx = this.ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(this.comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.uiBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.uiBus.connect(this.master);
    this.musicBus.gain.value = 0.35;
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = 0;
      L.positionY.value = 0;
      L.positionZ.value = 0;
    }
  }

  /** Bucles continuos del jugador: surf y rodillo. */
  buildLoops() {
    const ctx = this.ctx;
    const loop = (type, freq, q, pink) => {
      const src = ctx.createBufferSource();
      src.buffer = pink ? this.sfx.pink : this.sfx.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.sfxBus);
      src.start();
      return { src, f, g };
    };
    this.surf = loop('bandpass', 1800, 1.4, false);
    // zumbido tonal del surf
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 320;
    const og = ctx.createGain();
    og.gain.value = 0;
    o.connect(og).connect(this.sfxBus);
    o.start();
    this.surfTone = { o, g: og };
    this.roll = loop('lowpass', 380, 3, true);
  }

  bindEvents() {
    const g = this.game;
    const isP = (c) => c === g.player;
    bus.on('settings:changed', (s) => this.applyVolumes(s));
    bus.on('weapon:shot', ({ character, weapon, strength }) => {
      if (weapon.id === 'roller') return; // el barrido tiene su propio evento
      if (isP(character)) this.play('shot', (o, t) => this.sfx.shot(o, t, weapon.id, strength), 0.012);
      else this.play3D('botshot', character.position, (o, t) => this.sfx.shotLite(o, t, weapon.id), 0.045, 1.2, 32);
    });
    bus.on('weapon:flick', ({ character }) => {
      if (isP(character)) this.play('flick', (o, t) => this.sfx.shot(o, t, 'roller'), 0.05);
      else this.play3D('botflick', character.position, (o, t) => this.sfx.shot(o, t, 'roller'), 0.05);
    });
    bus.on('weapon:dry', ({ character }) => {
      if (isP(character)) this.play('dry', (o, t) => this.sfx.dry(o, t), 0.25);
    });
    bus.on('weapon:switch', ({ character }) => {
      if (isP(character)) this.play('switch', (o, t) => this.sfx.switchWeapon(o, t), 0.1);
    });
    bus.on('weapon:reload', ({ character }) => {
      if (isP(character)) this.play('reload', (o, t) => this.sfx.reload(o, t, 1.3), 0.3);
      else this.play3D('botreload', character.position, (o, t) => this.sfx.reload(o, t, 1.2, 0.6), 0.6, 0.8, 16);
    });
    bus.on('weapon:reloaded', ({ character }) => {
      if (isP(character)) this.play('reloaded', (o, t) => this.sfx.reloaded(o, t), 0.1);
    });
    bus.on('weapon:melee', ({ character }) => {
      if (isP(character)) this.play('melee', (o, t) => this.sfx.melee(o, t), 0.1);
      else this.play3D('botmelee', character.position, (o, t) => this.sfx.melee(o, t), 0.1);
    });
    bus.on('weapon:meleeHit', ({ character, hit }) => {
      if (hit) this.play3D('meleehit', character.position, (o, t) => this.sfx.meleeHit(o, t), 0.05, 1.3);
    });
    bus.on('damage', (e) => {
      if (isP(e.victim)) this.play('hurt', (o, t) => this.sfx.hurt(o, t, clamp(e.amount / 30, 0.5, 1.2)), 0.07);
      if (isP(e.attacker) && !e.lethal) this.play('hit', (o, t) => this.sfx.hitmarker(o, t, e.crit ? 1 : 0), 0.03, this.uiBus);
    });
    bus.on('kill', (e) => {
      if (isP(e.killer)) this.play('killchime', (o, t) => this.sfx.hitmarker(o, t, 2), 0.05, this.uiBus);
      if (isP(e.victim)) this.play('ko', (o, t) => this.sfx.ko(o, t), 0.2);
      else this.play3D('splashko', e.victim.position, (o, t) => this.sfx.splash(o, t, 1), 0.05, 1.6);
    });
    bus.on('streak', ({ character, streak }) => {
      if (isP(character) && streak >= 2) this.play('streak', (o, t) => this.sfx.streak(o, t + 0.25, streak), 0.2, this.uiBus);
    });
    bus.on('respawn:drop', ({ character }) => {
      if (isP(character)) this.play('whistle', (o, t) => this.sfx.whistle(o, t), 0.3);
    });
    bus.on('respawn:landed', ({ character }) => {
      if (isP(character)) this.play('land_spawn', (o, t) => this.sfx.splash(o, t, 0.8), 0.2);
      else this.play3D('botland', character.position, (o, t) => this.sfx.splash(o, t, 0.7), 0.1);
    });
    // partida
    bus.on('match:countdown', ({ step }) => {
      if (step === 0) this.play('ready', (o, t) => this.sfx.ready(o, t), 0.2, this.uiBus);
      else this.play('beep', (o, t) => this.sfx.beep(o, t, 660), 0.2, this.uiBus);
    });
    bus.on('match:start', () => {
      this.play('go', (o, t) => this.sfx.go(o, t), 0.2, this.uiBus);
      this.music.setMood('match');
    });
    bus.on('match:lastMinute', () => {
      this.play('alarm', (o, t) => this.sfx.alarm(o, t), 0.5, this.uiBus);
      this.music.setMood('last');
    });
    bus.on('match:final', ({ seconds }) => {
      this.play('tick', (o, t) => this.sfx.tick(o, t, seconds <= 3), 0.3, this.uiBus);
      if (seconds === 10) this.music.setMood('final');
    });
    bus.on('match:end', () => {
      this.play('horn', (o, t) => this.sfx.horn(o, t), 0.5, this.uiBus);
      this.music.muffle(true, 1.2);
      this.music.fade(0.35, 1.5);
    });
    bus.on('results:reveal', ({ win, draw }) => {
      this.play('result', (o, t) => (win || draw ? this.sfx.win(o, t) : this.sfx.lose(o, t)), 0.5, this.uiBus);
      this.music.setMood('results');
      this.music.muffle(false, 2.5);
      this.music.fade(0.9, 3);
    });
    bus.on('mode:menu', () => {
      this.music.setMood('menu');
      this.music.muffle(false, 0.6);
      this.music.fade(0.9, 0.6);
    });
    bus.on('mode:match', () => {
      this.music.setMood('match');
      this.music.muffle(false, 0.4);
      this.music.fade(0.9, 0.4);
    });
    bus.on('game:pause', (p) => {
      this.music.muffle(p, 0.35);
      this.music.fade(p ? 0.6 : 0.9, 0.35);
      if (p) {
        this.surf.g.gain.value = 0;
        this.surfTone.g.gain.value = 0;
        this.roll.g.gain.value = 0;
      }
    });
    // interfaz
    bus.on('ui:hover', () => this.play('uihover', (o, t) => this.sfx.uiHover(o, t), 0.04, this.uiBus));
    bus.on('ui:click', () => this.play('uiclick', (o, t) => this.sfx.uiClick(o, t), 0.05, this.uiBus));
    // impactos de pintura contra el mundo
    g.projectiles.onWorldHit = (p, x, y, z) => {
      const own = isP(p.owner);
      if (own) this.play3D('impact_own', { x, y, z }, (o, t) => this.sfx.impact(o, t, 0.9), 0.05, 1, 30);
      else this.play3D('impact', { x, y, z }, (o, t) => this.sfx.impactLite(o, t, 0.8), 0.08, 1, 20);
    };
  }

  applyVolumes(s) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(clamp(s.masterVolume, 0, 1), t, 0.03);
    this.musicBus.gain.setTargetAtTime(clamp(s.musicVolume, 0, 1) * 0.55, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(clamp(s.sfxVolume, 0, 1), t, 0.03);
    this.uiBus.gain.setTargetAtTime(clamp(s.sfxVolume, 0, 1) * 0.9, t, 0.03);
  }

  /** ¿Puede sonar ya esta categoría? (limitador de frecuencia y de voces) */
  allow(key, minGap) {
    if (!this.ok || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    const l = this.last.get(key);
    if (l !== undefined && now - l < minGap) return false;
    this.last.set(key, now);
    return true;
  }

  /** Sonido directo (no posicional) en el bus indicado. */
  play(key, fn, minGap = 0, out = this.sfxBus) {
    if (!this.allow(key, minGap)) return;
    fn(out, this.ctx.currentTime + 0.005);
  }

  /** Sonido posicional: panner HRTF en la posición del mundo. */
  play3D(key, pos, fn, minGap = 0, gain = 1, maxDist = 45) {
    if (!this.ok) return;
    const cam = this.game.camera.position;
    const d = Math.hypot(pos.x - cam.x, pos.y - cam.y, pos.z - cam.z);
    if (d > maxDist) return;
    if (!this.allow(key, minGap)) return;
    if (this.voices > 24) return;
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower'; // HRTF es caro en CPU con decenas de disparos por segundo
    p.distanceModel = 'inverse';
    p.refDistance = 3.5;
    p.rolloffFactor = 1.15;
    p.maxDistance = 60;
    const t = ctx.currentTime + 0.005;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y + 0.8;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y + 0.8, pos.z);
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(p).connect(this.sfxBus);
    fn(g, t);
    this.voices++;
    // liberar el panner cuando el sonido haya terminado
    setTimeout(() => {
      this.voices--;
      g.disconnect();
      p.disconnect();
    }, 2200);
  }

  /** Por fotograma: oyente = cámara; bucles de surf, rodillo y chapoteo. */
  update(dt) {
    if (!this.ok || this.ctx.state !== 'running') return;
    const g = this.game;
    const cam = g.camera;
    const L = this.ctx.listener;
    const e = cam.matrixWorld.elements;
    const fx = -e[8];
    const fy = -e[9];
    const fz = -e[10];
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setTargetAtTime(cam.position.x, t, 0.02);
      L.positionY.setTargetAtTime(cam.position.y, t, 0.02);
      L.positionZ.setTargetAtTime(cam.position.z, t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02);
      L.forwardY.setTargetAtTime(fy, t, 0.02);
      L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.value = e[4];
      L.upY.value = e[5];
      L.upZ.value = e[6];
    } else {
      L.setPosition(cam.position.x, cam.position.y, cam.position.z);
      L.setOrientation(fx, fy, fz, e[4], e[5], e[6]);
    }

    const p = g.player;
    const m = p.motor;
    const active = g.gm.mode === 'match' && !g.gm.paused && p.alive;
    const speed = Math.hypot(m.vel.x, m.vel.z);
    const t = this.ctx.currentTime;
    // surf
    const surf = active && m.surfing ? clamp(speed / 12, 0.3, 1) : 0;
    this.surfLevel += (surf - this.surfLevel) * (1 - Math.exp(-dt * 10));
    this.surf.g.gain.setTargetAtTime(this.surfLevel * 0.16, t, 0.03);
    this.surf.f.frequency.setTargetAtTime(1200 + speed * 110, t, 0.05);
    this.surfTone.g.gain.setTargetAtTime(this.surfLevel * 0.035, t, 0.03);
    this.surfTone.o.frequency.setTargetAtTime(240 + speed * 22, t, 0.05);
    // rodillo rodando
    const roll = active && p.rolling && m.grounded ? clamp(speed / 7, 0.2, 1) : 0;
    this.rollLevel += (roll - this.rollLevel) * (1 - Math.exp(-dt * 12));
    this.roll.g.gain.setTargetAtTime(this.rollLevel * 0.35, t, 0.03);
    this.roll.f.frequency.setTargetAtTime(260 + speed * 40, t, 0.05);
    // chapoteo sobre pintura enemiga
    this.squelchT -= dt;
    if (active && m.paint === -1 && m.grounded && speed > 1 && this.squelchT <= 0) {
      this.squelchT = clamp(1.6 / speed, 0.18, 0.4);
      this.play('squelch', (o, tt) => this.sfx.squelch(o, tt), 0.1);
    }
  }

  /** Saltos y aterrizajes (jugador directo, bots cercanos en 3D). */
  jump(c) {
    if (c === this.game.player) this.play('jump', (o, t) => this.sfx.jump(o, t), 0.1);
    else this.play3D('botjump', c.position, (o, t) => this.sfx.jump(o, t, 0.7), 0.25, 0.8, 18);
  }

  land(c, strength) {
    const k = clamp(strength, 0.3, 1.2);
    if (c === this.game.player) this.play('land', (o, t) => this.sfx.land(o, t, k), 0.1);
    else this.play3D('botland2', c.position, (o, t) => this.sfx.land(o, t, k * 0.7), 0.25, 0.8, 18);
  }
}
