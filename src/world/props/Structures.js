import * as THREE from 'three';
import { bevelBox, rampGeometry, cylinder, sphere, trs, prep } from '../GeometryKit.js';
import { COLORS } from '../../config.js';

// ─────────────────────────────────────────────────────────────
//  Structures · piezas de hormigón y metal que forman el nivel.
//  Cada función crea el sólido de colisión (y sus caras de pintura) y
//  programa la geometría visual para después de cerrar el atlas.
// ─────────────────────────────────────────────────────────────

/** Bloque de hormigón (plataforma, muro, pedestal). */
export function concreteBlock(b, o) {
  const s = b.solid({
    x: o.x,
    y: o.y0 + o.h / 2,
    z: o.z,
    w: o.w,
    h: o.h,
    d: o.d,
    rot: o.rot || 0,
    floor: o.floor !== undefined ? o.floor : true,
    paintable: o.paintable !== undefined ? o.paintable : true,
    paintMask: o.paintMask,
    tag: o.tag || 'block'
  });
  const color = o.color !== undefined ? o.color : COLORS.cream;
  const trim = o.trim;
  b.later(() => {
    const pm = b.pm(s);
    const M = b.solidMatrix(s);
    const geo = bevelBox(o.w, o.h, o.d, { bevel: o.bevel || 0.09, uvScale: 4, uvOffset: { x: o.x * 0.37, y: 0 }, paintMap: pm });
    b.add(o.mat || 'concrete', geo, M, color);
    if (trim !== undefined) {
      // banda de color bajo la arista superior
      const th = o.trimHeight || 0.28;
      const band = bevelBox(o.w + 0.06, th, o.d + 0.06, {
        bevel: 0.04,
        uvScale: 4,
        paintMap: (f, x, y, z) => pm && pm(f, x, y + (o.h / 2 - th / 2 - 0.12), z)
      });
      b.add('concrete', band, M.clone().multiply(trs(0, o.h / 2 - th / 2 - 0.12, 0)), trim);
    }
    if (o.plinth) {
      const ph = 0.22;
      const pl = bevelBox(o.w + 0.1, ph, o.d + 0.1, {
        bevel: 0.05,
        uvScale: 4,
        paintMap: (f, x, y, z) => pm && pm(f, x, y - (o.h / 2 - ph / 2), z)
      });
      b.add('concrete', pl, M.clone().multiply(trs(0, -o.h / 2 + ph / 2, 0)), o.plinth);
    }
  });
  if (o.ao !== false) b.footprint(o.x, o.z, o.w, o.d, o.rot || 0, o.aoStrength || 0.5);
  return s;
}

/** Rampa (sube a lo largo de +Z local → rot define la dirección de subida). */
export function ramp(b, o) {
  const bottom = o.bottom || 0;
  const hMax = Math.max(o.yLow, o.yHigh) - bottom;
  const s = b.solid({
    type: 'ramp',
    x: o.x,
    y: bottom + hMax / 2,
    z: o.z,
    w: o.w,
    h: hMax,
    d: o.d,
    rot: o.rot || 0,
    yLow: o.yLow,
    yHigh: o.yHigh,
    floor: true,
    paintable: true,
    tag: 'ramp'
  });
  const color = o.color !== undefined ? o.color : COLORS.cream;
  b.later(() => {
    const pm = b.pm(s);
    const M = b.solidMatrix(s);
    const geo = rampGeometry(o.w, o.yLow - bottom, o.yHigh - bottom, o.d, { bevel: 0.1, uvScale: 4, paintMap: pm });
    b.add('concrete', geo, M, color);
    // bordillos laterales inclinados
    const len = Math.hypot(o.d, o.yHigh - o.yLow);
    const ang = Math.atan2(o.yHigh - o.yLow, o.d);
    for (const sx of [-1, 1]) {
      const curb = bevelBox(0.22, 0.2, len, { bevel: 0.05, uvScale: 2 });
      const midY = (o.yLow + o.yHigh) / 2 - (bottom + hMax / 2) + 0.08;
      b.add('metal', curb, M.clone().multiply(trs(sx * (o.w / 2 - 0.11), midY, 0, -ang, 0, 0)), o.curb || COLORS.lilacDark);
    }
  });
  // franjas antideslizantes en el overlay del suelo
  b.markRamp(o.x, o.z, o.w, o.d, o.rot || 0);
  return s;
}

