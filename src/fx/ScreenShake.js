// Screen shake por "trauma" (amplitud = trauma²) con ruido suave
// determinista: desplazamiento y rotación leves de la cámara.
export class ScreenShake {
  constructor() {
    this.trauma = 0;
    this.t = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.roll = 0;
    this.pitch = 0;
    this.yaw = 0;
    this.scale = 1; // se puede desactivar desde opciones de accesibilidad
  }

  add(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  reset() {
    this.trauma = 0;
    this.offsetX = this.offsetY = this.roll = this.pitch = this.yaw = 0;
  }

  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const k = this.trauma * this.trauma * this.scale;
    const t = this.t * 38;
    const n = (a, b, c) => Math.sin(t * a + c) * 0.6 + Math.sin(t * b + c * 1.7) * 0.4;
    this.offsetX = n(1.0, 2.3, 0.1) * 0.12 * k;
    this.offsetY = n(1.3, 2.9, 1.7) * 0.1 * k;
    this.roll = n(0.9, 2.1, 3.1) * 0.035 * k;
    this.pitch = n(1.1, 2.7, 4.2) * 0.02 * k;
    this.yaw = n(0.8, 1.9, 5.3) * 0.02 * k;
  }
}
