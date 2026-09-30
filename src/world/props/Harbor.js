import * as THREE from 'three';
import { bevelBox, cylinder, lathe, sphere, trs, prep } from '../GeometryKit.js';
import { CONTAINER_COLORS } from './Containers.js';
import { COLORS } from '../../config.js';

// ─────────────────────────────────────────────────────────────
//  Harbor · decorado portuario fuera de límites: grúas pórtico, terminal
//  lejana con pilas de contenedores, buque, remolcador, faro y boyas.
// ─────────────────────────────────────────────────────────────

/** Grúa pórtico (STS) mirando hacia +X local (pluma sobre el agua en -X). */
export function gantryCrane(b, x, z, rot = 0, scale = 1, color = COLORS.cream) {
  b.later(() => {
    const M = trs(x, 0, z, 0, rot, 0, scale, scale, scale);
    const at = (px, py, pz, rx = 0, ry = 0, rz = 0) => M.clone().multiply(trs(px, py, pz, rx, ry, rz));
    const beam = (w, h, d, px, py, pz, c = color, mat = 'metal') => b.add(mat, bevelBox(w, h, d, { bevel: 0.12, uvScale: 2 }), at(px, py, pz), c);
    const legH = 26;
    // patas
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        beam(1.3, legH, 1.3, sx * 8, legH / 2, sz * 7);
        b.add('darkMetal', bevelBox(2.4, 1.0, 3.4, { bevel: 0.15 }), at(sx * 8, 0.5, sz * 7), 0x4f4a63);
      }
      // travesaños
      beam(1.1, 1.1, 14, sx * 8, legH - 0.5, 0);
      beam(0.9, 0.9, 14, sx * 8, 10, 0);
      // diagonales
      const diag = bevelBox(0.6, 17, 0.6, { bevel: 0.08 });
      b.add('metal', diag, at(sx * 8, 17.5, 0, Math.atan2(14, 15) , 0, 0), color);
    }
    beam(17.3, 1.4, 1.4, 0, legH, -7);
    beam(17.3, 1.4, 1.4, 0, legH, 7);
    // pluma principal (sale hacia -X)
    beam(62, 2.2, 2.6, -14, legH + 3, 0, color);
    beam(18, 1.6, 2.2, 14, legH + 2.8, 0, color);
    // cabeza de A y tirantes
    beam(1.2, 12, 1.2, 4, legH + 9, -2.2);
    beam(1.2, 12, 1.2, 4, legH + 9, 2.2);
    beam(1.4, 1.4, 5.8, 4, legH + 15, 0);
    for (const tx of [-40, -22, 16]) {
      const len = Math.hypot(tx - 4, 12);
      const ang = Math.atan2(12, tx - 4);
      b.add('darkMetal', cylinder(0.12, 0.12, len, 6), at((tx + 4) / 2, legH + 9, 0, 0, 0, ang - Math.PI / 2), 0x5b5570);
    }
    // carro y cabina
    b.add('metal', bevelBox(4, 2.4, 3.4, { bevel: 0.2 }), at(-24, legH + 1.2, 0), COLORS.lilac);
    b.add('glass', bevelBox(2.4, 1.6, 2.6, { bevel: 0.15 }), at(-24, legH - 0.6, 0), 0x4a4668);
    // cables y spreader
    for (const sz of [-0.8, 0.8]) b.add('darkMetal', cylinder(0.05, 0.05, 12, 4), at(-24, legH - 6, sz), 0x3a3548);
    b.add('metal', bevelBox(6.2, 0.6, 2.5, { bevel: 0.1 }), at(-24, legH - 12, 0), COLORS.yellow);
    // sala de máquinas
    b.add('metal', bevelBox(9, 4, 7, { bevel: 0.2, uvScale: 2 }), at(16, legH + 4.4, 0), COLORS.creamDark);
    // luces de aviso
    b.add('glow', sphere(0.35, 8, 6), at(4, legH + 15.8, 0), 0xff7a8a);
    b.add('glow', sphere(0.3, 8, 6), at(-45, legH + 4.3, 0), 0xff7a8a);
    // franjas de peligro en patas
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (let i = 0; i < 3; i++) b.add('metal', bevelBox(1.36, 0.35, 1.36, { bevel: 0.04 }), at(sx * 8, 2 + i * 0.7, sz * 7), i % 2 ? COLORS.charcoal : COLORS.yellow);
      }
    }
  });
}

/** Pila de contenedores simplificados (decorado lejano). */
export function containerStack(b, x, z, cols, rows, levels, rot = 0) {
  b.later(() => {
    const M = trs(x, 0, z, 0, rot, 0);
    const g = bevelBox(2.44, 2.55, 6.05, { bevel: 0.06, uvScale: 1.25 });
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const lv = Math.max(1, levels - Math.floor(b.rand() * 2));
        for (let l = 0; l < lv; l++) {
          const col = CONTAINER_COLORS[Math.floor(b.rand() * CONTAINER_COLORS.length)];
          b.add('container', g, M.clone().multiply(trs(c * 2.6, 1.3 + l * 2.6, r * 6.3)), col);
        }
      }
    }
  });
}

/** Casco de barco a partir de un perfil extruido. */
function hullGeometry(len, beam, depth) {
  const shape = new THREE.Shape();
  const h = beam / 2;
  shape.moveTo(0, -len / 2);
  shape.lineTo(h * 0.85, -len / 2);
  shape.quadraticCurveTo(h, -len / 2 + 2, h, -len / 2 + 6);
  shape.lineTo(h, len / 2 - len * 0.18);
  shape.quadraticCurveTo(h * 0.9, len / 2 - 2, 0, len / 2);
  shape.quadraticCurveTo(-h * 0.9, len / 2 - 2, -h, len / 2 - len * 0.18);
  shape.lineTo(-h, -len / 2 + 6);
  shape.quadraticCurveTo(-h, -len / 2 + 2, -h * 0.85, -len / 2);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.35, bevelSegments: 2, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return prep(g, { uvScale: 4 });
}

