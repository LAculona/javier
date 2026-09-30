import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bevelBox, cylinder, lathe, torus, tube, sphere, trs, prep } from '../GeometryKit.js';
import { createToonMaterial } from '../../render/ToonMaterial.js';
import { makeCanvas, canvasTexture } from '../../render/TextureFactory.js';
import { applySignUV } from './Signage.js';
import { COLORS } from '../../config.js';

// ─────────────────────────────────────────────────────────────
//  StreetProps · mobiliario urbano instanciado (InstancedMesh por pieza)
// ─────────────────────────────────────────────────────────────

function colored(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return geo;
}

// Fusiona piezas [geo, matrix, color] en una sola geometría con vertex colors
function assemble(parts) {
  const list = parts.map(([g, m, c]) => {
    const gg = g.clone();
    gg.clearGroups();
    if (m) gg.applyMatrix4(m);
    colored(gg, c !== undefined ? c : 0xffffff);
    for (const name of Object.keys(gg.attributes)) {
      if (!['position', 'normal', 'uv', 'paintUV', 'edge', 'color'].includes(name)) gg.deleteAttribute(name);
    }
    if (!gg.attributes.paintUV) prep(gg);
    return gg;
  });
  const merged = mergeGeometries(list, false);
  merged.computeBoundingSphere();
  return merged;
}

function makeChainLinkMaterial() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  for (let i = -128; i < 256; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 128, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(i + 128, 0);
    g.lineTo(i, 128);
    g.stroke();
  }
  const tex = canvasTexture(c, { wrap: THREE.RepeatWrapping });
  return createToonMaterial({
    name: 'chainlink',
    color: 0xa7a3b8,
    map: tex,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.4,
    metalness: 0.6,
    envMapIntensity: 0.8,
    variation: 0,
    paint: 'none'
  });
}

