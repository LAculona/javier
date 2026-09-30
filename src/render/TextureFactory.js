import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
//  TextureFactory · texturas procedurales (todas generadas en carga)
// ─────────────────────────────────────────────────────────────

function hash2(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 144269504)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function periodicValueNoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const u = fade(xf);
  const v = fade(yf);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}

export function periodicFbm(x, y, period, octaves, seed, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += periodicValueNoise(x * f, y * f, period * f, seed + o * 31) * amp;
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

export function periodicWorley(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const wx = ((cx % period) + period) % period;
      const wy = ((cy % period) + period) % period;
      const px = cx + hash2(wx, wy, seed);
      const py = cy + hash2(wx, wy, seed + 7);
      const dx = px - x;
      const dy = py - y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

// Generador pseudoaleatorio determinista (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dataTexture(data, w, h, opts = {}) {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = opts.wrap || THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = opts.anisotropy || 4;
  tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Ruido RGBA tileable: R fbm grande, G fbm borde pintura, B grano, A celdas. */
export function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const r = periodicFbm(u * 4, v * 4, 4, 5, 11);
      const g = periodicFbm(u * 8, v * 8, 8, 4, 23, 0.55);
      const b = periodicFbm(u * 32, v * 32, 32, 3, 37) * 0.7 + hash2(x, y, 5) * 0.3;
      const a = Math.min(1, periodicWorley(u * 8, v * 8, 8, 41) * 1.2);
      const i = (y * size + x) * 4;
      data[i] = Math.round(stretch(r) * 255);
      data[i + 1] = Math.round(stretch(g) * 255);
      data[i + 2] = Math.round(stretch(b) * 255);
      data[i + 3] = Math.round(a * 255);
    }
  }
  return dataTexture(data, size, size, { anisotropy: 4 });
}

// expande el rango de un fbm (que tiende a 0.5) a casi 0..1
function stretch(v) {
  return Math.min(1, Math.max(0, (v - 0.5) * 1.9 + 0.5));
}

function heightToNormal(height, w, h, strength, wrap = true) {
  const data = new Uint8Array(w * h * 4);
  const at = (x, y) => {
    if (wrap) {
      x = (x + w) % w;
      y = (y + h) % h;
    } else {
      x = Math.max(0, Math.min(w - 1, x));
      y = Math.max(0, Math.min(h - 1, y));
    }
    return height[y * w + x];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx;
      let ny = dy; // v invertido en three (flipY)
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * w + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * Hormigón en losas: textura de 4 m con junta de dilatación en el borde,
 * grano, poros y manchas. Devuelve {map, normalMap, roughnessMap}.
 */
export function makeConcreteTextures(size = 512, seed = 3) {
  const alb = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Uint8Array(size * size * 4);
  const rand = rng(seed);
  // poros
  const pores = [];
  for (let i = 0; i < 900; i++) pores.push([rand() * size, rand() * size, 0.6 + rand() * 1.8]);
  const poreMap = new Float32Array(size * size);
  for (const [px, py, pr] of pores) {
    const r = Math.ceil(pr + 1);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / pr;
        if (d > 1) continue;
        const X = (Math.floor(px) + x + size) % size;
        const Y = (Math.floor(py) + y + size) % size;
        poreMap[Y * size + X] = Math.max(poreMap[Y * size + X], 1 - d * d);
      }
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const big = periodicFbm(u * 3, v * 3, 3, 4, seed + 1);
      const mid = periodicFbm(u * 12, v * 12, 12, 3, seed + 2);
      const grain = hash2(x, y, seed + 3);
      const stain = Math.max(0, periodicFbm(u * 5, v * 5, 5, 4, seed + 4) - 0.55) * 2.2;
      // junta de dilatación (borde de la losa)
      const ex = Math.min(x, size - 1 - x);
      const ey = Math.min(y, size - 1 - y);
      const e = Math.min(ex, ey);
      const joint = e < 2.2 ? 1 - e / 2.2 : 0;
      const pore = poreMap[y * size + x];
      let c = 0.86 + (big - 0.5) * 0.16 + (mid - 0.5) * 0.08 + (grain - 0.5) * 0.07;
      c -= stain * 0.1;
      c -= pore * 0.16;
      c -= joint * 0.38;
      c = Math.max(0, Math.min(1, c));
      const warm = (big - 0.5) * 0.04;
      const i = (y * size + x) * 4;
      alb[i] = Math.round(Math.min(1, c + warm) * 255);
      alb[i + 1] = Math.round(c * 255);
      alb[i + 2] = Math.round(Math.max(0, c - warm * 1.5) * 255);
      alb[i + 3] = 255;
      height[y * size + x] = mid * 0.5 + grain * 0.18 - pore * 0.7 - joint * 1.4;
      const r = 0.82 + (grain - 0.5) * 0.1 - stain * 0.2 + joint * 0.1;
      rough[i] = rough[i + 1] = rough[i + 2] = Math.round(Math.max(0, Math.min(1, r)) * 255);
      rough[i + 3] = 255;
    }
  }
  const nrm = heightToNormal(height, size, size, 2.2);
  return {
    map: dataTexture(alb, size, size, { srgb: true, anisotropy: 8 }),
    normalMap: dataTexture(nrm, size, size, { anisotropy: 8 }),
    roughnessMap: dataTexture(rough, size, size, { anisotropy: 4 })
  };
}

