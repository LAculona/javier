import * as THREE from 'three';
import { createTerritoryMaterial } from './SplatShader.js';
import { PAINT } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  TerritoryTracker · porcentaje de territorio por equipo
//  Cada 0,5 s reduce el splat map del suelo a una rejilla de ~1 m
//  (88×128 celdas, 16 muestras por celda, sólo suelo jugable) y la lee de
//  vuelta de forma asíncrona. Nunca se lee cada fotograma.
// ─────────────────────────────────────────────────────────────

export class TerritoryTracker {
  constructor(renderer, paint, playRect) {
    this.renderer = renderer;
    this.paint = paint;
    const b = PAINT.bounds;
    const long = PAINT.territoryGrid;
    const sx = b.maxX - b.minX;
    const sz = b.maxZ - b.minZ;
    this.cols = Math.round((long * sx) / Math.max(sx, sz));
    this.rows = Math.round((long * sz) / Math.max(sx, sz));
    this.rt = new THREE.WebGLRenderTarget(this.cols, this.rows, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: false
    });
    this.material = createTerritoryMaterial();
    this.material.uniforms.uCells.value.set(this.cols, this.rows);
    const r = playRect;
    this.material.uniforms.uPlayRect.value.set((r.minX - b.minX) / sx, (r.minZ - b.minZ) / sz, (r.maxX - b.minX) / sx, (r.maxZ - b.minZ) / sz);
    this.scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.pixels = new Uint8Array(this.cols * this.rows * 4);
    this.timer = 0;
    this.pending = false;
    this.orange = 0; // fracción del suelo jugable (0..1)
    this.blue = 0;
    this.totalCells = 0;
    this.version = 0;
    this.listeners = [];
  }

  onUpdate(fn) {
    this.listeners.push(fn);
  }

  reset() {
    this.orange = 0;
    this.blue = 0;
    this.pixels.fill(0);
    this.timer = 0;
    this.version++;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0 || this.pending) return;
    this.timer = PAINT.territoryInterval;
    this.sample();
  }

  /** Reducción + lectura (asíncrona si el navegador lo permite). */
  sample(sync = false) {
    const r = this.renderer;
    this.material.uniforms.uPaint.value = this.paint.ground.texture;
    this.material.uniforms.uHeight.value = this.paint.heightRT.texture;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
    if (!sync && typeof r.readRenderTargetPixelsAsync === 'function') {
      this.pending = true;
      r.readRenderTargetPixelsAsync(this.rt, 0, 0, this.cols, this.rows, this.pixels)
        .then(() => {
          this.pending = false;
          this.compute();
        })
        .catch(() => {
          this.pending = false;
        });
    } else {
      r.readRenderTargetPixels(this.rt, 0, 0, this.cols, this.rows, this.pixels);
      this.compute();
    }
  }

  compute() {
    const px = this.pixels;
    let o = 0;
    let b = 0;
    let m = 0;
    for (let i = 0; i < px.length; i += 4) {
      o += px[i];
      b += px[i + 1];
      m += px[i + 2];
    }
    this.totalCells = m / 255;
    this.orange = m > 0 ? o / m : 0;
    this.blue = m > 0 ? b / m : 0;
    this.version++;
    for (const fn of this.listeners) fn(this.orange, this.blue);
  }

  /** Estado de una celda de la rejilla reducida (para la IA). */
  cell(i, j) {
    const k = (j * this.cols + i) * 4;
    return { orange: this.pixels[k] / 255, blue: this.pixels[k + 1] / 255, mask: this.pixels[k + 2] / 255 };
  }
}
