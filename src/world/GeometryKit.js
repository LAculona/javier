import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
//  GeometryKit · primitivas biseladas con atributos para el pipeline:
//   position, normal, uv (metros / uvScale), paintUV (atlas, -1 = no),
//   edge (1 en biseles → desgaste), color (lo rellena el batcher)
// ─────────────────────────────────────────────────────────────

const AX = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0)
];
// índice de cara lógico: 0 +X, 1 -X, 2 +Z, 3 -Z, 4 +Y, 5 -Y

class GeoWriter {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.puv = [];
    this.edge = [];
    this.idx = [];
    this.count = 0;
  }

  vert(p, n, face, edge, ctx) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    // UV proyectada por cara (metros)
    let u;
    let v;
    switch (face) {
      case 0:
        u = -p.z;
        v = p.y;
        break;
      case 1:
        u = p.z;
        v = p.y;
        break;
      case 2:
        u = p.x;
        v = p.y;
        break;
      case 3:
        u = -p.x;
        v = p.y;
        break;
      default:
        u = p.x;
        v = face === 4 ? -p.z : p.z;
        break;
    }
    const s = ctx.uvScale;
    this.uv.push((u + ctx.uvOffset.x) / s, (v + ctx.uvOffset.y) / s);
    if (ctx.paintMap && face <= 3) {
      const r = ctx.paintMap(face, p.x, p.y, p.z);
      if (r) this.puv.push(r.x, r.y);
      else this.puv.push(-1, -1);
    } else {
      this.puv.push(-1, -1);
    }
    this.edge.push(edge);
    return this.count++;
  }

  tri(a, b, c) {
    this.idx.push(a, b, c);
  }

  quad(a, b, c, d) {
    // a-b-c-d en sentido antihorario visto desde fuera
    this.idx.push(a, b, c, a, c, d);
  }

  // Igual que quad() pero orienta el quad según la normal exterior esperada
  quadN(a, b, c, d, n) {
    const P = this.pos;
    const ax = P[a * 3];
    const ay = P[a * 3 + 1];
    const az = P[a * 3 + 2];
    const e1x = P[b * 3] - ax;
    const e1y = P[b * 3 + 1] - ay;
    const e1z = P[b * 3 + 2] - az;
    const e2x = P[c * 3] - ax;
    const e2y = P[c * 3 + 1] - ay;
    const e2z = P[c * 3 + 2] - az;
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    if (cx * n.x + cy * n.y + cz * n.z >= 0) this.quad(a, b, c, d);
    else this.quad(a, d, c, b);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('paintUV', new THREE.Float32BufferAttribute(this.puv, 2));
    g.setAttribute('edge', new THREE.Float32BufferAttribute(this.edge, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _defaultCtx = { uvScale: 1, uvOffset: { x: 0, y: 0 }, paintMap: null };

function makeCtx(opts) {
  return {
    uvScale: opts.uvScale || 1,
    uvOffset: opts.uvOffset || _defaultCtx.uvOffset,
    paintMap: opts.paintMap || null
  };
}

/**
 * Caja con aristas redondeadas (perfil de 2 segmentos, normales suaves).
 * opts: bevel, uvScale, uvOffset {x,y}, paintMap(face, x, y, z) → {x,y}|null
 */
export function bevelBox(w, h, d, opts = {}) {
  const b = Math.min(opts.bevel !== undefined ? opts.bevel : 0.06, w * 0.45, h * 0.45, d * 0.45);
  const ctx = makeCtx(opts);
  const W = new GeoWriter();
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  const ix = hx - b;
  const iy = hy - b;
  const iz = hz - b;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── caras planas
  const faceQuad = (face, corners) => {
    const n = AX[face];
    const ids = corners.map((c) => W.vert(c, n, face, 0, ctx));
    W.quad(ids[0], ids[1], ids[2], ids[3]);
  };
  faceQuad(0, [V(hx, -iy, iz), V(hx, -iy, -iz), V(hx, iy, -iz), V(hx, iy, iz)]);
  faceQuad(1, [V(-hx, -iy, -iz), V(-hx, -iy, iz), V(-hx, iy, iz), V(-hx, iy, -iz)]);
  faceQuad(2, [V(-ix, -iy, hz), V(ix, -iy, hz), V(ix, iy, hz), V(-ix, iy, hz)]);
  faceQuad(3, [V(ix, -iy, -hz), V(-ix, -iy, -hz), V(-ix, iy, -hz), V(ix, iy, -hz)]);
  faceQuad(4, [V(-ix, hy, iz), V(ix, hy, iz), V(ix, hy, -iz), V(-ix, hy, -iz)]);
  faceQuad(5, [V(-ix, -hy, -iz), V(ix, -hy, -iz), V(ix, -hy, iz), V(-ix, -hy, iz)]);

  if (b <= 0.0005) return W.build();

  // ── aristas: cuarto de círculo con 3 filas (A, medio, B)
  const inner = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const edgeStrip = (fa, fb, axis, lo, hi, cornerSign) => {
    // axis: eje a lo largo de la arista ('x','y','z'); cornerSign: vector con el signo
    // del centro interior en los otros dos ejes
    const nA = AX[fa];
    const nB = AX[fb];
    const nM = new THREE.Vector3().addVectors(nA, nB).normalize();
    const rows = [];
    for (const t of [lo, hi]) {
      inner.set(cornerSign.x * ix, cornerSign.y * iy, cornerSign.z * iz);
      inner[axis] = t;
      const pA = inner.clone().addScaledVector(nA, b);
      const pM = inner.clone().addScaledVector(nM, b);
      const pB = inner.clone().addScaledVector(nB, b);
      rows.push({ pA, pM, pB });
    }
    // mitad A
    const a0 = W.vert(rows[0].pA, nA, fa, 0.6, ctx);
    const a1 = W.vert(rows[1].pA, nA, fa, 0.6, ctx);
    const m0a = W.vert(rows[0].pM, nM, fa, 1, ctx);
    const m1a = W.vert(rows[1].pM, nM, fa, 1, ctx);
    // mitad B
    const m0b = W.vert(rows[0].pM, nM, fb, 1, ctx);
    const m1b = W.vert(rows[1].pM, nM, fb, 1, ctx);
    const b0 = W.vert(rows[0].pB, nB, fb, 0.6, ctx);
    const b1 = W.vert(rows[1].pB, nB, fb, 0.6, ctx);
    // orientar triángulos hacia fuera
    tmp.subVectors(rows[1].pA, rows[0].pA);
    const e1 = new THREE.Vector3().subVectors(rows[0].pM, rows[0].pA);
    const nTest = new THREE.Vector3().crossVectors(tmp, e1);
    const flip = nTest.dot(nM) < 0;
    if (!flip) {
      W.quad(a0, a1, m1a, m0a);
      W.quad(m0b, m1b, b1, b0);
    } else {
      W.quad(a0, m0a, m1a, a1);
      W.quad(m0b, b0, b1, m1b);
    }
  };

  const S = (x, y, z) => new THREE.Vector3(x, y, z);
  // aristas verticales (a lo largo de y)
  edgeStrip(0, 2, 'y', -iy, iy, S(1, 0, 1));
  edgeStrip(2, 1, 'y', -iy, iy, S(-1, 0, 1));
  edgeStrip(1, 3, 'y', -iy, iy, S(-1, 0, -1));
  edgeStrip(3, 0, 'y', -iy, iy, S(1, 0, -1));
  // aristas superiores
  edgeStrip(0, 4, 'z', -iz, iz, S(1, 1, 0));
  edgeStrip(1, 4, 'z', -iz, iz, S(-1, 1, 0));
  edgeStrip(2, 4, 'x', -ix, ix, S(0, 1, 1));
  edgeStrip(3, 4, 'x', -ix, ix, S(0, 1, -1));
  // aristas inferiores
  edgeStrip(0, 5, 'z', -iz, iz, S(1, -1, 0));
  edgeStrip(1, 5, 'z', -iz, iz, S(-1, -1, 0));
  edgeStrip(2, 5, 'x', -ix, ix, S(0, -1, 1));
  edgeStrip(3, 5, 'x', -ix, ix, S(0, -1, -1));

  // ── esquinas: 3 quads (uno por cara) alrededor del punto central
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const fx = sx > 0 ? 0 : 1;
        const fy = sy > 0 ? 4 : 5;
        const fz = sz > 0 ? 2 : 3;
        const c = new THREE.Vector3(sx * ix, sy * iy, sz * iz);
        const nx = AX[fx];
        const ny = AX[fy];
        const nz = AX[fz];
        const nC = new THREE.Vector3(sx, sy, sz).normalize();
        const nXY = new THREE.Vector3().addVectors(nx, ny).normalize();
        const nYZ = new THREE.Vector3().addVectors(ny, nz).normalize();
        const nZX = new THREE.Vector3().addVectors(nz, nx).normalize();
        const P = (n) => c.clone().addScaledVector(n, b);
        const corner = P(nC);
        const quadFor = (face, nF, nE1, nE2) => {
          const q0 = W.vert(P(nF), nF, face, 0.6, ctx);
          const q1 = W.vert(P(nE1), nE1, face, 1, ctx);
          const q2 = W.vert(corner, nC, face, 1, ctx);
          const q3 = W.vert(P(nE2), nE2, face, 1, ctx);
          // orientación
          const pa = P(nF);
          const pb = P(nE1);
          const pc = corner;
          const nn = new THREE.Vector3().crossVectors(
            new THREE.Vector3().subVectors(pb, pa),
            new THREE.Vector3().subVectors(pc, pa)
          );
          if (nn.dot(nC) >= 0) W.quad(q0, q1, q2, q3);
          else W.quad(q0, q3, q2, q1);
        };
        quadFor(fx, nx, nXY, nZX);
        quadFor(fy, ny, nYZ, nXY);
        quadFor(fz, nz, nZX, nYZ);
      }
    }
  }
  return W.build();
}