const _railPost = () => prep(new THREE.CylinderGeometry(0.045, 0.05, 1, 8, 1));
let POST = null;

/** Barandilla metálica entre dos puntos a altura y. */
export function railing(b, x0, z0, x1, z1, y, opts = {}) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.2) return;
  const rot = Math.atan2(dx, dz);
  const h = opts.height || 1.0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  // colisión: fina, bloquea el paso pero no los proyectiles ni la cámara
  b.solid({
    x: cx,
    y: y + h / 2,
    z: cz,
    w: 0.14,
    h,
    d: len,
    rot,
    floor: false,
    walkable: false,
    paintable: false,
    blocksProjectiles: false,
    blocksCamera: false,
    tag: 'railing'
  });
  b.later(() => {
    if (!POST) POST = _railPost();
    const n = Math.max(2, Math.round(len / 1.6) + 1);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const px = x0 + dx * t;
      const pz = z0 + dz * t;
      b.add('darkMetal', POST, trs(px, y + h / 2, pz, 0, 0, 0, 1, h, 1), opts.color || COLORS.charcoal);
    }
    const M = trs(cx, y, cz, 0, rot, 0);
    const top = cylinder(0.055, 0.055, len, 10);
    b.add('darkMetal', top, M.clone().multiply(trs(0, h, 0, Math.PI / 2, 0, 0)), opts.color || COLORS.charcoal);
    const mid = cylinder(0.03, 0.03, len, 8);
    b.add('darkMetal', mid, M.clone().multiply(trs(0, h * 0.5, 0, Math.PI / 2, 0, 0)), opts.color || COLORS.charcoal);
    if (opts.kick !== false) {
      const kick = bevelBox(0.05, 0.14, len, { bevel: 0.015 });
      b.add('metal', kick, M.clone().multiply(trs(0, 0.07, 0)), opts.kickColor || COLORS.yellow);
    }
  });
}

/** Barrera tipo "jersey" con perfil extruido y biselado. */
let JERSEY = null;
function jerseyGeometry(len) {
  const shape = new THREE.Shape();
  const w = 0.62;
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, 0.12);
  shape.lineTo(0.2, 0.34);
  shape.lineTo(0.12, 1.0);
  shape.lineTo(-0.12, 1.0);
  shape.lineTo(-0.2, 0.34);
  shape.lineTo(-w / 2, 0.12);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: len - 0.1,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.035,
    bevelSegments: 2,
    curveSegments: 4
  });
  g.translate(0, 0, -(len - 0.1) / 2);
  g.computeVertexNormals();
  return g;
}

export function jersey(b, x, z, rot, color, len = 3.2) {
  const s = b.solid({ x, y: 0.52, z, w: 0.66, h: 1.04, d: len, rot, floor: false, paintable: true, tag: 'barrier' });
  b.later(() => {
    if (!JERSEY) JERSEY = jerseyGeometry(len);
    const pm = b.pm(s);
    const g = prep(JERSEY.clone(), {
      uvScale: 2,
      paintMap: (f, lx, ly, lz) => pm && pm(f, lx, ly - 0.52, lz)
    });
    b.add('plastic', g, trs(x, 0, z, 0, rot, 0), color || COLORS.cream);
    // franjas reflectantes
    for (const sx of [-1, 1]) {
      const stripe = bevelBox(0.02, 0.12, len * 0.8, { bevel: 0.01 });
      const M = trs(x, 0, z, 0, rot, 0).multiply(trs(sx * 0.19, 0.62, 0, 0, 0, sx * 0.12));
      b.add('glow', stripe, M, 0x6a5a88);
    }
  });
  b.footprint(x, z, 0.9, len + 0.3, rot, 0.45);
  return s;
}

