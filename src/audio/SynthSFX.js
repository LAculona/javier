// ─────────────────────────────────────────────────────────────
//  SynthSFX · efectos sintetizados en capas (Web Audio)
//  Cada efecto combina osciladores, ruido filtrado y envolventes, con
//  variación aleatoria de tono y volumen. Nada se descarga: todo se
//  genera en tiempo real. `out` es el nodo destino (bus o panner 3D).
// ─────────────────────────────────────────────────────────────

const rnd = (a, b) => a + Math.random() * (b - a);

export class SynthSFX {
  constructor(ctx) {
    this.ctx = ctx;
    this.noise = this.makeNoise(2, 'white');
    this.pink = this.makeNoise(2, 'pink');
  }

  makeNoise(seconds, kind) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      } else d[i] = w;
    }
    return buf;
  }

  // ── bloques básicos ───────────────────────────────────────

  /** Oscilador con barrido de tono y envolvente de volumen. */
  tone(out, t, { type = 'sine', f0 = 440, f1 = f0, dur = 0.1, vol = 0.3, attack = 0.004, curve = 'exp', detune = 0 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }

  /** Ráfaga de ruido filtrado con barrido opcional del filtro. */
  burst(out, t, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, dur = 0.1, vol = 0.3, attack = 0.002, pink = false, offset = -1 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = pink ? this.pink : this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, offset >= 0 ? offset : Math.random() * 1.5);
    src.stop(t + dur + 0.02);
    return src;
  }

  /** Burbuja: seno corto con subida rápida de tono (líquido). */
  bubble(out, t, f = 600, vol = 0.12, dur = 0.06) {
    this.tone(out, t, { type: 'sine', f0: f, f1: f * rnd(1.6, 2.4), dur, vol, attack: 0.003 });
  }

  // ── armas ─────────────────────────────────────────────────

  shot(out, t, weapon, k = 1) {
    const p = rnd(0.92, 1.1);
    const v = rnd(0.85, 1) * k;
    if (weapon === 'blaster') {
      // "plop" con cuerpo + chasquido húmedo
      this.tone(out, t, { type: 'sine', f0: 820 * p, f1: 170 * p, dur: 0.1, vol: 0.34 * v });
      this.tone(out, t, { type: 'triangle', f0: 1600 * p, f1: 500 * p, dur: 0.045, vol: 0.12 * v });
      this.burst(out, t, { type: 'bandpass', f0: 2400 * p, f1: 900, q: 1.4, dur: 0.07, vol: 0.2 * v });
      this.burst(out, t + 0.01, { type: 'lowpass', f0: 500, q: 0.7, dur: 0.12, vol: 0.14 * v, pink: true });
    } else if (weapon === 'splasher') {
      // rociado rápido y agudo
      this.burst(out, t, { type: 'highpass', f0: 2600 * p, q: 0.8, dur: 0.055, vol: 0.16 * v });
      this.tone(out, t, { type: 'sine', f0: 1300 * p, f1: 520 * p, dur: 0.05, vol: 0.12 * v });
      this.burst(out, t, { type: 'bandpass', f0: 900 * p, q: 2, dur: 0.05, vol: 0.08 * v });
    } else if (weapon === 'roller') {
      // barrido: silbido de aire + golpe de pintura
      this.burst(out, t, { type: 'bandpass', f0: 380, f1: 2400, q: 1.6, dur: 0.24, vol: 0.28 * v, attack: 0.04 });
      this.tone(out, t + 0.12, { type: 'sine', f0: 240 * p, f1: 70, dur: 0.18, vol: 0.34 * v });
      this.burst(out, t + 0.13, { type: 'lowpass', f0: 1200, f1: 300, q: 1, dur: 0.22, vol: 0.24 * v, pink: true });
    }
  }

  /** Versión ligera del disparo para los bots (2 nodos en vez de 8). */
  shotLite(out, t, weapon) {
    const p = rnd(0.9, 1.12);
    if (weapon === 'splasher') this.burst(out, t, { type: 'highpass', f0: 2400 * p, q: 0.8, dur: 0.05, vol: 0.14 });
    else this.burst(out, t, { type: 'bandpass', f0: 1800 * p, f1: 700, q: 1.2, dur: 0.07, vol: 0.18 });
    this.tone(out, t, { type: 'sine', f0: 760 * p, f1: 180 * p, dur: 0.08, vol: 0.26 });
  }

  /** Impacto ligero (lejano o de los bots). */
  impactLite(out, t, k = 1) {
    this.burst(out, t, { type: 'lowpass', f0: 1800 * rnd(0.85, 1.2), f1: 400, q: 1.2, dur: 0.08, vol: 0.16 * k, pink: true });
  }

  dry(out, t) {
    this.tone(out, t, { type: 'square', f0: 1800, f1: 1500, dur: 0.025, vol: 0.06 });
    this.tone(out, t + 0.07, { type: 'square', f0: 1500, f1: 1300, dur: 0.025, vol: 0.05 });
    this.burst(out, t, { type: 'highpass', f0: 3000, dur: 0.03, vol: 0.05 });
  }

  switchWeapon(out, t) {
    this.burst(out, t, { type: 'bandpass', f0: 600, f1: 2600, q: 1.2, dur: 0.16, vol: 0.12, attack: 0.03 });
    this.tone(out, t + 0.2, { type: 'square', f0: 900, f1: 600, dur: 0.03, vol: 0.08 });
    this.tone(out, t + 0.24, { type: 'square', f0: 1300, f1: 1000, dur: 0.035, vol: 0.08 });
  }

  /** Gorgoteo de recarga: ristra de burbujas que suben de tono. */
  reload(out, t, dur = 1.3, k = 1) {
    let tt = 0;
    let i = 0;
    while (tt < dur) {
      const prog = tt / dur;
      this.bubble(out, t + tt, 260 + prog * 700 + rnd(-60, 60), 0.1 * k * (0.6 + Math.random() * 0.4), rnd(0.04, 0.08));
      tt += rnd(0.035, 0.09);
      i++;
    }
    this.burst(out, t, { type: 'lowpass', f0: 500, f1: 1500, q: 3, dur, vol: 0.05 * k, attack: 0.2, pink: true });
    return i;
  }

  reloaded(out, t) {
    this.tone(out, t, { type: 'triangle', f0: 880, dur: 0.08, vol: 0.12 });
    this.tone(out, t + 0.07, { type: 'triangle', f0: 1320, dur: 0.12, vol: 0.12 });
  }

  melee(out, t) {
    this.burst(out, t, { type: 'bandpass', f0: 500, f1: 1800, q: 1.3, dur: 0.16, vol: 0.18, attack: 0.03 });
  }

  meleeHit(out, t) {
    this.tone(out, t, { type: 'sine', f0: 180, f1: 50, dur: 0.16, vol: 0.4 });
    this.burst(out, t, { type: 'lowpass', f0: 1800, f1: 400, dur: 0.1, vol: 0.22 });
  }

  // ── pintura ───────────────────────────────────────────────

  /** Impacto húmedo pequeño (bala contra suelo/pared). */
  impact(out, t, k = 1) {
    const p = rnd(0.85, 1.2);
    this.burst(out, t, { type: 'lowpass', f0: 2200 * p, f1: 400, q: 1.2, dur: 0.09, vol: 0.16 * k, pink: true });
    this.tone(out, t, { type: 'sine', f0: 300 * p, f1: 90, dur: 0.07, vol: 0.12 * k });
    if (Math.random() < 0.4) this.bubble(out, t + 0.03, rnd(500, 900), 0.05 * k, 0.05);
  }

  /** Salpicadura grande (eliminación, aterrizaje del dron). */
  splash(out, t, k = 1) {
    this.tone(out, t, { type: 'sine', f0: 140, f1: 40, dur: 0.35, vol: 0.5 * k });
    this.burst(out, t, { type: 'lowpass', f0: 3000, f1: 300, q: 0.9, dur: 0.45, vol: 0.4 * k, pink: true });
    this.burst(out, t + 0.02, { type: 'bandpass', f0: 1400, f1: 500, q: 1.5, dur: 0.3, vol: 0.2 * k });
    for (let i = 0; i < 6; i++) this.bubble(out, t + 0.05 + Math.random() * 0.3, rnd(350, 1100), 0.07 * k, rnd(0.04, 0.09));
  }

  /** Chapoteo al pisar pintura enemiga. */
  squelch(out, t, k = 1) {
    this.burst(out, t, { type: 'lowpass', f0: rnd(500, 900), f1: 200, q: 4, dur: 0.12, vol: 0.14 * k, pink: true });
    this.tone(out, t, { type: 'sine', f0: rnd(160, 220), f1: 90, dur: 0.08, vol: 0.06 * k });
  }

  // ── movimiento ────────────────────────────────────────────

  jump(out, t, k = 1) {
    this.tone(out, t, { type: 'sine', f0: 280, f1: 620, dur: 0.12, vol: 0.14 * k });
    this.burst(out, t, { type: 'bandpass', f0: 900, f1: 1800, q: 1, dur: 0.08, vol: 0.06 * k });
  }

  land(out, t, k = 1) {
    this.tone(out, t, { type: 'sine', f0: 130, f1: 48, dur: 0.12, vol: 0.28 * k });
    this.burst(out, t, { type: 'lowpass', f0: 900, f1: 200, dur: 0.1, vol: 0.12 * k, pink: true });
  }

  // ── daño y bajas ─────────────────────────────────────────

  hurt(out, t, k = 1) {
    this.tone(out, t, { type: 'square', f0: 420, f1: 160, dur: 0.12, vol: 0.12 * k });
    this.tone(out, t, { type: 'sine', f0: 200, f1: 70, dur: 0.14, vol: 0.3 * k });
    this.burst(out, t, { type: 'bandpass', f0: 1500, f1: 600, q: 2, dur: 0.1, vol: 0.14 * k });
  }

  /** "tic" del marcador de impacto; crítico = doble tono; baja = tres notas. */
  hitmarker(out, t, kind = 0) {
    if (kind === 2) {
      [1320, 1760, 2640].forEach((f, i) => this.tone(out, t + i * 0.055, { type: 'triangle', f0: f, dur: 0.12, vol: 0.16 }));
      return;
    }
    this.tone(out, t, { type: 'sine', f0: kind ? 2600 : 2200, f1: kind ? 2900 : 2000, dur: 0.035, vol: kind ? 0.2 : 0.16 });
    this.burst(out, t, { type: 'highpass', f0: 5000, dur: 0.015, vol: 0.06 });
    if (kind === 1) this.tone(out, t + 0.04, { type: 'sine', f0: 3300, dur: 0.05, vol: 0.14 });
  }

  /** KO: "wah" descendente + salpicadura. */
  ko(out, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.7);
    f.type = 'lowpass';
    f.Q.value = 8;
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.8);
    this.splash(out, t, 0.8);
  }

  streak(out, t, n = 2) {
    const base = 660;
    for (let i = 0; i < Math.min(5, n + 1); i++) this.tone(out, t + i * 0.07, { type: 'square', f0: base * Math.pow(2, (i * 4) / 12), dur: 0.1, vol: 0.07 });
    this.tone(out, t + 0.07 * (n + 1), { type: 'triangle', f0: base * 2, dur: 0.3, vol: 0.12 });
  }

  // ── reaparición ──────────────────────────────────────────

  whistle(out, t) {
    this.tone(out, t, { type: 'sine', f0: 1800, f1: 500, dur: 0.9, vol: 0.1, attack: 0.05 });
    this.burst(out, t, { type: 'bandpass', f0: 3000, f1: 800, q: 3, dur: 0.9, vol: 0.05, attack: 0.1 });
  }

  // ── partida ───────────────────────────────────────────────

  beep(out, t, f = 660, dur = 0.16, vol = 0.22) {
    this.tone(out, t, { type: 'square', f0: f, dur, vol: vol * 0.45 });
    this.tone(out, t, { type: 'sine', f0: f, dur: dur * 1.3, vol });
  }

  ready(out, t) {
    this.burst(out, t, { type: 'bandpass', f0: 300, f1: 3000, q: 1.5, dur: 0.5, vol: 0.12, attack: 0.3 });
    this.tone(out, t + 0.3, { type: 'triangle', f0: 523, dur: 0.25, vol: 0.14 });
  }

  /** ¡A PINTAR!: acorde ascendente con cuerpo. */
  go(out, t) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this.tone(out, t + i * 0.05, { type: 'sawtooth', f0: f, dur: 0.5, vol: 0.06, attack: 0.01 });
      this.tone(out, t + i * 0.05, { type: 'triangle', f0: f, dur: 0.6, vol: 0.1 });
    });
    this.splash(out, t + 0.05, 0.6);
  }

  alarm(out, t) {
    for (let i = 0; i < 3; i++) {
      this.tone(out, t + i * 0.26, { type: 'square', f0: 880, dur: 0.11, vol: 0.07 });
      this.tone(out, t + i * 0.26 + 0.12, { type: 'square', f0: 660, dur: 0.11, vol: 0.07 });
    }
  }

  tick(out, t, urgent = false) {
    this.tone(out, t, { type: 'square', f0: urgent ? 1320 : 990, dur: 0.06, vol: urgent ? 0.1 : 0.07 });
    this.tone(out, t, { type: 'sine', f0: urgent ? 1320 : 990, dur: 0.1, vol: 0.12 });
  }

  /** Bocina de final de partida. */
  horn(out, t) {
    [220, 277.18, 329.63].forEach((f) => {
      this.tone(out, t, { type: 'sawtooth', f0: f, dur: 1.2, vol: 0.08, attack: 0.02 });
      this.tone(out, t, { type: 'square', f0: f / 2, dur: 1.1, vol: 0.04, attack: 0.02 });
    });
  }

  win(out, t) {
    const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    seq.forEach((f, i) => {
      const d = i === seq.length - 1 ? 0.7 : 0.14;
      this.tone(out, t + i * 0.12, { type: 'square', f0: f, dur: d, vol: 0.07 });
      this.tone(out, t + i * 0.12, { type: 'triangle', f0: f / 2, dur: d, vol: 0.1 });
    });
    this.splash(out, t + 0.84, 0.6);
  }

  lose(out, t) {
    const seq = [392, 369.99, 349.23, 293.66];
    seq.forEach((f, i) => {
      const d = i === seq.length - 1 ? 0.9 : 0.3;
      this.tone(out, t + i * 0.28, { type: 'triangle', f0: f, f1: i === seq.length - 1 ? f * 0.94 : f, dur: d, vol: 0.14, curve: 'lin' });
      this.tone(out, t + i * 0.28, { type: 'square', f0: f / 2, dur: d, vol: 0.04 });
    });
  }

  // ── interfaz ──────────────────────────────────────────────

  uiHover(out, t) {
    this.tone(out, t, { type: 'sine', f0: rnd(1150, 1250), f1: 1500, dur: 0.05, vol: 0.06 });
  }

  uiClick(out, t) {
    this.tone(out, t, { type: 'sine', f0: 480, f1: 980, dur: 0.08, vol: 0.2 });
    this.burst(out, t, { type: 'lowpass', f0: 2000, f1: 500, dur: 0.07, vol: 0.1, pink: true });
    this.bubble(out, t + 0.04, 900, 0.06, 0.05);
  }
}