/**
 * Cuña/rampa: base en y=-h/2, cara superior de hLow (en -z) a hHigh (en +z),
 * medida desde la base. Bisel en las aristas superiores laterales.
 */
export function rampGeometry(w, hLow, hHigh, d, opts = {}) {
  const ctx = makeCtx(opts);
  const W = new GeoWriter();
  const b = Math.min(opts.bevel !== undefined ? opts.bevel : 0.08, w * 0.2);
  const hMax = Math.max(hLow, hHigh);
  const y0 = -hMax / 2; // base
  const yl = y0 + hLow;
  const yh = y0 + hHigh;
  const hx = w / 2;
  const hz = d / 2;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // normal de la pendiente
  const slope = new THREE.Vector3(0, d, -(hHigh - hLow)).normalize();
  const ix = hx - b;

  // cara superior (inset b en x)
  {
    const a = W.vert(V(-ix, yl, -hz), slope, 4, 0, ctx);
    const bb = W.vert(V(ix, yl, -hz), slope, 4, 0, ctx);
    const c = W.vert(V(ix, yh, hz), slope, 4, 0, ctx);
    const dd = W.vert(V(-ix, yh, hz), slope, 4, 0, ctx);
    W.quadN(a, bb, c, dd, slope);
  }
  // biseles laterales (redondeo aproximado con normal suave)
  for (const s of [1, -1]) {
    const face = s > 0 ? 0 : 1;
    const nSide = AX[face];
    const nMid = new THREE.Vector3().addVectors(nSide, slope).normalize();
    const pTopL = V(s * ix, yl, -hz);
    const pTopH = V(s * ix, yh, hz);
    const pSideL = V(s * hx, yl - b, -hz);
    const pSideH = V(s * hx, yh - b, hz);
    const t0 = W.vert(pTopL, slope, 4, 0.8, ctx);
    const t1 = W.vert(pTopH, slope, 4, 0.8, ctx);
    const m0 = W.vert(pTopL.clone().lerp(pSideL, 0.5).addScaledVector(nMid, b * 0.3), nMid, face, 1, ctx);
    const m1 = W.vert(pTopH.clone().lerp(pSideH, 0.5).addScaledVector(nMid, b * 0.3), nMid, face, 1, ctx);
    const s0 = W.vert(pSideL, nSide, face, 0.8, ctx);
    const s1 = W.vert(pSideH, nSide, face, 0.8, ctx);
    W.quadN(t0, m0, m1, t1, nMid);
    W.quadN(m0, s0, s1, m1, nMid);
    // cara lateral (trapecio)
    const q0 = W.vert(V(s * hx, y0, -hz), nSide, face, 0, ctx);
    const q1 = W.vert(V(s * hx, y0, hz), nSide, face, 0, ctx);
    const q2 = W.vert(V(s * hx, yh - b, hz), nSide, face, 0, ctx);
    const q3 = W.vert(V(s * hx, yl - b, -hz), nSide, face, 0, ctx);
    W.quadN(q0, q1, q2, q3, nSide);
  }
  // trasera (+z)
  {
    const n = AX[2];
    const a = W.vert(V(-hx, y0, hz), n, 2, 0, ctx);
    const bb = W.vert(V(hx, y0, hz), n, 2, 0, ctx);
    const c = W.vert(V(hx, yh - b, hz), n, 2, 0, ctx);
    const e = W.vert(V(ix, yh, hz), n, 2, 0.8, ctx);
    const f = W.vert(V(-ix, yh, hz), n, 2, 0.8, ctx);
    const g = W.vert(V(-hx, yh - b, hz), n, 2, 0, ctx);
    W.quadN(a, bb, c, g, n);
    W.quadN(g, c, e, f, n);
  }
  // frontal (-z) si tiene altura
  if (hLow > 0.02) {
    const n = AX[3];
    const a = W.vert(V(hx, y0, -hz), n, 3, 0, ctx);
    const bb = W.vert(V(-hx, y0, -hz), n, 3, 0, ctx);
    const c = W.vert(V(-hx, Math.max(y0, yl - b), -hz), n, 3, 0, ctx);
    const dd = W.vert(V(hx, Math.max(y0, yl - b), -hz), n, 3, 0, ctx);
    W.quadN(a, bb, c, dd, n);
  }
  // base
  {
    const n = AX[5];
    const a = W.vert(V(-hx, y0, -hz), n, 5, 0, ctx);
    const bb = W.vert(V(hx, y0, -hz), n, 5, 0, ctx);
    const c = W.vert(V(hx, y0, hz), n, 5, 0, ctx);
    const dd = W.vert(V(-hx, y0, hz), n, 5, 0, ctx);
    W.quadN(a, bb, c, dd, n);
  }
  return W.build();
}