/** Jardinera de hormigón con arbustos o árbol. */
export function planter(b, o) {
  const h = o.h || 0.9;
  const s = concreteBlock(b, {
    x: o.x,
    y0: 0 + (o.y0 || 0),
    z: o.z,
    w: o.w,
    h,
    d: o.d,
    rot: o.rot || 0,
    color: o.color || COLORS.creamDark,
    floor: false,
    bevel: 0.07,
    tag: 'planter'
  });
  s.walkable = true;
  const y0 = (o.y0 || 0) + h;
  b.later(() => {
    const M = trs(o.x, y0 - 0.06, o.z, 0, o.rot || 0, 0);
    const soil = bevelBox(o.w - 0.24, 0.1, o.d - 0.24, { bevel: 0.03 });
    b.add('rubber', soil, M, 0x5a4636);
    const rand = b.rand;
    if (o.tree) {
      tree(b, o.x, y0, o.z, o.treeScale || 1);
    } else {
      const count = Math.max(2, Math.round((o.w * o.d) / 0.9));
      for (let i = 0; i < count; i++) {
        const lx = (rand() - 0.5) * (o.w - 0.6);
        const lz = (rand() - 0.5) * (o.d - 0.6);
        const r = 0.28 + rand() * 0.22;
        const bush = sphere(r, 10, 8);
        const c = new THREE.Color(COLORS.mintDark).lerp(new THREE.Color(0x7fb07a), rand() * 0.6);
        b.add('foliage', bush, M.clone().multiply(trs(lx, r * 0.55, lz, 0, rand() * 6, 0, 1, 0.8, 1)), c.getHex());
      }
    }
  });
  return s;
}

/** Árbol estilizado: tronco + copa de esferas agrupadas. */
export function tree(b, x, y, z, k = 1) {
  const rand = b.rand;
  const trunk = cylinder(0.09 * k, 0.14 * k, 1.8 * k, 8);
  b.add('wood', trunk, trs(x, y + 0.9 * k, z), 0x8a6a55);
  const blobs = 5;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rand();
    const r = (0.55 + rand() * 0.3) * k;
    const off = i === 0 ? 0 : 0.5 * k;
    const g = sphere(r, 12, 10);
    const c = new THREE.Color(0x8cc49a).lerp(new THREE.Color(0x5e9c83), rand());
    b.add('foliage', g, trs(x + Math.cos(a) * off, y + (2.1 + rand() * 0.5) * k, z + Math.sin(a) * off), c.getHex());
  }
  b.solid({ x, y: y + 1, z, w: 0.3 * k, h: 2, d: 0.3 * k, floor: false, walkable: false, paintable: false, tag: 'tree' });
}

/** Pasarela de rejilla entre dos puntos a altura y (no pintable). */
export function walkway(b, x0, z0, x1, z1, y, width = 1.6) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(dx, dz);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const s = b.solid({
    x: cx,
    y: y - 0.08,
    z: cz,
    w: width,
    h: 0.16,
    d: len,
    rot,
    floor: false,
    paintable: false,
    groundPaint: false,
    tag: 'walkway'
  });
  b.later(() => {
    const M = trs(cx, y - 0.08, cz, 0, rot, 0);
    const deck = bevelBox(width, 0.12, len, { bevel: 0.03, uvScale: 1 });
    b.add('grating', deck, M, 0xb8bccb);
    for (const sx of [-1, 1]) {
      const beam = bevelBox(0.12, 0.26, len, { bevel: 0.03 });
      b.add('metal', beam, M.clone().multiply(trs(sx * (width / 2 - 0.06), -0.12, 0)), COLORS.lilacDark);
    }
  });
  const ox = Math.cos(rot) * (width / 2);
  const oz = -Math.sin(rot) * (width / 2);
  railing(b, x0 + ox, z0 + oz, x1 + ox, z1 + oz, y, { kick: false });
  railing(b, x0 - ox, z0 - oz, x1 - ox, z1 - oz, y, { kick: false });
  return s;
}

/** Valla perimetral con muro invisible alto detrás. */
export function fenceLine(b, x0, z0, x1, z1, opts = {}) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(dx, dz);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  // muro invisible (bloquea movimiento y proyectiles, no la cámara)
  b.solid({
    x: cx,
    y: 4,
    z: cz,
    w: 0.3,
    h: 8,
    d: len,
    rot,
    floor: false,
    walkable: false,
    paintable: false,
    blocksCamera: false,
    tag: 'boundary'
  });
  const panelLen = 2.6;
  const n = Math.max(1, Math.round(len / panelLen));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const M = trs(x0 + dx * t, 0, z0 + dz * t, 0, rot, 0, 1, 1, len / n / panelLen);
    b.inst('fencePanel', M, opts.color);
  }
}
