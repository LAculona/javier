import * as THREE from 'three';
import { bevelBox, cylinder, quad, trs } from '../GeometryKit.js';
import { applySignUV } from './Signage.js';

// ─────────────────────────────────────────────────────────────
//  Contenedor marítimo de 20 pies con chapa corrugada, postes de esquina,
//  largueros, cantoneras, puertas con barras de cierre y logo ficticio.
//  Todas las piezas proyectan su UV de pintura sobre las caras del sólido.
// ─────────────────────────────────────────────────────────────

export const CONTAINER = { L: 6.1, W: 2.45, H: 2.6 };

export const CONTAINER_COLORS = [0x9fcfb8, 0xc7b8e0, 0xf3e6cf, 0xe6cfa6, 0xe8b4c6, 0xb9cf9f, 0xa99fc4, 0xd5e6e3];

const LOGOS = ['kroma', 'orbita', 'kroma', 'gruas', 'orbita', 'dripwave'];

function darker(hex, k) {
  return new THREE.Color(hex).multiplyScalar(k).getHex();
}

/**
 * o: { x, z, y0 (base), rot (0 = largo a lo largo de Z), color, logo, doorsOpen }
 */
export function container(b, o) {
  const { L, W, H } = CONTAINER;
  const y0 = o.y0 || 0;
  const s = b.solid({
    x: o.x,
    y: y0 + H / 2,
    z: o.z,
    w: W,
    h: H,
    d: L,
    rot: o.rot || 0,
    floor: o.floor !== undefined ? o.floor : false,
    paintable: true,
    tag: 'container'
  });
  const color = o.color !== undefined ? o.color : CONTAINER_COLORS[Math.floor(b.rand() * CONTAINER_COLORS.length)];
  const logo = o.logo !== undefined ? o.logo : LOGOS[Math.floor(b.rand() * LOGOS.length)];
  const frameCol = darker(color, 0.78);
  b.later(() => {
    const pm = b.pm(s);
    const M = b.solidMatrix(s);
    const at = (x, y, z, rx = 0, ry = 0, rz = 0) => M.clone().multiply(trs(x, y, z, rx, ry, rz));
    const pmOff = (ox, oy, oz) => (f, x, y, z) => pm && pm(f, x + ox, y + oy, z + oz);
    // piezas adosadas a la cara de puertas: siempre se proyectan sobre +Z
    const pmDoor = (ox, oy, oz) => (f, x, y, z) => pm && pm(2, x + ox, y + oy, z + oz);

    // cuerpo corrugado
    const body = bevelBox(W - 0.04, H - 0.12, L - 0.12, { bevel: 0.05, uvScale: 1.25, paintMap: pm });
    b.add('container', body, M, color);

    // postes de esquina
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = sx * (W / 2 - 0.08);
        const pz = sz * (L / 2 - 0.08);
        const post = bevelBox(0.17, H, 0.17, { bevel: 0.03, paintMap: pmOff(px, 0, pz) });
        b.add('metal', post, at(px, 0, pz), frameCol);
        for (const sy of [-1, 1]) {
          const cast = bevelBox(0.2, 0.18, 0.2, { bevel: 0.025 });
          b.add('darkMetal', cast, at(px, sy * (H / 2 - 0.09), pz), 0x4a4458);
        }
      }
    }
    // largueros superiores e inferiores
    for (const sy of [-1, 1]) {
      const y = sy * (H / 2 - 0.07);
      for (const sx of [-1, 1]) {
        const rail = bevelBox(0.13, 0.14, L - 0.3, { bevel: 0.03, paintMap: pmOff(sx * (W / 2 - 0.06), y, 0) });
        b.add('metal', rail, at(sx * (W / 2 - 0.06), y, 0), frameCol);
      }
      for (const sz of [-1, 1]) {
        const rail = bevelBox(W - 0.3, 0.14, 0.13, { bevel: 0.03, paintMap: pmOff(0, y, sz * (L / 2 - 0.06)) });
        b.add('metal', rail, at(0, y, sz * (L / 2 - 0.06)), frameCol);
      }
    }
    // puertas en +Z local
    const doorW = W / 2 - 0.12;
    const doorH = H - 0.34;
    const dz = L / 2 - 0.02;
    for (const sx of [-1, 1]) {
      const cx = sx * (doorW / 2 + 0.03);
      if (o.doorsOpen) {
        const hingeX = sx * (W / 2 - 0.12);
        const ang = sx * 1.75;
        const D = at(hingeX, 0, dz).multiply(trs(0, 0, 0, 0, ang, 0)).multiply(trs(-sx * doorW / 2, 0, 0.03));
        const door = bevelBox(doorW, doorH, 0.06, { bevel: 0.02, uvScale: 1.25 });
        b.add('container', door, D, color);
      } else {
        const door = bevelBox(doorW, doorH, 0.06, { bevel: 0.02, uvScale: 1.25, paintMap: pmDoor(cx, 0, dz) });
        b.add('container', door, at(cx, 0, dz), color);
        // barras de cierre
        for (const bx of [-0.28, 0.28]) {
          const bar = cylinder(0.024, 0.024, doorH + 0.1, 8, {
            paintMap: pmDoor(cx + bx * doorW, 0, dz + 0.07)
          });
          b.add('darkMetal', bar, at(cx + bx * doorW, 0, dz + 0.07), 0x5d5670);
          const handle = bevelBox(0.05, 0.3, 0.05, { bevel: 0.015 });
          b.add('darkMetal', handle, at(cx + bx * doorW + 0.06, -0.1, dz + 0.11, 0, 0, 0.4), 0x5d5670);
        }
      }
    }
    if (o.doorsOpen) {
      // interior oscuro visible
      const inner = bevelBox(W - 0.3, H - 0.4, 0.05, { bevel: 0.01 });
      b.add('rubber', inner, at(0, 0, dz - 0.05), 0x2c2638);
    }
    // logos en ambos laterales
    if (logo && b.signs.rects[logo]) {
      const r = b.signs.rects[logo];
      const lw = Math.min(4.4, L * 0.7);
      const lh = lw / r.aspect;
      for (const sx of [-1, 1]) {
        const g = applySignUV(quad(lw, lh), r);
        const lx = sx * (W / 2 + 0.035);
        const LM = at(lx, 0.1, 0, 0, sx * Math.PI / 2, 0);
        const pmq = (f, x, y, z) => pm && pm(sx > 0 ? 0 : 1, lx, y + 0.1, sx > 0 ? -x : x);
        const gg = withPaint(g, pmq);
        b.add('sign', gg, LM, 0xffffff);
      }
    }
  });
  b.footprint(o.x, o.z, W + 0.4, L + 0.4, o.rot || 0, y0 > 0.1 ? 0 : 0.55);
  return s;
}

// Asigna paintUV a un quad vertical usando coordenadas locales del quad.
function withPaint(g, fn) {
  const p = g.attributes.position;
  const puv = g.attributes.paintUV;
  for (let i = 0; i < p.count; i++) {
    const r = fn(0, p.getX(i), p.getY(i), p.getZ(i));
    if (r) puv.setXY(i, r.x, r.y);
  }
  puv.needsUpdate = true;
  return g;
}