/**
 * Añade los atributos estándar a una geometría de three.js (cilindros,
 * torus, lathe...) para que pueda fusionarse con el resto.
 */
export function prep(geo, opts = {}) {
  let g = geo.index ? geo : geo;
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (opts.uvScale && opts.uvScale !== 1) {
    const uv = g.attributes.uv;
    for (let i = 0; i < n; i++) uv.setXY(i, uv.getX(i) / opts.uvScale, uv.getY(i) / opts.uvScale);
  }
  const puv = new Float32Array(n * 2).fill(-1);
  if (opts.paintMap) {
    const p = g.attributes.position;
    const nn = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      const nx = nn.getX(i);
      const nz = nn.getZ(i);
      const ny = nn.getY(i);
      if (Math.abs(ny) > Math.max(Math.abs(nx), Math.abs(nz))) continue;
      const face = Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? 0 : 1) : nz > 0 ? 2 : 3;
      const r = opts.paintMap(face, p.getX(i), p.getY(i), p.getZ(i));
      if (r) {
        puv[i * 2] = r.x;
        puv[i * 2 + 1] = r.y;
      }
    }
  }
  g.setAttribute('paintUV', new THREE.Float32BufferAttribute(puv, 2));
  const e = new Float32Array(n).fill(opts.edge !== undefined ? opts.edge : 0);
  g.setAttribute('edge', new THREE.Float32BufferAttribute(e, 1));
  return g;
}