export function registerStreetProps(b) {
  const M = b.materials;
  const chain = makeChainLinkMaterial();
  b.extraMaterials.push(chain);

  // ── valla perimetral (2.6 m de largo en Z local)
  {
    const frame = assemble([
      [cylinder(0.05, 0.05, 2.3, 8), trs(0, 1.15, -1.3), 0x6f6a82],
      [cylinder(0.05, 0.05, 2.3, 8), trs(0, 1.15, 1.3), 0x6f6a82],
      [cylinder(0.035, 0.035, 2.6, 8), trs(0, 2.25, 0, Math.PI / 2, 0, 0), 0x6f6a82],
      [cylinder(0.035, 0.035, 2.6, 8), trs(0, 0.12, 0, Math.PI / 2, 0, 0), 0x6f6a82],
      [bevelBox(0.3, 0.12, 0.3, { bevel: 0.03 }), trs(0, 0.06, -1.3), 0x9b93a8],
      [bevelBox(0.3, 0.12, 0.3, { bevel: 0.03 }), trs(0, 0.06, 1.3), 0x9b93a8]
    ]);
    const mesh = new THREE.PlaneGeometry(2.56, 2.1);
    mesh.rotateY(Math.PI / 2);
    mesh.translate(0, 1.18, 0);
    const uv = mesh.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6.4, uv.getY(i) * 5.2);
    prep(mesh);
    b.instanced.register('fencePanel', [
      { name: 'frame', geo: frame, mat: M.darkMetal, tint: false },
      { name: 'mesh', geo: mesh, mat: chain, tint: false, castShadow: true }
    ]);
  }

  // ── farola futurista
  {
    const pole = lathe(
      [
        [0.2, 0],
        [0.22, 0.12],
        [0.12, 0.2],
        [0.07, 0.5],
        [0.055, 4.2],
        [0.07, 4.45],
        [0.001, 4.5]
      ],
      12
    );
    const arm = tube(
      [
        [0, 4.2, 0],
        [0.4, 4.6, 0],
        [1.1, 4.7, 0]
      ],
      0.045,
      12,
      6
    );
    const head = bevelBox(0.7, 0.12, 0.34, { bevel: 0.05 });
    const body = assemble([
      [pole, null, 0x4f4a63],
      [arm, null, 0x4f4a63],
      [head, trs(1.2, 4.68, 0), 0x4f4a63],
      [bevelBox(0.16, 0.5, 0.16, { bevel: 0.04 }), trs(0, 1.1, 0), 0x9fcfb8]
    ]);
    const light = assemble([[bevelBox(0.56, 0.05, 0.22, { bevel: 0.02 }), trs(1.2, 4.6, 0), 0xffe6b8]]);
    const ring = assemble([[torus(0.16, 0.025, 6, 20), trs(0, 1.1, 0, Math.PI / 2, 0, 0), 0x9ff0ff]]);
    b.instanced.register('lamp', [
      { name: 'body', geo: body, mat: M.darkMetal, tint: false },
      { name: 'light', geo: light, mat: M.glow, tint: false, castShadow: false },
      { name: 'ring', geo: ring, mat: M.glow, tint: false, castShadow: false }
    ]);
  }

  // ── banco
  {
    const slats = [];
    for (let i = 0; i < 4; i++) slats.push([bevelBox(1.9, 0.05, 0.11, { bevel: 0.02 }), trs(0, 0.46, -0.2 + i * 0.13), 0xc9a27e]);
    for (let i = 0; i < 2; i++) slats.push([bevelBox(1.9, 0.11, 0.05, { bevel: 0.02 }), trs(0, 0.66 + i * 0.16, -0.3, -0.18, 0, 0), 0xc9a27e]);
    const wood = assemble(slats);
    const legs = assemble([
      [bevelBox(0.07, 0.46, 0.5, { bevel: 0.02 }), trs(-0.8, 0.23, 0), 0x4f4a63],
      [bevelBox(0.07, 0.46, 0.5, { bevel: 0.02 }), trs(0.8, 0.23, 0), 0x4f4a63],
      [bevelBox(0.07, 0.45, 0.05, { bevel: 0.02 }), trs(-0.8, 0.7, -0.3, -0.18, 0, 0), 0x4f4a63],
      [bevelBox(0.07, 0.45, 0.05, { bevel: 0.02 }), trs(0.8, 0.7, -0.3, -0.18, 0, 0), 0x4f4a63]
    ]);
    b.instanced.register('bench', [
      { name: 'wood', geo: wood, mat: M.wood, tint: false },
      { name: 'legs', geo: legs, mat: M.darkMetal, tint: false }
    ]);
  }

  // ── papelera
  {
    const bodyG = assemble([
      [lathe([[0.001, 0], [0.26, 0], [0.28, 0.05], [0.28, 0.82], [0.3, 0.86], [0.001, 0.86]], 16), null, 0xffffff]
    ]);
    const lid = assemble([
      [lathe([[0.001, 0.86], [0.31, 0.86], [0.31, 0.92], [0.2, 0.98], [0.001, 1.0]], 16), null, 0x4f4a63],
      [bevelBox(0.3, 0.06, 0.08, { bevel: 0.02 }), trs(0, 0.9, 0.29), 0x2f2a3a]
    ]);
    b.instanced.register('bin', [
      { name: 'body', geo: bodyG, mat: M.plastic },
      { name: 'lid', geo: lid, mat: M.darkMetal, tint: false }
    ]);
  }

  // ── cono (colores neutros: nunca naranja de equipo)
  {
    const cone = assemble([
      [lathe([[0.001, 0.72], [0.035, 0.72], [0.17, 0.08], [0.001, 0.08]], 14), null, 0xf6f0e6],
      [lathe([[0.1, 0.46], [0.13, 0.33], [0.155, 0.2], [0.12, 0.33], [0.085, 0.46]], 14), null, 0x9384b3],
      [bevelBox(0.46, 0.08, 0.46, { bevel: 0.03 }), trs(0, 0.04, 0), 0x3f3a50]
    ]);
    b.instanced.register('cone', [{ name: 'cone', geo: cone, mat: M.plastic, tint: false }]);
  }

  // ── bidón
  {
    const drum = assemble([
      [
        lathe(
          [
            [0.001, 0],
            [0.28, 0],
            [0.3, 0.03],
            [0.3, 0.3],
            [0.315, 0.32],
            [0.3, 0.34],
            [0.3, 0.62],
            [0.315, 0.64],
            [0.3, 0.66],
            [0.3, 0.9],
            [0.28, 0.93],
            [0.001, 0.93]
          ],
          18
        ),
        null,
        0xffffff
      ]
    ]);
    const cap = assemble([[cylinder(0.05, 0.05, 0.03, 10), trs(0.14, 0.94, 0.05), 0x3a3548]]);
    b.instanced.register('barrel', [
      { name: 'drum', geo: drum, mat: M.metal },
      { name: 'cap', geo: cap, mat: M.darkMetal, tint: false }
    ]);
  }

  // ── caja de carga pequeña y palé
  {
    const crate = assemble([
      [bevelBox(1.1, 1.0, 1.1, { bevel: 0.05, uvScale: 1 }), trs(0, 0.5, 0), 0xffffff],
      [bevelBox(1.16, 0.12, 1.16, { bevel: 0.03 }), trs(0, 0.06, 0), 0xdddddd],
      [bevelBox(1.16, 0.1, 1.16, { bevel: 0.03 }), trs(0, 0.95, 0), 0xdddddd]
    ]);
    b.instanced.register('crate', [{ name: 'crate', geo: crate, mat: M.wood }]);
    const pal = [];
    for (let i = 0; i < 5; i++) pal.push([bevelBox(1.2, 0.03, 0.16, { bevel: 0.01 }), trs(0, 0.135, -0.5 + i * 0.25), 0xd6b48c]);
    for (let i = 0; i < 3; i++) pal.push([bevelBox(0.12, 0.1, 1.2, { bevel: 0.015 }), trs(-0.5 + i * 0.5, 0.07, 0), 0xb89572]);
    b.instanced.register('pallet', [{ name: 'pallet', geo: assemble(pal), mat: M.wood, tint: false }]);
  }

  // ── bolardo de amarre y defensa de neumático
  {
    const bol = assemble([
      [
        lathe(
          [
            [0.001, 0],
            [0.3, 0],
            [0.3, 0.08],
            [0.18, 0.12],
            [0.14, 0.4],
            [0.22, 0.52],
            [0.24, 0.6],
            [0.001, 0.62]
          ],
          16
        ),
        null,
        0x4b4560
      ]
    ]);
    b.instanced.register('bollard', [{ name: 'bollard', geo: bol, mat: M.darkMetal, tint: false }]);
    const tire = assemble([[torus(0.42, 0.17, 10, 20), trs(0, 0, 0, 0, Math.PI / 2, 0), 0x2f2b3a]]);
    b.instanced.register('fender', [{ name: 'tire', geo: tire, mat: M.rubber, tint: false, castShadow: false }]);
  }

  // ── aire acondicionado de fachada
  {
    const box = assemble([
      [bevelBox(0.9, 0.62, 0.42, { bevel: 0.04 }), trs(0, 0, 0.21), 0xe9e4ea],
      [torus(0.2, 0.025, 6, 18), trs(-0.12, 0, 0.43), 0x7c7590],
      [cylinder(0.04, 0.04, 0.02, 8), trs(-0.12, 0, 0.43, Math.PI / 2, 0, 0), 0x7c7590],
      [bevelBox(0.18, 0.4, 0.02, { bevel: 0.005 }), trs(0.26, 0, 0.43), 0xb6afc4]
    ]);
    b.instanced.register('ac', [{ name: 'ac', geo: box, mat: M.plastic, tint: false }]);
  }

  // ── boca de incendios
  {
    const hyd = assemble([
      [lathe([[0.001, 0], [0.16, 0], [0.16, 0.06], [0.11, 0.1], [0.11, 0.55], [0.14, 0.6], [0.1, 0.72], [0.001, 0.76]], 14), null, 0xc7b8e0],
      [cylinder(0.05, 0.05, 0.36, 8), trs(0, 0.42, 0, 0, 0, Math.PI / 2), 0xa99fc4]
    ]);
    b.instanced.register('hydrant', [{ name: 'hydrant', geo: hyd, mat: M.plastic, tint: false }]);
  }

  // ── máquina expendedora (frontal con atlas de carteles)
  {
    const r = b.signs.rects.vending;
    const front = new THREE.PlaneGeometry(0.86, 1.72);
    applySignUV(front, r);
    front.translate(0, 1.02, 0.43);
    prep(front);
    colored(front, 0xffffff);
    const body = assemble([
      [bevelBox(1.0, 1.95, 0.84, { bevel: 0.06 }), trs(0, 0.975, 0), 0xffffff],
      [bevelBox(1.06, 0.12, 0.9, { bevel: 0.04 }), trs(0, 1.98, 0), 0x3f3a50]
    ]);
    b.instanced.register('vending', [
      { name: 'body', geo: body, mat: M.plastic },
      { name: 'front', geo: front, mat: M.neon, tint: false, castShadow: false }
    ]);
  }

  // ── boya (agua)
  {
    const buoy = assemble([
      [sphere(0.5, 12, 10), trs(0, 0.1, 0, 0, 0, 0, 1, 0.8, 1), 0xf3e6cf],
      [cylinder(0.04, 0.06, 1.1, 8), trs(0, 0.8, 0), 0x4f4a63],
      [sphere(0.1, 8, 6), trs(0, 1.4, 0), 0xffe0a8]
    ]);
    b.instanced.register('buoy', [{ name: 'buoy', geo: buoy, mat: M.plastic, tint: false }]);
  }
}

