import * as THREE from 'three';
import { makeCanvas, canvasTexture, rng } from '../../render/TextureFactory.js';

// ─────────────────────────────────────────────────────────────
//  GroundDecor · capa de detalle del suelo en espacio mundo (XZ):
//  marcas viales, sombreado de contacto bajo los objetos, manchas,
//  grietas, alcantarillas y charcos (canal de humedad aparte).
//  La pintura de los equipos se dibuja SIEMPRE encima de esta capa.
// ─────────────────────────────────────────────────────────────

export class GroundDecor {
  constructor(bounds, ppm = 12, seed = 77) {
    this.b = bounds;
    this.ppm = ppm;
    this.w = Math.round((bounds.maxX - bounds.minX) * ppm);
    this.h = Math.round((bounds.maxZ - bounds.minZ) * ppm);
    this.canvas = makeCanvas(this.w, this.h);
    this.g = this.canvas.getContext('2d');
    this.g.clearRect(0, 0, this.w, this.h);
    const wetPpm = 4;
    this.wetScale = wetPpm / ppm;
    this.wetCanvas = makeCanvas(Math.round(this.w * this.wetScale), Math.round(this.h * this.wetScale));
    this.wg = this.wetCanvas.getContext('2d');
    this.wg.fillStyle = '#000';
    this.wg.fillRect(0, 0, this.wetCanvas.width, this.wetCanvas.height);
    this.rand = rng(seed);
    this.aoQueue = [];
  }

  // mundo → píxel. El lienzo es una vista cenital real con +Z arriba; en
  // three.js, mirando al norte (+Z) el eje +X queda a la IZQUIERDA, así que
  // la columna 0 corresponde a maxX (el shader usa u = 1 - u).
  px(x) {
    return (this.b.maxX - x) * this.ppm;
  }

  py(z) {
    return (this.b.maxZ - z) * this.ppm;
  }

  /**
   * Transformación local (x,z,rot): dentro de fn, (u,v) = (x local, z local)
   * en metros. Para rotY = θ del mundo, el lienzo cenital gira π-θ.
   */
  local(x, z, rot, fn) {
    const g = this.g;
    g.save();
    g.translate(this.px(x), this.py(z));
    g.rotate(Math.PI - rot);
    g.scale(this.ppm, this.ppm);
    fn(g);
    g.restore();
  }

  /** Igual que local() pero orientado para leerse mirando hacia +Z local. */
  readable(x, z, rot, fn) {
    const g = this.g;
    g.save();
    g.translate(this.px(x), this.py(z));
    g.rotate(-rot);
    g.scale(this.ppm, this.ppm);
    fn(g);
    g.restore();
  }

  contactShadow(x, z, w, d, rot, strength) {
    this.aoQueue.push({ x, z, w, d, rot, strength });
  }

  flushContactShadows() {
    const g = this.g;
    g.save();
    for (const a of this.aoQueue) {
      if (a.strength <= 0) continue;
      g.save();
      g.filter = `blur(${Math.round(this.ppm * 0.55)}px)`;
      g.translate(this.px(a.x), this.py(a.z));
      g.rotate(Math.PI - a.rot);
      g.fillStyle = `rgba(52,38,70,${0.34 * a.strength})`;
      const W = a.w * this.ppm;
      const D = a.d * this.ppm;
      g.fillRect(-W / 2, -D / 2, W, D);
      g.restore();
    }
    g.restore();
    this.aoQueue.length = 0;
  }

  line(x0, z0, x1, z1, width, color, dash) {
    const g = this.g;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = width * this.ppm;
    g.lineCap = 'butt';
    if (dash) g.setLineDash(dash.map((v) => v * this.ppm));
    g.beginPath();
    g.moveTo(this.px(x0), this.py(z0));
    g.lineTo(this.px(x1), this.py(z1));
    g.stroke();
    g.restore();
  }

  hatch(x, z, w, d, rot, color, spacing = 0.8, width = 0.25) {
    this.local(x, z, rot, (g) => {
      g.save();
      g.beginPath();
      g.rect(-w / 2, -d / 2, w, d);
      g.clip();
      g.strokeStyle = color;
      g.lineWidth = width;
      for (let t = -w - d; t < w + d; t += spacing) {
        g.beginPath();
        g.moveTo(t - d, d / 2);
        g.lineTo(t + d, -d / 2);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = color;
      g.lineWidth = 0.14;
      g.strokeRect(-w / 2, -d / 2, w, d);
    });
  }

  rampStripes(x, z, w, d, rot) {
    this.local(x, z, rot, (g) => {
      g.fillStyle = 'rgba(70,58,96,0.16)';
      for (let t = -d / 2 + 0.3; t < d / 2 - 0.2; t += 0.55) g.fillRect(-w / 2 + 0.3, t, w - 0.6, 0.18);
      g.fillStyle = 'rgba(238,210,140,0.7)';
      g.fillRect(-w / 2 + 0.12, -d / 2, 0.14, d);
      g.fillRect(w / 2 - 0.26, -d / 2, 0.14, d);
    });
  }

  text(str, x, z, rot, size, color, font = '"Bungee", sans-serif', alpha = 0.85) {
    this.readable(x, z, rot, (g) => {
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // el tamaño está en metros: escalar a píxeles internos del canvas
      g.save();
      g.scale(0.05, 0.05);
      g.font = `${size * 20}px ${font}`;
      g.fillText(str, 0, 0);
      g.restore();
      g.globalAlpha = 1;
    });
  }

  arrow(x, z, rot, len, color) {
    this.local(x, z, rot, (g) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(-0.25, -len / 2);
      g.lineTo(0.25, -len / 2);
      g.lineTo(0.25, len / 2 - 0.9);
      g.lineTo(0.7, len / 2 - 0.9);
      g.lineTo(0, len / 2);
      g.lineTo(-0.7, len / 2 - 0.9);
      g.lineTo(-0.25, len / 2 - 0.9);
      g.closePath();
      g.fill();
    });
  }

