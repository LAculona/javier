// AudioManager: every sound is synthesized at runtime with WebAudio (no
// external assets). Supports simple 3D attenuation/panning and a small
// procedural music loop.

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.musicVolume = 0.5;
    this.voices = 0;
    this.maxVoices = 28;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.music = null;
    this.lastPlay = {};
  }

  // Must be called from a user gesture.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.master.connect(this.comp).connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicVolume * 0.35;
      this.musicBus.connect(this.master);
      this.noiseBuf = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicBus) this.musicBus.gain.value = v * 0.35;
  }

  setListener(x, y, z, yaw) {
    this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw;
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ---------- building blocks ----------
  out(gain, pan) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  tone(dest, type, f0, f1, t0, dur, vol, attack = 0.005) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    this.track(dur);
  }

  noise(dest, t0, dur, vol, type = 'lowpass', f0 = 2000, f1 = 400, q = 1) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.02);
    this.track(dur);
  }

  track(dur) {
    this.voices++;
    setTimeout(() => { this.voices--; }, dur * 1000 + 50);
  }

  // ---------- public ----------
  play(name, pos = null, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.voices > this.maxVoices && name !== 'countdown' && name !== 'go') return;
    const now = this.ctx.currentTime;
    // Per-sound rate limit to avoid machine-gun stacking
    const minGap = { splat: 0.03, splasher: 0.05, hit: 0.04, roll: 0.08, step: 0.1 }[name] ?? 0.015;
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap && pos) return;
    this.lastPlay[name] = now;

    let gain = vol, pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z, dy = pos.y - this.listener.y;
      const d = Math.hypot(dx, dy, dz);
      gain *= 1 / (1 + d * 0.09);
      if (gain < 0.03) return;
      const rx = Math.cos(this.listener.yaw), rz = -Math.sin(this.listener.yaw);
      pan = Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / Math.max(1, d)));
    }
    const fn = this['s_' + name];
    if (fn) fn.call(this, this.out(gain, pan), now);
  }

  s_blaster(o, t) {
    this.tone(o, 'square', 520, 140, t, 0.12, 0.18);
    this.noise(o, t, 0.12, 0.35, 'bandpass', 2600, 700, 1.4);
    this.tone(o, 'sine', 180, 60, t, 0.1, 0.35);
  }
  s_splasher(o, t) {
    this.noise(o, t, 0.06, 0.28, 'bandpass', 3200, 1400, 2);
    this.tone(o, 'triangle', 900 + Math.random() * 200, 380, t, 0.06, 0.12);
  }
  s_roller(o, t) {
    this.noise(o, t, 0.3, 0.5, 'lowpass', 1800, 200, 0.8);
    this.tone(o, 'sine', 240, 70, t, 0.25, 0.4);
  }
  s_roll(o, t) { this.noise(o, t, 0.12, 0.15, 'lowpass', 600, 200, 0.5); }
  s_splat(o, t) {
    this.noise(o, t, 0.14, 0.25, 'lowpass', 1400 + Math.random() * 600, 180, 2);
    this.tone(o, 'sine', 160 + Math.random() * 60, 60, t, 0.1, 0.15);
  }
  s_hit(o, t) {
    this.tone(o, 'square', 1200, 700, t, 0.07, 0.18);
    this.noise(o, t, 0.08, 0.3, 'highpass', 3000, 1500, 1);
  }
  s_hitmarker(o, t) { this.tone(o, 'sine', 1650, 1650, t, 0.06, 0.22); }
  s_hurt(o, t) {
    this.tone(o, 'sawtooth', 300, 110, t, 0.22, 0.25);
    this.noise(o, t, 0.18, 0.35, 'lowpass', 900, 150, 1);
  }
  s_death(o, t) {
    this.tone(o, 'sawtooth', 420, 60, t, 0.7, 0.3);
    this.tone(o, 'square', 210, 40, t + 0.05, 0.7, 0.18);
    this.noise(o, t, 0.6, 0.5, 'lowpass', 3000, 100, 1);
  }
  s_kill(o, t) {
    this.tone(o, 'triangle', 880, 880, t, 0.1, 0.25);
    this.tone(o, 'triangle', 1320, 1320, t + 0.08, 0.16, 0.25);
  }
  s_reload(o, t) {
    for (let i = 0; i < 5; i++) this.tone(o, 'sine', 300 + i * 90, 500 + i * 110, t + i * 0.13, 0.1, 0.12);
    this.noise(o, t, 0.5, 0.08, 'bandpass', 800, 2000, 3);
  }
  s_reloadDone(o, t) { this.tone(o, 'triangle', 1040, 1560, t, 0.12, 0.2); }
  s_empty(o, t) { this.tone(o, 'square', 180, 150, t, 0.08, 0.12); }
  s_jump(o, t) { this.tone(o, 'sine', 260, 620, t, 0.16, 0.22); }
  s_land(o, t) { this.noise(o, t, 0.1, 0.25, 'lowpass', 500, 120, 1); }
  s_switch(o, t) {
    this.tone(o, 'square', 700, 700, t, 0.03, 0.12);
    this.tone(o, 'square', 1000, 1000, t + 0.05, 0.04, 0.12);
  }
  s_melee(o, t) { this.noise(o, t, 0.18, 0.4, 'bandpass', 600, 2400, 2); }
  s_spawn(o, t) {
    this.tone(o, 'sine', 300, 900, t, 0.45, 0.2, 0.05);
    this.tone(o, 'triangle', 600, 1800, t + 0.1, 0.4, 0.1, 0.05);
  }
  s_countdown(o, t) { this.tone(o, 'square', 660, 660, t, 0.18, 0.2); }
  s_go(o, t) {
    this.tone(o, 'square', 880, 880, t, 0.1, 0.2);
    this.tone(o, 'square', 1320, 1320, t + 0.1, 0.35, 0.22);
    this.noise(o, t, 0.5, 0.2, 'highpass', 4000, 2000, 1);
  }
  s_tick(o, t) { this.tone(o, 'sine', 1200, 1200, t, 0.06, 0.15); }
  s_victory(o, t) {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone(o, 'triangle', f, f, t + i * 0.12, 0.3, 0.22));
    this.tone(o, 'sine', 131, 131, t, 1.2, 0.2);
  }
  s_defeat(o, t) {
    const notes = [494, 440, 392, 311];
    notes.forEach((f, i) => this.tone(o, 'triangle', f, f * 0.98, t + i * 0.22, 0.4, 0.2));
  }
  s_whistle(o, t) {
    this.tone(o, 'sine', 1800, 1800, t, 0.3, 0.2);
    this.tone(o, 'sine', 1800, 1500, t + 0.35, 0.6, 0.2);
  }
  s_click(o, t) { this.tone(o, 'triangle', 900, 1300, t, 0.06, 0.15); }
  s_hover(o, t) { this.tone(o, 'sine', 1400, 1400, t, 0.03, 0.05); }

  // ---------- procedural music ----------
  startMusic(mode = 'match') {
    if (!this.ctx) return;
    this.stopMusic();
    const bpm = mode === 'match' ? 124 : 96;
    const step = 60 / bpm / 4;
    const bass = mode === 'match' ? [43, 0, 43, 0, 46, 0, 43, 48, 41, 0, 41, 0, 45, 0, 41, 46] : [38, 0, 0, 0, 45, 0, 0, 0, 41, 0, 0, 0, 43, 0, 0, 0];
    const chords = mode === 'match' ? [[67, 71, 74], [65, 69, 72]] : [[62, 65, 69], [60, 64, 67]];
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    let next = this.ctx.currentTime + 0.1;
    let i = 0;
    const state = { intense: false };
    const tick = () => {
      while (next < this.ctx.currentTime + 0.25) {
        const s = i % 16, bar = Math.floor(i / 16) % 2;
        const b = bass[s];
        if (b) this.mTone('triangle', midi(b), next, step * 1.8, 0.35);
        if (mode === 'match') {
          if (s % 4 === 0) this.mKick(next);
          if (s % 8 === 4) this.mSnare(next);
          if (s % 2 === 1 || state.intense) this.mHat(next);
        } else if (s % 8 === 0) this.mKick(next, 0.5);
        if (s === 0 || (mode === 'match' && s === 10)) for (const n of chords[bar]) this.mTone('sine', midi(n), next, step * 3, 0.08);
        next += step;
        i++;
      }
    };
    const id = setInterval(tick, 60);
    this.music = { id, state };
  }

  setMusicIntense(v) { if (this.music) this.music.state.intense = v; }

  stopMusic() {
    if (this.music) { clearInterval(this.music.id); this.music = null; }
  }

  mTone(type, f, t, dur, vol) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  mKick(t, vol = 0.8) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + 0.22);
  }

  mSnare(t) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random() * 0.5); s.stop(t + 0.16);
  }

  mHat(t) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random() * 0.5); s.stop(t + 0.05);
  }
}