// ── colocación con colisión ─────────────────────────────────

export function lamp(b, x, z, rot = 0, y = 0) {
  b.inst('lamp', trs(x, y, z, 0, rot, 0));
  b.solid({ x, y: y + 2.2, z, w: 0.3, h: 4.4, d: 0.3, floor: false, walkable: false, paintable: false, tag: 'lamp' });
}

export function bench(b, x, z, rot = 0, y = 0) {
  b.inst('bench', trs(x, y, z, 0, rot, 0));
  b.solid({ x, y: y + 0.25, z, w: 1.9, h: 0.5, d: 0.62, rot, floor: false, paintable: false, tag: 'bench' });
  b.footprint(x, z, 2.2, 0.9, rot, 0.25);
}

export function bin(b, x, z, color = COLORS.mint, y = 0) {
  b.inst('bin', trs(x, y, z, 0, b.rand() * 6, 0), color);
  b.solid({ x, y: y + 0.5, z, w: 0.6, h: 1.0, d: 0.6, floor: false, walkable: false, paintable: false, tag: 'bin' });
}

export function cone(b, x, z, y = 0) {
  b.inst('cone', trs(x, y, z, 0, b.rand() * 6, 0));
}

export function barrel(b, x, z, color, y = 0) {
  const c = color !== undefined ? color : [COLORS.mint, COLORS.lilac, COLORS.cream, 0xa99fc4, COLORS.sand][Math.floor(b.rand() * 5)];
  b.inst('barrel', trs(x, y, z, 0, b.rand() * 6, 0), c);
  b.solid({ x, y: y + 0.47, z, w: 0.62, h: 0.94, d: 0.62, floor: false, paintable: false, tag: 'barrel' });
  b.footprint(x, z, 0.9, 0.9, 0, 0.3);
}

export function crate(b, x, z, rot = 0, y = 0, color = 0xe6cfa6) {
  b.inst('crate', trs(x, y, z, 0, rot, 0), color);
  b.solid({ x, y: y + 0.5, z, w: 1.12, h: 1.0, d: 1.12, rot, floor: false, paintable: false, tag: 'crate' });
  if (y < 0.1) b.footprint(x, z, 1.4, 1.4, rot, 0.35);
}

export function pallet(b, x, z, rot = 0, y = 0) {
  b.inst('pallet', trs(x, y, z, 0, rot, 0));
}

export function vending(b, x, z, rot = 0, color = COLORS.mint) {
  b.inst('vending', trs(x, 0, z, 0, rot, 0), color);
  b.solid({ x, y: 1.0, z, w: 1.0, h: 2.0, d: 0.86, rot, floor: false, walkable: false, paintable: false, tag: 'vending' });
  b.footprint(x, z, 1.3, 1.1, rot, 0.4);
}

export function hydrant(b, x, z) {
  b.inst('hydrant', trs(x, 0, z, 0, b.rand() * 6, 0));
}