/** Lathe con perfil [[r,y],...] y atributos estándar. */
export function lathe(profile, segments = 16, opts = {}) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const g = new THREE.LatheGeometry(pts, segments);
  return prep(g, opts);
}

export function cylinder(rt, rb, h, seg = 16, opts = {}) {
  return prep(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!opts.open), opts);
}

export function torus(r, tube, rs = 8, ts = 20, arc = Math.PI * 2, opts = {}) {
  return prep(new THREE.TorusGeometry(r, tube, rs, ts, arc), opts);
}

export function sphere(r, ws = 16, hs = 12, opts = {}) {
  return prep(new THREE.SphereGeometry(r, ws, hs), opts);
}

export function capsule(r, len, cap = 6, radial = 12, opts = {}) {
  return prep(new THREE.CapsuleGeometry(r, len, cap, radial), opts);
}

export function tube(points, radius, tubular = 24, radial = 8, opts = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]))));
  return prep(new THREE.TubeGeometry(curve, tubular, radius, radial, false), opts);
}

/** Plano horizontal (normal +Y) de w×d con UV en metros. */
export function plane(w, d, opts = {}) {
  const g = new THREE.PlaneGeometry(w, d, opts.segX || 1, opts.segZ || 1);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  const p = g.attributes.position;
  const s = opts.uvScale || 1;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / s, -p.getZ(i) / s);
  return prep(g, opts);
}

/** Quad vertical orientado a +Z (para carteles/logos) de w×h. */
export function quad(w, h, opts = {}) {
  const g = new THREE.PlaneGeometry(w, h);
  return prep(g, opts);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Matriz TRS utilitaria. */
export function trs(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export function mat4() {
  return _m.identity();
}
