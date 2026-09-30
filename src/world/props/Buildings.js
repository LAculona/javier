import * as THREE from 'three';
import { bevelBox, cylinder, lathe, sphere, torus, quad, trs, prep } from '../GeometryKit.js';
import { applySignUV } from './Signage.js';
import { FACE_PX, FACE_NX, FACE_PZ, FACE_NZ } from '../../paint/PaintAtlas.js';
import { COLORS } from '../../config.js';

// ─────────────────────────────────────────────────────────────
//  Buildings · fachadas del lateral comercial, kioscos, food truck,
//  mercado cubierto, sedes de equipo y la ciudad de fondo.
// ─────────────────────────────────────────────────────────────

const FACE_TOWARD = { '-x': FACE_NX, '+x': FACE_PX, '-z': FACE_NZ, '+z': FACE_PZ };

/**
 * Toldo curvo: lámina que sale de la pared (z=0, y=0) hacia fuera y abajo.
 * width a lo largo de X, radio r y profundidad escalada.
 */
export function awningGeometry(width, r, depthK = 1, seg = 10) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const phi = (i / seg) * (Math.PI / 2);
    const y = -r + r * Math.cos(phi);
    const z = r * Math.sin(phi) * depthK;
    for (let j = 0; j <= 1; j++) {
      const x = (j - 0.5) * width;
      pos.push(x, y, z);
      uv.push((x + width / 2) / 2.2, i / seg);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  // faldón con ondas
  const base = (seg + 1) * 2;
  const yb = -r;
  const zb = r * depthK;
  const waves = Math.max(4, Math.round(width / 0.55));
  for (let k = 0; k <= waves * 4; k++) {
    const t = k / (waves * 4);
    const x = (t - 0.5) * width;
    const drop = 0.22 + Math.abs(Math.sin(t * waves * Math.PI)) * 0.12;
    pos.push(x, yb, zb, x, yb - drop, zb);
    uv.push((x + width / 2) / 2.2, 1, (x + width / 2) / 2.2, 1.12);
  }
  for (let k = 0; k < waves * 4; k++) {
    const a = base + k * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return prep(g);
}

function signQuad(b, name, w) {
  const r = b.signs.rects[name];
  const h = w / r.aspect;
  return { geo: applySignUV(quad(w, h), r), h };
}

/**
 * Edificio de fachada. front: '-x' | '+x' | '-z' | '+z' (cara hacia el juego).
 * o: { x, z, w, d, h, mat, color, front, shop: {sign, neon, awning}, roof }
 */
export function building(b, o) {
  const front = o.front || '-x';
  const s = b.solid({
    x: o.x,
    y: o.h / 2,
    z: o.z,
    w: o.w,
    h: o.h,
    d: o.d,
    floor: false,
    walkable: false,
    paintable: true,
    paintMask: [FACE_TOWARD[front]],
    tag: 'building'
  });
  const color = o.color !== undefined ? o.color : 0xffffff;
  b.later(() => {
    const pm = b.pm(s);
    const M = b.solidMatrix(s);
    const body = bevelBox(o.w, o.h, o.d, { bevel: 0.12, uvScale: 6, uvOffset: { x: o.z * 0.5, y: 0 }, paintMap: pm });
    b.add(o.mat || 'buildingA', body, M, color);
    // cornisa / pretil
    const par = bevelBox(o.w + 0.3, 0.45, o.d + 0.3, { bevel: 0.08, uvScale: 4 });
    b.add('concrete', par, M.clone().multiply(trs(0, o.h / 2 + 0.1, 0)), o.trim || COLORS.creamDark);
    // zócalo
    const base = bevelBox(o.w + 0.12, 0.35, o.d + 0.12, { bevel: 0.05, uvScale: 4 });
    b.add('concrete', base, M.clone().multiply(trs(0, -o.h / 2 + 0.17, 0)), COLORS.concreteDark);

    // sistema local con la fachada mirando a +Z local para piezas de escaparate
    const faceRot = { '-x': -Math.PI / 2, '+x': Math.PI / 2, '-z': Math.PI, '+z': 0 }[front];
    const faceDepth = front === '-x' || front === '+x' ? o.w / 2 : o.d / 2;
    const faceLen = front === '-x' || front === '+x' ? o.d : o.w;
    const F = trs(o.x, 0, o.z, 0, faceRot, 0).multiply(trs(0, 0, faceDepth));
    const faceIdx = FACE_TOWARD[front];
    // mapeo de pintura de piezas de fachada: (u a lo largo, v altura)
    const pmFace = (lx, ly) => {
      if (!pm) return null;
      // convertir coords de fachada (x a lo largo, y altura) a locales del sólido
      let sx;
      let sz;
      if (front === '-x') {
        sx = -o.w / 2;
        sz = lx;
      } else if (front === '+x') {
        sx = o.w / 2;
        sz = -lx;
      } else if (front === '-z') {
        sx = -lx;
        sz = -o.d / 2;
      } else {
        sx = lx;
        sz = o.d / 2;
      }
      return pm(faceIdx, sx, ly - o.h / 2, sz);
    };
    const withFacePaint = (geo, ox, oy) => {
      const p = geo.attributes.position;
      const puv = geo.attributes.paintUV;
      for (let i = 0; i < p.count; i++) {
        const r = pmFace(p.getX(i) + ox, p.getY(i) + oy);
        if (r) puv.setXY(i, r.x, r.y);
      }
      puv.needsUpdate = true;
      return geo;
    };

    if (o.shop) {
      const sw = Math.min(faceLen - 2.4, o.shop.width || faceLen - 2.4);
      const sh = 3.0;
      // marco del escaparate
      const frame = bevelBox(sw + 0.5, sh + 0.35, 0.3, { bevel: 0.06, uvScale: 4 });
      b.add('metal', withFacePaint(frame, 0, sh / 2 + 0.1), F.clone().multiply(trs(0, sh / 2 + 0.1, 0.1)), o.shop.frame || COLORS.charcoal);
      // cristal
      const glass = bevelBox(sw, sh - 0.2, 0.12, { bevel: 0.02 });
      b.add('glass', glass, F.clone().multiply(trs(0, sh / 2 + 0.05, 0.22)), 0x4a4668);
      // interior iluminado (franja cálida)
      const glowStrip = bevelBox(sw - 0.3, 0.12, 0.05, { bevel: 0.01 });
      b.add('glow', glowStrip, F.clone().multiply(trs(0, sh - 0.25, 0.3)), 0xffd9a0);
      // parteluces
      const n = Math.max(2, Math.round(sw / 2.2));
      for (let i = 1; i < n; i++) {
        const mx = -sw / 2 + (sw * i) / n;
        const mull = bevelBox(0.1, sh - 0.2, 0.18, { bevel: 0.02 });
        b.add('metal', mull, F.clone().multiply(trs(mx, sh / 2 + 0.05, 0.26)), o.shop.frame || COLORS.charcoal);
      }
      // puerta
      const door = bevelBox(1.1, 2.3, 0.1, { bevel: 0.03 });
      b.add('darkMetal', door, F.clone().multiply(trs(sw / 2 - 0.9, 1.15, 0.3)), 0x5b5570);
      // toldo
      if (o.shop.awning) {
        const aw = awningGeometry(sw + 0.4, 1.3, 1.1);
        b.add(o.shop.awning, aw, F.clone().multiply(trs(0, sh + 0.45, 0.18)), 0xffffff);
        for (const sx of [-1, 1]) {
          const rod = cylinder(0.025, 0.025, 1.45, 6);
          b.add('darkMetal', rod, F.clone().multiply(trs(sx * (sw / 2 + 0.1), sh - 0.05, 0.62, 0.95, 0, 0)), COLORS.charcoal);
        }
      }
      // cartel
      if (o.shop.sign) {
        const sq = signQuad(b, o.shop.sign, Math.min(sw * 0.8, o.shop.signWidth || 4.2));
        withFacePaint(sq.geo, 0, sh + 1.25);
        const back = bevelBox(Math.min(sw * 0.8, o.shop.signWidth || 4.2) + 0.3, sq.h + 0.2, 0.14, { bevel: 0.04 });
        if (!o.shop.neon) b.add('metal', withFacePaint(back, 0, sh + 1.25), F.clone().multiply(trs(0, sh + 1.25, 0.12)), COLORS.cream);
        b.add(o.shop.neon ? 'neon' : 'sign', sq.geo, F.clone().multiply(trs(0, sh + 1.25, 0.21)), 0xffffff);
      }
    }
    // bajantes y aires acondicionados en la fachada
    const nAc = Math.floor(faceLen / 5);
    for (let i = 0; i < nAc; i++) {
      if (b.rand() < 0.4) continue;
      const lx = -faceLen / 2 + 2 + b.rand() * (faceLen - 4);
      const ly = 4.2 + Math.floor(b.rand() * Math.max(1, (o.h - 5) / 3)) * 3;
      if (ly > o.h - 1.2) continue;
      b.inst('ac', F.clone().multiply(trs(lx, ly, 0)));
    }
    const pipeX = faceLen / 2 - 0.5;
    const pipe = cylinder(0.08, 0.08, o.h, 8);
    b.add('metal', withFacePaint(pipe, pipeX, o.h / 2), F.clone().multiply(trs(pipeX, o.h / 2, 0.12)), COLORS.lilacDark);
    // azotea
    if (o.roof !== false) {
      const R = trs(o.x, o.h + 0.32, o.z);
      if (b.rand() < 0.7) {
        const tank = lathe([[0.001, 0], [0.9, 0], [0.9, 1.6], [0.95, 1.7], [0.001, 2.1]], 16);
        b.add('metal', tank, R.clone().multiply(trs((b.rand() - 0.5) * (o.w - 3), 0.8, (b.rand() - 0.5) * (o.d - 3))), COLORS.cream);
        for (const [lx, lz] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) {
          b.add('darkMetal', cylinder(0.05, 0.05, 0.8, 6), R.clone().multiply(trs(lx, 0.4, lz)), COLORS.charcoal);
        }
      }
      const boxes = 1 + Math.floor(b.rand() * 3);
      for (let i = 0; i < boxes; i++) {
        const bw = 1 + b.rand() * 1.4;
        const bx = bevelBox(bw, 0.8 + b.rand() * 0.6, 1 + b.rand(), { bevel: 0.06 });
        b.add('plastic', bx, R.clone().multiply(trs((b.rand() - 0.5) * (o.w - 2), 0.4, (b.rand() - 0.5) * (o.d - 2))), 0xe7e2ec);
      }
      if (b.rand() < 0.5) {
        const ant = cylinder(0.03, 0.05, 3.5, 6);
        b.add('darkMetal', ant, R.clone().multiply(trs(o.w * 0.3, 1.75, -o.d * 0.3)), COLORS.charcoal);
        b.add('glow', sphere(0.09, 8, 6), R.clone().multiply(trs(o.w * 0.3, 3.55, -o.d * 0.3)), 0xff8a9a);
      }
    }
  });
  return s;
}

/** Kiosco pequeño con techo volado, ventanilla y cartel. */
export function kiosk(b, o) {
  const s = b.solid({ x: o.x, y: 1.5, z: o.z, w: o.w || 3, h: 3, d: o.d || 3.2, rot: o.rot || 0, floor: false, walkable: false, paintable: true, tag: 'kiosk' });
  b.later(() => {
    const pm = b.pm(s);
    const M = b.solidMatrix(s);
    const w = o.w || 3;
    const d = o.d || 3.2;
    b.add('plastic', bevelBox(w, 3, d, { bevel: 0.1, uvScale: 2, paintMap: pm }), M, o.color || COLORS.mint);
    b.add('concrete', bevelBox(w + 0.9, 0.22, d + 0.9, { bevel: 0.07, uvScale: 4 }), M.clone().multiply(trs(0, 1.62, 0)), COLORS.cream);
    // ventanilla con luz interior
    b.add('glass', bevelBox(0.08, 1.0, d * 0.6, { bevel: 0.02 }), M.clone().multiply(trs(-w / 2 - 0.02, 0.2, 0)), 0x4a4668);
    b.add('glow', bevelBox(0.05, 0.08, d * 0.55, { bevel: 0.01 }), M.clone().multiply(trs(-w / 2 - 0.06, 0.66, 0)), 0xffd9a0);
    b.add('metal', bevelBox(0.5, 0.08, d * 0.7, { bevel: 0.02 }), M.clone().multiply(trs(-w / 2 - 0.2, -0.35, 0)), COLORS.charcoal);
    if (o.sign) {
      const sq = signQuad(b, o.sign, 2.6);
      b.add('neon', sq.geo, M.clone().multiply(trs(-w / 2 - 0.47, 2.15, 0, 0, -Math.PI / 2, 0)), 0xffffff);
    }
  });
  b.footprint(o.x, o.z, (o.w || 3) + 0.8, (o.d || 3.2) + 0.8, o.rot || 0, 0.5);
  return s;
}

/** Food truck aparcado (cobertura). */
export function foodTruck(b, o) {
  const rot = o.rot || 0;
  const s = b.solid({ x: o.x, y: 1.35, z: o.z, w: 2.3, h: 2.7, d: 5.2, rot, floor: false, walkable: false, paintable: true, tag: 'truck' });
  b.later(() => {
    const pm = b.pm(s);
    const M = b.solidMatrix(s);
    const at = (x, y, z, rx = 0, ry = 0, rz = 0) => M.clone().multiply(trs(x, y, z, rx, ry, rz));
    b.add('plastic', bevelBox(2.3, 2.1, 3.8, { bevel: 0.22, uvScale: 2, paintMap: (f, x, y, z) => pm && pm(f, x, y + 0.2, z - 0.55) }), at(0, 0.2, -0.55), o.color || COLORS.pink);
    b.add('plastic', bevelBox(2.2, 1.5, 1.4, { bevel: 0.25, uvScale: 2, paintMap: (f, x, y, z) => pm && pm(f, x, y - 0.1, z + 1.95) }), at(0, -0.1, 1.95), o.color || COLORS.pink);
    b.add('glass', bevelBox(2.0, 0.7, 0.1, { bevel: 0.05 }), at(0, 0.25, 2.66, -0.2, 0, 0), 0x3f3a5a);
    b.add('glass', bevelBox(0.1, 0.6, 1.0, { bevel: 0.03 }), at(1.11, 0.2, 1.9), 0x3f3a5a);
    b.add('glass', bevelBox(0.1, 0.6, 1.0, { bevel: 0.03 }), at(-1.11, 0.2, 1.9), 0x3f3a5a);
    // escotilla de venta abierta
    b.add('darkMetal', bevelBox(0.1, 0.9, 2.4, { bevel: 0.02 }), at(-1.16, 0.45, -0.7), 0x2f2a3a);
    b.add('glow', bevelBox(0.05, 0.1, 2.2, { bevel: 0.01 }), at(-1.2, 0.85, -0.7), 0xffd9a0);
    b.add('plastic', bevelBox(0.9, 0.06, 2.6, { bevel: 0.02 }), at(-1.55, 1.12, -0.7, 0, 0, -0.35), COLORS.cream);
    b.add('metal', bevelBox(0.45, 0.06, 2.4, { bevel: 0.02 }), at(-1.35, -0.05, -0.7), COLORS.cream);
    // ruedas
    for (const sz of [-1.6, 1.7]) {
      for (const sx of [-1, 1]) {
        b.add('rubber', torus(0.3, 0.14, 8, 16), at(sx * 1.05, -1.02, sz, 0, Math.PI / 2, 0), 0x2f2b3a);
        b.add('darkMetal', cylinder(0.18, 0.18, 0.2, 10), at(sx * 1.05, -1.02, sz, 0, 0, Math.PI / 2), 0xb6afc4);
      }
    }
    // cartel superior
    const sq = signQuad(b, o.sign || 'noodles', 2.6);
    b.add('neon', sq.geo, at(-1.2, 1.55, -0.6, 0, -Math.PI / 2, 0), 0xffffff);
    b.add('glow', sphere(0.12, 8, 6), at(0.6, 1.32, 1.9), 0xfff0c0);
  });
  b.footprint(o.x, o.z, 2.8, 5.8, rot, 0.55);
  return s;
}

/** Mercado cubierto: 4 pilares + tejado + guirnalda de luces. */
export function canopy(b, o) {
  const w = o.w || 9;
  const d = o.d || 9;
  const h = o.h || 4.2;
  const pillars = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = o.x + sx * (w / 2 - 0.4);
      const pz = o.z + sz * (d / 2 - 0.4);
      pillars.push([px, pz]);
      b.solid({ x: px, y: h / 2, z: pz, w: 0.5, h, d: 0.5, floor: false, walkable: false, paintable: true, tag: 'pillar' });
    }
  }
  const roof = b.solid({ x: o.x, y: h + 0.15, z: o.z, w: w + 1, h: 0.3, d: d + 1, floor: false, walkable: false, paintable: false, blocksProjectiles: true, tag: 'roof' });
  b.later(() => {
    for (const [px, pz] of pillars) {
      b.add('metal', bevelBox(0.5, h, 0.5, { bevel: 0.08 }), trs(px, h / 2, pz), o.pillar || COLORS.lilac);
      b.add('concrete', bevelBox(0.8, 0.3, 0.8, { bevel: 0.06 }), trs(px, 0.15, pz), COLORS.creamDark);
    }
    b.add('metal', bevelBox(w + 1, 0.3, d + 1, { bevel: 0.1, uvScale: 3 }), trs(o.x, h + 0.15, o.z), o.roofColor || COLORS.cream);
    b.add('metal', bevelBox(w + 1.2, 0.12, d + 1.2, { bevel: 0.04 }), trs(o.x, h - 0.02, o.z), COLORS.mintDark);
    // guirnalda
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = o.x - w / 2 + 0.4 + t * (w - 0.8);
      const sag = Math.sin(t * Math.PI) * 0.45;
      b.add('glow', sphere(0.07, 8, 6), trs(x, h - 0.35 - sag, o.z), i % 3 === 0 ? 0xffc9e0 : i % 3 === 1 ? 0xfff0b8 : 0xb8fff0);
      b.add('glow', sphere(0.07, 8, 6), trs(o.x, h - 0.35 - sag, o.z - d / 2 + 0.4 + t * (d - 0.8)), i % 2 ? 0xfff0b8 : 0xc9f0ff);
    }
  });
  b.footprint(o.x, o.z, w + 1.4, d + 1.4, 0, 0.25);
  return roof;
}