/** Buque portacontenedores atracado en la terminal lejana. */
export function cargoShip(b, x, z, rot = 0) {
  b.later(() => {
    const M = trs(x, -3.2, z, 0, rot, 0);
    const at = (px, py, pz, ry = 0) => M.clone().multiply(trs(px, py, pz, 0, ry, 0));
    b.add('metal', hullGeometry(86, 18, 9), at(0, 0, 0), 0x7c6f9c);
    b.add('metal', hullGeometry(86.4, 18.4, 1.2), at(0, 0, 0), COLORS.cream);
    // cubierta
    b.add('metal', bevelBox(16.5, 0.4, 70, { bevel: 0.1 }), at(0, 9.2, 4), 0x9d95b2);
    // castillo de popa
    b.add('metal', bevelBox(14, 9, 8, { bevel: 0.3, uvScale: 2 }), at(0, 13.8, -34), COLORS.cream);
    b.add('metal', bevelBox(17, 1.2, 5, { bevel: 0.2 }), at(0, 18.8, -33), COLORS.cream);
    b.add('glass', bevelBox(14.2, 1.2, 0.3, { bevel: 0.05 }), at(0, 16.8, -29.9), 0x4a4668);
    b.add('metal', bevelBox(2.4, 6, 2.4, { bevel: 0.2 }), at(0, 21, -36), COLORS.lilac);
    b.add('glow', sphere(0.3, 8, 6), at(0, 24.2, -36), 0xff7a8a);
    // contenedores sobre cubierta
    const g = bevelBox(2.44, 2.55, 6.05, { bevel: 0.06, uvScale: 1.25 });
    for (let bay = 0; bay < 9; bay++) {
      for (let c = 0; c < 6; c++) {
        const lv = 1 + Math.floor(b.rand() * 3);
        for (let l = 0; l < lv; l++) {
          const col = CONTAINER_COLORS[Math.floor(b.rand() * CONTAINER_COLORS.length)];
          b.add('container', g, at(-6.4 + c * 2.56, 10.7 + l * 2.6, -24 + bay * 6.5), col);
        }
      }
    }
  });
}

/** Remolcador (dinámico: se devuelve un Group para que se mueva con el oleaje). */
export function tugboat(materials) {
  const group = new THREE.Group();
  const add = (geo, mat, m, color) => {
    const gg = geo.clone();
    gg.applyMatrix4(m);
    const n = gg.attributes.position.count;
    const c = new THREE.Color(color);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    gg.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    const mesh = new THREE.Mesh(gg, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(hullGeometry(11, 4.2, 2.2), materials.metal, trs(0, -1.2, 0), 0x6e9e8a);
  add(hullGeometry(11.2, 4.4, 0.4), materials.metal, trs(0, 0.8, 0), COLORS.cream);
  add(bevelBox(3, 2.2, 3.4, { bevel: 0.2 }), materials.metal, trs(0, 2.2, -0.6), COLORS.cream);
  add(bevelBox(3.2, 0.3, 3.8, { bevel: 0.1 }), materials.metal, trs(0, 3.4, -0.6), COLORS.lilac);
  add(bevelBox(3.05, 0.6, 0.12, { bevel: 0.03 }), materials.glass, trs(0, 2.6, 1.12), 0x4a4668);
  add(cylinder(0.35, 0.4, 1.8, 10), materials.metal, trs(0, 4.2, -1.4), COLORS.lilacDark);
  add(cylinder(0.42, 0.42, 0.25, 10), materials.darkMetal, trs(0, 5.1, -1.4), COLORS.charcoal);
  for (let i = 0; i < 6; i++) {
    add(prep(new THREE.TorusGeometry(0.4, 0.15, 8, 16)), materials.rubber, trs(i % 2 ? 2.2 : -2.2, 0.2, -3 + Math.floor(i / 2) * 2.6, 0, Math.PI / 2, 0), 0x2f2b3a);
  }
  return group;
}

/** Faro sobre espigón. */
export function lighthouse(b, x, z) {
  b.later(() => {
    b.add('concrete', bevelBox(10, 2.2, 10, { bevel: 0.3, uvScale: 4 }), trs(x, -0.6, z), COLORS.concreteDark);
    const body = lathe(
      [
        [2.2, 0],
        [2.0, 4],
        [1.6, 12],
        [1.5, 13],
        [1.9, 13.2],
        [1.9, 13.6],
        [0.001, 13.6]
      ],
      20,
      { uvScale: 2 }
    );
    b.add('plastic', body, trs(x, 0.5, z), 0xfbf5ea);
    for (let i = 0; i < 3; i++) {
      const band = lathe([[2.05 - i * 0.14, 2 + i * 3.6], [1.95 - i * 0.14, 3.6 + i * 3.6]], 20);
      b.add('plastic', band, trs(x, 0.5, z), COLORS.lilac);
    }
    b.add('glass', cylinder(1.1, 1.1, 1.6, 16), trs(x, 14.9, z), 0x9fc3e8);
    b.add('glow', sphere(0.7, 12, 8), trs(x, 14.9, z), 0xfff0c0);
    b.add('metal', lathe([[1.4, 0], [0.001, 1.2]], 16), trs(x, 15.7, z), COLORS.lilacDark);
  });
}