  manhole(x, z, r = 0.45) {
    this.local(x, z, 0, (g) => {
      g.fillStyle = 'rgba(70,64,86,0.85)';
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(150,142,166,0.9)';
      g.lineWidth = 0.05;
      g.beginPath();
      g.arc(0, 0, r * 0.8, 0, Math.PI * 2);
      g.stroke();
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(-r * 0.7, i * r * 0.28);
        g.lineTo(r * 0.7, i * r * 0.28);
        g.stroke();
      }
    });
  }

  drain(x, z, rot = 0) {
    this.local(x, z, rot, (g) => {
      g.fillStyle = 'rgba(60,54,76,0.9)';
      g.fillRect(-0.45, -0.22, 0.9, 0.44);
      g.fillStyle = 'rgba(28,24,36,0.9)';
      for (let i = 0; i < 6; i++) g.fillRect(-0.38 + i * 0.14, -0.16, 0.07, 0.32);
    });
  }

  stain(x, z, r, color = 'rgba(60,48,70,0.18)') {
    const g = this.g;
    g.save();
    g.filter = `blur(${Math.round(this.ppm * r * 0.25)}px)`;
    g.fillStyle = color;
    const n = 5 + Math.floor(this.rand() * 5);
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const rr = r * (0.2 + this.rand() * 0.6);
      g.beginPath();
      g.arc(this.px(x + Math.cos(a) * rr), this.py(z + Math.sin(a) * rr), r * (0.3 + this.rand() * 0.5) * this.ppm, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  crack(x, z, len) {
    const g = this.g;
    g.save();
    g.strokeStyle = 'rgba(58,46,74,0.45)';
    g.lineWidth = Math.max(1, this.ppm * 0.035);
    g.lineJoin = 'round';
    g.beginPath();
    let cx = x;
    let cz = z;
    let a = this.rand() * Math.PI * 2;
    g.moveTo(this.px(cx), this.py(cz));
    const steps = Math.ceil(len / 0.35);
    for (let i = 0; i < steps; i++) {
      a += (this.rand() - 0.5) * 1.1;
      cx += Math.cos(a) * 0.35;
      cz += Math.sin(a) * 0.35;
      g.lineTo(this.px(cx), this.py(cz));
      if (this.rand() < 0.15) {
        const bx = cx + Math.cos(a + 1.2) * 0.6;
        const bz = cz + Math.sin(a + 1.2) * 0.6;
        g.lineTo(this.px(bx), this.py(bz));
        g.moveTo(this.px(cx), this.py(cz));
      }
    }
    g.stroke();
    g.restore();
  }

  puddle(x, z, r) {
    // color (oscurece y enfría) + humedad
    const g = this.g;
    g.save();
    g.filter = `blur(${Math.round(this.ppm * 0.15)}px)`;
    g.fillStyle = 'rgba(96,110,140,0.22)';
    const wg = this.wg;
    wg.save();
    wg.filter = `blur(${Math.max(1, Math.round(this.ppm * this.wetScale * 0.3))}px)`;
    wg.fillStyle = '#fff';
    const blobs = 4 + Math.floor(this.rand() * 4);
    for (let i = 0; i < blobs; i++) {
      const a = this.rand() * Math.PI * 2;
      const rr = r * this.rand() * 0.7;
      const bx = x + Math.cos(a) * rr;
      const bz = z + Math.sin(a) * rr * 0.6;
      const br = r * (0.35 + this.rand() * 0.45);
      g.beginPath();
      g.ellipse(this.px(bx), this.py(bz), br * this.ppm, br * 0.7 * this.ppm, a, 0, Math.PI * 2);
      g.fill();
      wg.beginPath();
      wg.ellipse(this.px(bx) * this.wetScale, this.py(bz) * this.wetScale, br * this.ppm * this.wetScale, br * 0.7 * this.ppm * this.wetScale, a, 0, Math.PI * 2);
      wg.fill();
    }
    wg.restore();
    g.restore();
  }

  tireMarks(x, z, rot, len) {
    this.local(x, z, rot, (g) => {
      g.strokeStyle = 'rgba(50,40,60,0.14)';
      g.lineWidth = 0.22;
      for (const off of [-0.8, 0.8]) {
        g.beginPath();
        g.moveTo(off, -len / 2);
        g.bezierCurveTo(off + 1.2, -len / 6, off - 1.2, len / 6, off + 0.4, len / 2);
        g.stroke();
      }
    });
  }

  build() {
    this.flushContactShadows();
    const tex = canvasTexture(this.canvas, { anisotropy: 8 });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const wet = canvasTexture(this.wetCanvas, { srgb: false });
    return { overlay: tex, wet };
  }
}