/** Chapa corrugada vertical (4 nervios por tile) con abolladuras. */
export function makeCorrugatedTextures(size = 256, seed = 9) {
  const height = new Float32Array(size * size);
  const alb = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const ph = (u * 4) % 1;
      // perfil trapezoidal
      let p;
      if (ph < 0.38) p = 1;
      else if (ph < 0.5) p = 1 - (ph - 0.38) / 0.12;
      else if (ph < 0.88) p = 0;
      else p = (ph - 0.88) / 0.12;
      const dent = periodicFbm(u * 6, v * 6, 6, 3, seed) - 0.5;
      const scratch = periodicFbm(u * 40, v * 3, 40, 2, seed + 5);
      height[y * size + x] = p * 1.0 + dent * 0.35;
      const grime = periodicFbm(u * 2, v * 8, 2, 4, seed + 9);
      let c = 0.92 + (dent) * 0.1 - Math.max(0, grime - 0.62) * 0.4 - (p < 0.5 ? 0.04 : 0);
      c += (scratch - 0.5) * 0.04;
      const i = (y * size + x) * 4;
      alb[i] = alb[i + 1] = alb[i + 2] = Math.round(Math.max(0, Math.min(1, c)) * 255);
      alb[i + 3] = 255;
    }
  }
  const nrm = heightToNormal(height, size, size, 6.5);
  return {
    map: dataTexture(alb, size, size, { srgb: true, anisotropy: 8 }),
    normalMap: dataTexture(nrm, size, size, { anisotropy: 8 })
  };
}

/** Placa de metal con remaches y paneles (para bases, pasarelas, maquinaria). */
export function makePanelTextures(size = 256, seed = 17) {
  const height = new Float32Array(size * size);
  const alb = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const ex = Math.min(x, size - 1 - x);
      const ey = Math.min(y, size - 1 - y);
      const seam = Math.min(ex, ey) < 2 ? 1 : 0;
      // remaches cerca del borde
      let rivet = 0;
      const rx = ((x + 16) % 32) - 16;
      const ry = Math.min(ey, 32) - 8;
      const rx2 = ((y + 16) % 32) - 16;
      const ry2 = Math.min(ex, 32) - 8;
      const d1 = Math.hypot(rx, ry);
      const d2 = Math.hypot(rx2, ry2);
      if (d1 < 3.2) rivet = Math.max(rivet, 1 - d1 / 3.2);
      if (d2 < 3.2) rivet = Math.max(rivet, 1 - d2 / 3.2);
      const n = periodicFbm(u * 5, v * 5, 5, 4, seed);
      height[y * size + x] = -seam * 1.2 + rivet * 1.5 + (n - 0.5) * 0.2;
      let c = 0.9 + (n - 0.5) * 0.12 - seam * 0.3 + rivet * 0.06;
      const i = (y * size + x) * 4;
      alb[i] = alb[i + 1] = alb[i + 2] = Math.round(Math.max(0, Math.min(1, c)) * 255);
      alb[i + 3] = 255;
    }
  }
  const nrm = heightToNormal(height, size, size, 3);
  return {
    map: dataTexture(alb, size, size, { srgb: true, anisotropy: 8 }),
    normalMap: dataTexture(nrm, size, size, { anisotropy: 8 })
  };
}

