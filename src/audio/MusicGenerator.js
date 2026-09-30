// ─────────────────────────────────────────────────────────────
//  MusicGenerator · bucle funky electrónico procedural
//  Planificador con anticipación sobre el reloj de Web Audio: batería
//  (bombo, caja, palmas, charles), bajo sincopado con filtro, arpegio con
//  eco, colchón de acordes y stabs. Estados: menú (relajado), partida,
//  último minuto (más tempo y capas) y últimos 10 s (aún más rápido,
//  subida de ruido). Los cambios de estado entran en el siguiente compás.
// ─────────────────────────────────────────────────────────────

const MOODS = {
  menu: { bpm: 100, drums: 1, hats: 1, bass: 1, arp: 0, pad: 1, stabs: 0, clap: 0, riser: 0 },
  match: { bpm: 112, drums: 2, hats: 2, bass: 2, arp: 1, pad: 1, stabs: 0, clap: 1, riser: 0 },
  last: { bpm: 122, drums: 2, hats: 3, bass: 2, arp: 2, pad: 1, stabs: 1, clap: 1, riser: 0 },
  final: { bpm: 134, drums: 3, hats: 3, bass: 2, arp: 2, pad: 0, stabs: 1, clap: 1, riser: 1 },
  results: { bpm: 96, drums: 1, hats: 1, bass: 1, arp: 1, pad: 1, stabs: 0, clap: 0, riser: 0 }
};

// Progresión (un acorde por compás): Dm9 · G13 · Cmaj9 · A7
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const PROG = [
  { root: 38, chord: [50, 53, 57, 60, 64] },
  { root: 43, chord: [50, 53, 55, 59, 64] },
  { root: 36, chord: [48, 52, 55, 59, 62] },
  { root: 45, chord: [49, 52, 55, 57, 61] }
];

// Bajo funky: [paso, desplazamiento en semitonos, duración en pasos, volumen]
const BASS = [
  [0, 0, 2, 1],
  [3, 12, 1, 0.7],
  [4, 0, 1, 0.45],
  [6, 0, 2, 0.9],
  [8, 7, 1, 0.8],
  [10, 12, 1, 0.75],
  [11, 10, 1, 0.6],
  [13, 0, 1, 0.5],
  [14, 3, 2, 0.85]
];
const BASS_B = [
  [0, 0, 3, 1],
  [3, 0, 1, 0.5],
  [5, 12, 1, 0.8],
  [7, 10, 1, 0.7],
  [8, 7, 2, 0.9],
  [11, 5, 1, 0.6],
  [12, 3, 1, 0.8],
  [14, 0, 1, 0.7],
  [15, -2, 1, 0.6]
];

export class MusicGenerator {
  constructor(ctx, out, sfx) {
    this.ctx = ctx;
    this.sfx = sfx;
    // cadena: mezcla → filtro (pausa / final) → salida
    this.mix = ctx.createGain();
    this.mix.gain.value = 0.9;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 18000;
    this.filter.Q.value = 0.7;
    this.mix.connect(this.filter).connect(out);
    // eco del arpegio
    this.delay = ctx.createDelay(1);
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.32;
    this.delayLp = ctx.createBiquadFilter();
    this.delayLp.type = 'lowpass';
    this.delayLp.frequency.value = 2600;
    this.delay.connect(this.delayLp).connect(this.delayFb).connect(this.delay);
    this.delayOut = ctx.createGain();
    this.delayOut.gain.value = 0.35;
    this.delayLp.connect(this.delayOut).connect(this.mix);
    this.arpBus = ctx.createGain();
    this.arpBus.connect(this.mix);
    this.arpBus.connect(this.delay);

    this.mood = MOODS.menu;
    this.nextMood = null;
    this.step = 0;
    this.bar = 0;
    this.nextTime = 0;
    this.running = false;
    this.timer = null;
    this.swing = 0.1;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Cambia de estado de ánimo (entra en el siguiente compás). */
  setMood(name) {
    const m = MOODS[name];
    if (!m || m === this.mood) return;
    this.nextMood = m;
    this.moodName = name;
  }

  /** Apagado con filtro (pausa o final de partida). */
  muffle(on, time = 0.4) {
    const t = this.ctx.currentTime;
    const f = this.filter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(on ? 420 : 18000, t + time);
  }

  /** Bajada de volumen temporal. */
  fade(to, time = 0.8) {
    const t = this.ctx.currentTime;
    const g = this.mix.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + time);
  }

  schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      this.nextTime = ctx.currentTime + 0.05;
      return;
    }
    while (this.nextTime < ctx.currentTime + 0.14) {
      this.playStep(this.step, this.nextTime);
      const spb = 60 / this.mood.bpm / 4;
      // swing en las semicorcheas impares
      const sw = this.step % 2 === 0 ? 1 + this.swing : 1 - this.swing;
      this.nextTime += spb * sw;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar++;
        if (this.nextMood) {
          this.mood = this.nextMood;
          this.nextMood = null;
        }
      }
    }
  }

  playStep(s, t) {
    const m = this.mood;
    const chord = PROG[this.bar % 4];
    const spb = 60 / m.bpm / 4;
    // batería
    if (m.drums) {
      const kick = s === 0 || s === 8 || (m.drums >= 2 && (s === 10 || (s === 14 && this.bar % 2 === 1))) || (m.drums >= 3 && s === 6);
      if (kick) this.kick(t, s === 0 ? 1 : 0.85);
      if (s === 4 || s === 12) this.snare(t, 1, m.clap);
      if (m.drums >= 2 && (s === 7 || s === 15) && Math.random() < 0.5) this.snare(t, 0.22, 0);
    }
    if (m.hats) {
      const off = s % 4 === 2;
      if (m.hats >= 2 && off) this.hat(t, 0.5, true);
      else if (s % 2 === 0) this.hat(t, m.hats >= 2 ? 0.35 : 0.25, false);
      else if (m.hats >= 3) this.hat(t, 0.16, false);
    }
    // bajo
    if (m.bass) {
      const pat = this.bar % 4 === 3 ? BASS_B : BASS;
      for (const [st, off, len, v] of pat) {
        if (st !== s) continue;
        if (m.bass < 2 && v < 0.7) continue;
        this.bassNote(t, midi(chord.root + off), spb * len * 0.95, v);
      }
    }
    // arpegio
    if (m.arp) {
      const on = m.arp >= 2 || s % 2 === 0;
      if (on) {
        const seq = [0, 2, 4, 1, 3, 4, 2, 0];
        const n = chord.chord[seq[(s + this.bar * 3) % 8] % chord.chord.length] + 12;
        this.arpNote(t, midi(n), spb * 0.9, s % 4 === 0 ? 0.11 : 0.075);
      }
    }
    // colchón: al inicio de cada compás
    if (m.pad && s === 0) this.padChord(t, chord.chord, spb * 16);
    // stabs funky en contratiempos
    if (m.stabs && (s === 3 || s === 11 || (s === 14 && this.bar % 2 === 0))) this.stab(t, chord.chord);
    // subida de ruido en los últimos segundos
    if (m.riser && s === 0) this.riser(t, spb * 16);
  }

  // ── instrumentos ──────────────────────────────────────────

  kick(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.75 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(this.mix);
    o.start(t);
    o.stop(t + 0.34);
    this.sfx.burst(this.mix, t, { type: 'highpass', f0: 3000, dur: 0.012, vol: 0.12 * v });
  }

  snare(t, v, clap) {
    this.sfx.burst(this.mix, t, { type: 'bandpass', f0: 1900, q: 0.8, dur: 0.16, vol: 0.32 * v });
    this.sfx.tone(this.mix, t, { type: 'triangle', f0: 200, f1: 150, dur: 0.09, vol: 0.2 * v });
    if (clap && v > 0.5) {
      for (let i = 0; i < 3; i++) this.sfx.burst(this.mix, t + i * 0.011, { type: 'bandpass', f0: 1200, q: 1.6, dur: 0.05 + (i === 2 ? 0.08 : 0), vol: 0.16 });
    }
  }

  hat(t, v, open) {
    this.sfx.burst(this.mix, t, { type: 'highpass', f0: 7200, q: 0.6, dur: open ? 0.16 : 0.035, vol: 0.14 * v });
  }

  bassNote(t, f, dur, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const fl = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'square';
    sub.type = 'sine';
    o.frequency.value = f;
    sub.frequency.value = f / 2;
    fl.type = 'lowpass';
    fl.Q.value = 7;
    fl.frequency.setValueAtTime(260, t);
    fl.frequency.exponentialRampToValueAtTime(1500 + v * 900, t + 0.012);
    fl.frequency.exponentialRampToValueAtTime(320, t + Math.max(0.08, dur));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * v, t + 0.006);
    g.gain.setValueAtTime(0.2 * v, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    const sg = ctx.createGain();
    sg.gain.value = 0.9;
    o.connect(fl).connect(g);
    sub.connect(sg).connect(g);
    g.connect(this.mix);
    o.start(t);
    sub.start(t);
    o.stop(t + dur + 0.08);
    sub.stop(t + dur + 0.08);
  }

  arpNote(t, f, dur, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const fl = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    fl.type = 'lowpass';
    fl.frequency.value = 3200;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6);
    o.connect(fl).connect(g).connect(this.arpBus);
    o.start(t);
    o.stop(t + dur * 1.7);
  }

  padChord(t, notes, dur) {
    const ctx = this.ctx;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(700, t);
    fl.frequency.linearRampToValueAtTime(1300, t + dur * 0.5);
    fl.frequency.linearRampToValueAtTime(800, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.25);
    g.gain.setValueAtTime(0.045, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
    fl.connect(g).connect(this.mix);
    for (let i = 0; i < 4; i++) {
      for (const det of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(notes[i]);
        o.detune.value = det;
        o.connect(fl);
        o.start(t);
        o.stop(t + dur + 0.15);
      }
    }
  }

  stab(t, notes) {
    const ctx = this.ctx;
    const fl = ctx.createBiquadFilter();
    fl.type = 'bandpass';
    fl.frequency.value = 1400;
    fl.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    fl.connect(g).connect(this.mix);
    for (let i = 1; i < 5; i++) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = midi(notes[i] + 12);
      o.connect(fl);
      o.start(t);
      o.stop(t + 0.15);
    }
  }

  riser(t, dur) {
    this.sfx.burst(this.mix, t, { type: 'bandpass', f0: 400, f1: 5000, q: 2.5, dur, vol: 0.07, attack: dur * 0.8 });
  }
}
