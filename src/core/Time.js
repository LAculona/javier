// Reloj del juego: delta clamped, escala de tiempo (cámara lenta / hit-stop)
// y tiempo real separado para la UI y la cámara.
export class Time {
  constructor() {
    this.last = performance.now();
    this.realDelta = 0;
    this.delta = 0;
    this.elapsed = 0; // tiempo de juego escalado
    this.realElapsed = 0;
    this.timeScale = 1;
    this.frame = 0;

    this._hitStop = 0; // segundos reales restantes de congelación
    this._slowmo = 0; // segundos reales restantes de cámara lenta
    this._slowmoScale = 1;
    this.paused = false;

    this.fps = 60;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this.frameMs = 16.6;
  }

  update(now = performance.now()) {
    let raw = (now - this.last) / 1000;
    this.last = now;
    if (!(raw > 0)) raw = 0;
    raw = Math.min(raw, 0.1); // evita saltos tras cambiar de pestaña
    this.realDelta = raw;
    this.realElapsed += raw;
    this.frame++;

    this._fpsAccum += raw;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this.frameMs = (this._fpsAccum / this._fpsFrames) * 1000;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    let scale = this.timeScale;
    if (this._slowmo > 0) {
      this._slowmo -= raw;
      scale *= this._slowmoScale;
    }
    if (this._hitStop > 0) {
      this._hitStop -= raw;
      scale = 0;
    }
    if (this.paused) scale = 0;

    this.delta = raw * scale;
    this.elapsed += this.delta;
  }

  hitStop(ms) {
    this._hitStop = Math.max(this._hitStop, ms / 1000);
  }

  slowMotion(scale, seconds) {
    this._slowmoScale = scale;
    this._slowmo = Math.max(this._slowmo, seconds);
  }

  get inHitStop() {
    return this._hitStop > 0;
  }

  resetEffects() {
    this._hitStop = 0;
    this._slowmo = 0;
    this._slowmoScale = 1;
    this.timeScale = 1;
  }
}