/** Rejilla metálica para pasarelas (normal + albedo). */
export function makeGratingTextures(size = 128) {
  const height = new Float32Array(size * size);
  const alb = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x % 16) / 16;
      const gy = (y % 16) / 16;
      const bar = gx < 0.22 || gy < 0.22 ? 1 : 0;
      height[y * size + x] = bar;
      const c = bar ? 0.85 : 0.18;
      const i = (y * size + x) * 4;
      alb[i] = alb[i + 1] = alb[i + 2] = Math.round(c * 255);
      alb[i + 3] = 255;
    }
  }
  const nrm = heightToNormal(height, size, size, 1.6);
  return {
    map: dataTexture(alb, size, size, { srgb: true, anisotropy: 8 }),
    normalMap: dataTexture(nrm, size, size, { anisotropy: 8 })
  };
}

// ── Utilidades de canvas ─────────────────────────────────────

export function canvasTexture(canvas, opts = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = opts.anisotropy || 8;
  tex.wrapS = tex.wrapT = opts.wrap || THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Toldo a rayas (tileable en u). */
export function makeStripeTexture(colA, colB, stripes = 8, size = 256) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const w = size / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? colB : colA;
    g.fillRect(i * w, 0, w + 1, size);
  }
  // festón inferior
  g.fillStyle = 'rgba(0,0,0,0.08)';
  g.fillRect(0, size * 0.9, size, size * 0.1);
  const tex = canvasTexture(c, { wrap: THREE.RepeatWrapping });
  return tex;
}

/**
 * Fachada con ventanas: devuelve {map, emissiveMap}. cols×rows ventanas en
 * un tile; algunas encendidas con luz cálida o fría.
 */
export function makeWindowTextures(cols = 4, rows = 3, seed = 5, opts = {}) {
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const e = makeCanvas(W, H);
  const g = c.getContext('2d');
  const ge = e.getContext('2d');
  const rand = rng(seed);
  g.fillStyle = opts.wall || '#e9dcc5';
  g.fillRect(0, 0, W, H);
  // ruido de pared
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(80,60,40,${rand() * 0.05})`;
    g.fillRect(rand() * W, rand() * H, 2 + rand() * 6, 2 + rand() * 6);
  }
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  const cw = W / cols;
  const rh = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = k * cw + cw * 0.16;
      const y = r * rh + rh * 0.18;
      const w = cw * 0.68;
      const h = rh * 0.6;
      // marco
      g.fillStyle = opts.frame || '#5b5570';
      g.fillRect(x - 5, y - 5, w + 10, h + 10);
      // alféizar
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(x - 8, y + h + 5, w + 16, 6);
      // vidrio con reflejo de cielo
      const grad = g.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, '#c3c9df');
      grad.addColorStop(0.5, '#6f6c92');
      grad.addColorStop(1, '#3d3656');
      g.fillStyle = grad;
      g.fillRect(x, y, w, h);
      // reflejo diagonal
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.moveTo(x + w * 0.1, y + h);
      g.lineTo(x + w * 0.45, y);
      g.lineTo(x + w * 0.6, y);
      g.lineTo(x + w * 0.25, y + h);
      g.fill();
      // parteluz
      g.fillStyle = opts.frame || '#5b5570';
      g.fillRect(x + w / 2 - 2, y, 4, h);
      const lit = rand();
      if (lit < 0.42) {
        const warm = rand() < 0.7;
        const col = warm ? '#ffcf8a' : '#9ff0ff';
        ge.fillStyle = col;
        ge.globalAlpha = 0.55 + rand() * 0.45;
        ge.fillRect(x, y, w, h);
        ge.globalAlpha = 1;
        g.fillStyle = warm ? 'rgba(255,214,150,0.6)' : 'rgba(170,240,255,0.55)';
        g.fillRect(x, y, w, h);
        // persiana a medias
        if (rand() < 0.4) {
          const bh = h * (0.25 + rand() * 0.4);
          g.fillStyle = '#d8cbe8';
          g.fillRect(x, y, w, bh);
          ge.fillStyle = '#000';
          ge.fillRect(x, y, w, bh);
          g.fillStyle = 'rgba(0,0,0,0.12)';
          for (let s = 0; s < bh; s += 6) g.fillRect(x, y + s, w, 2);
        }
      }
    }
  }
  const map = canvasTexture(c, { wrap: THREE.RepeatWrapping });
  const emissiveMap = canvasTexture(e, { wrap: THREE.RepeatWrapping });
  return { map, emissiveMap };
}

/** Gradiente radial suave (para sombras de contacto, halos, partículas). */
export function makeRadialTexture(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return canvasTexture(c, { srgb: false });
}