/** Sede de equipo tras la base: fachada pintable, estandartes y emblema. */
export function teamHQ(b, o) {
  const team = o.team;
  const main = team === 0 ? COLORS.team[0].main : COLORS.team[1].main;
  const accent = team === 0 ? COLORS.team[0].accent : COLORS.team[1].accent;
  const front = o.front; // '+z' (base sur mira al norte) o '-z'
  const s = building(b, {
    x: o.x,
    z: o.z,
    w: o.w,
    d: o.d,
    h: o.h,
    mat: 'buildingC',
    color: 0xf4efe8,
    front,
    roof: true,
    trim: COLORS.lilac
  });
  b.later(() => {
    const faceRot = front === '+z' ? 0 : Math.PI;
    const F = trs(o.x, 0, o.z, 0, faceRot, 0).multiply(trs(0, 0, o.d / 2));
    // estandartes verticales de equipo
    for (const sx of [-1, 1]) {
      for (const k of [0.28, 0.42]) {
        const bx = sx * o.w * k;
        b.add('plastic', bevelBox(1.6, 5.2, 0.12, { bevel: 0.05 }), F.clone().multiply(trs(bx, o.h - 3.4, 0.2)), main);
        b.add('plastic', bevelBox(1.6, 0.5, 0.14, { bevel: 0.05 }), F.clone().multiply(trs(bx, o.h - 6.0, 0.22)), accent);
        b.add('darkMetal', cylinder(0.05, 0.05, 2.0, 6), F.clone().multiply(trs(bx, o.h - 0.75, 0.26, 0, 0, Math.PI / 2)), COLORS.charcoal);
      }
    }
    // emblema
    const sq = signQuad(b, team === 0 ? 'teamOrange' : 'teamBlue', 4.4);
    b.add('neon', sq.geo, F.clone().multiply(trs(0, o.h - 3.2, 0.25)), 0xffffff);
    // portón
    b.add('darkMetal', bevelBox(7, 4.6, 0.3, { bevel: 0.08 }), F.clone().multiply(trs(0, 2.3, 0.1)), 0x4f4a63);
    for (let i = 0; i < 6; i++) {
      b.add('glow', bevelBox(6.6, 0.06, 0.05, { bevel: 0.01 }), F.clone().multiply(trs(0, 0.6 + i * 0.7, 0.28)), i % 2 ? accent : main);
    }
    // focos
    for (const sx of [-1, 1]) {
      b.add('darkMetal', bevelBox(0.5, 0.3, 0.6, { bevel: 0.05 }), F.clone().multiply(trs(sx * 5, 5.6, 0.4, -0.5, 0, 0)), COLORS.charcoal);
      b.add('glow', bevelBox(0.4, 0.05, 0.4, { bevel: 0.01 }), F.clone().multiply(trs(sx * 5, 5.45, 0.55, -0.5, 0, 0)), 0xfff2d8);
    }
  });
  return s;
}

/** Bloque de ciudad de fondo (sin colisión ni pintura). */
export function cityBlock(b, x, z, w, d, h, mat, color) {
  b.later(() => {
    const body = bevelBox(w, h, d, { bevel: 0.2, uvScale: 6, uvOffset: { x: x * 0.3 + z * 0.7, y: 0 } });
    b.add(mat, body, trs(x, h / 2, z), color);
    b.add('concrete', bevelBox(w + 0.4, 0.5, d + 0.4, { bevel: 0.1, uvScale: 4 }), trs(x, h + 0.2, z), COLORS.creamDark);
    if (b.rand() < 0.5) {
      b.add('plastic', bevelBox(w * 0.4, 1.6, d * 0.4, { bevel: 0.1 }), trs(x + w * 0.15, h + 1.2, z - d * 0.1), 0xe2dce8);
    }
    if (h > 24 && b.rand() < 0.7) {
      b.add('darkMetal', cylinder(0.08, 0.12, 6, 6), trs(x, h + 3.4, z), COLORS.charcoal);
      b.add('glow', sphere(0.2, 8, 6), trs(x, h + 6.5, z), 0xff8a9a);
    }
  });
}
