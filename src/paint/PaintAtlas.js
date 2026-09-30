// ─────────────────────────────────────────────────────────────
//  PaintAtlas · reparto de las caras verticales pintables del mapa en un
//  atlas virtual cuadrado medido en metros (densidad isótropa). Cada cara
//  obtiene un rectángulo; la geometría guarda en `paintUV` la coordenada
//  normalizada y el PaintSystem estampa las salpicaduras en ese rect.
// ─────────────────────────────────────────────────────────────

export const FACE_PX = 0;
export const FACE_NX = 1;
export const FACE_PZ = 2;
export const FACE_NZ = 3;

const PAD = 0.35; // metros de margen entre caras (evita sangrado bilineal)

export class PaintAtlas {
  constructor() {
    this.faces = [];
    this.size = 64; // lado en metros, se recalcula en finalize()
    this.finalized = false;
  }

  /**
   * Registra las caras laterales de un sólido. Para cajas: 4 caras
   * rectangulares; para rampas: los dos triángulos laterales y la trasera.
   * mask: array de índices de cara a incluir (por defecto todas).
   */
  registerSolid(solid, mask) {
    const faces = [null, null, null, null];
    const include = (i) => !mask || mask.includes(i);
    const hx = solid.hx;
    const hz = solid.hz;
    if (solid.type === 'ramp') {
      const hMax = Math.max(solid.yLow, solid.yHigh) - solid.bottom;
      if (include(FACE_PX)) faces[FACE_PX] = this._request(solid, FACE_PX, 2 * hz, hMax);
      if (include(FACE_NX)) faces[FACE_NX] = this._request(solid, FACE_NX, 2 * hz, hMax);
      const back = solid.yHigh - solid.bottom;
      if (back > 0.25 && include(FACE_PZ)) faces[FACE_PZ] = this._request(solid, FACE_PZ, 2 * hx, back);
      const front = solid.yLow - solid.bottom;
      if (front > 0.25 && include(FACE_NZ)) faces[FACE_NZ] = this._request(solid, FACE_NZ, 2 * hx, front);
    } else {
      const h = solid.top - solid.bottom;
      if (include(FACE_PX)) faces[FACE_PX] = this._request(solid, FACE_PX, 2 * hz, h);
      if (include(FACE_NX)) faces[FACE_NX] = this._request(solid, FACE_NX, 2 * hz, h);
      if (include(FACE_PZ)) faces[FACE_PZ] = this._request(solid, FACE_PZ, 2 * hx, h);
      if (include(FACE_NZ)) faces[FACE_NZ] = this._request(solid, FACE_NZ, 2 * hx, h);
    }
    solid.faces = faces;
    return faces;
  }

  _request(solid, index, w, h) {
    const f = {
      solid,
      index,
      w,
      h,
      // rect normalizado (se rellena en finalize)
      x: 0,
      y: 0,
      rw: 0,
      rh: 0
    };
    this.faces.push(f);
    return f;
  }

  finalize() {
    // Empaquetado por estantes ordenado por altura
    const faces = this.faces.slice().sort((a, b) => b.h - a.h || b.w - a.w);
    let area = 0;
    for (const f of faces) area += (f.w + PAD * 2) * (f.h + PAD * 2);
    let side = Math.max(16, Math.ceil(Math.sqrt(area) * 1.08));
    for (let attempt = 0; attempt < 40; attempt++) {
      if (this._pack(faces, side)) break;
      side = Math.ceil(side * 1.06);
    }
    this.size = side;
    for (const f of this.faces) {
      f.x = f.px / side;
      f.y = f.py / side;
      f.rw = f.w / side;
      f.rh = f.h / side;
    }
    this.finalized = true;
  }

  _pack(faces, side) {
    let x = 0;
    let y = 0;
    let shelfH = 0;
    for (const f of faces) {
      const w = f.w + PAD * 2;
      const h = f.h + PAD * 2;
      if (w > side) return false;
      if (x + w > side) {
        x = 0;
        y += shelfH;
        shelfH = 0;
      }
      if (y + h > side) return false;
      f.px = x + PAD;
      f.py = y + PAD;
      x += w;
      shelfH = Math.max(shelfH, h);
    }
    return true;
  }

  /**
   * Coordenadas (u,v) en metros dentro de una cara a partir de un punto en el
   * espacio local del sólido.
   */
  static faceCoords(solid, index, lx, ly, lz, out) {
    const hx = solid.hx;
    const hz = solid.hz;
    const v = ly + solid.hy;
    let u;
    switch (index) {
      case FACE_PX:
        u = hz - lz;
        break;
      case FACE_NX:
        u = lz + hz;
        break;
      case FACE_PZ:
        u = lx + hx;
        break;
      default:
        u = hx - lx;
        break;
    }
    out.u = u;
    out.v = v;
    return out;
  }

  /** UV normalizada del atlas para una cara y coords en metros. */
  static toUV(face, u, v, out) {
    const uu = Math.max(0, Math.min(face.w, u));
    const vv = Math.max(0, Math.min(face.h, v));
    out.x = face.x + (uu / face.w) * face.rw;
    out.y = face.y + (vv / face.h) * face.rh;
    return out;
  }
}
