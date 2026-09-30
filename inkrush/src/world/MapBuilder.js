// Builds the arena "Distrito Voltio": colliders, paintable faces, merged
// render geometry and non-paintable decoration.
import * as THREE from 'three';
import { BoxCollider, RampCollider } from './Colliders.js';
import { CollisionWorld } from './CollisionWorld.js';
import { TEAM } from '../core/config.js';

export const ARENA = { minX: -36, maxX: 36, minZ: -50, maxZ: 50 };

const PAL = {
  floor: 0xd2d6e0,
  wall: 0x4d5170,
  violet: 0x8b7ec8,
  teal: 0x5cae9f,
  cream: 0xeae3d2,
  slate: 0x8a92aa,
  plat: 0xa9b0c4,
  ramp: 0xc8cbd8,
  cover: 0x6f7896,
  plaza: 0xb7a9d9,
};

function faceFrom(O, U, V, W, H, color, poly = null) {
  const N = new THREE.Vector3().crossVectors(U, V).normalize();
  return { O, U, V, N, W, H, poly, color: new THREE.Color(color), countable: N.y > 0.7 };
}

export class MapBuilder {
  constructor() {
    this.world = new CollisionWorld({ minX: -40, maxX: 40, minZ: -54, maxZ: 54 });
    this.faces = [];
    this.decor = [];
    this.spawns = { [TEAM.ORANGE]: [], [TEAM.BLUE]: [] };
    this.structures = []; // for minimap/nav reference
  }

  // ---------- primitives ----------
  box(x0, x1, y0, y1, z0, z1, color, faces = 'all') {
    const min = new THREE.Vector3(x0, y0, z0), max = new THREE.Vector3(x1, y1, z1);
    this.world.add(new BoxCollider(min, max));
    const want = (k) => faces === 'all' ? k !== '-y' : faces.includes(k);
    const W = x1 - x0, H = y1 - y0, D = z1 - z0;
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    if (want('+y')) this.faces.push(faceFrom(v(x0, y1, z1), v(1, 0, 0), v(0, 0, -1), W, D, color));
    if (want('+x')) this.faces.push(faceFrom(v(x1, y0, z1), v(0, 0, -1), v(0, 1, 0), D, H, color));
    if (want('-x')) this.faces.push(faceFrom(v(x0, y0, z0), v(0, 0, 1), v(0, 1, 0), D, H, color));
    if (want('+z')) this.faces.push(faceFrom(v(x0, y0, z1), v(1, 0, 0), v(0, 1, 0), W, H, color));
    if (want('-z')) this.faces.push(faceFrom(v(x1, y0, z0), v(-1, 0, 0), v(0, 1, 0), W, H, color));
  }

  // Ramp rising towards dir. dir: '+x','-x','+z','-z'
  ramp(cx, cz, dir, length, width, baseY, yLow, yHigh, color) {
    const d = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[dir];
    const f = new THREE.Vector3(d[0], 0, d[1]);
    const s = new THREE.Vector3(-f.z, 0, f.x);
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Vector3(cx, 0, cz);
    this.world.add(new RampCollider(c, f, length, width, baseY, yLow, yHigh));
    const P = (lx, y, lz) => new THREE.Vector3().copy(c).addScaledVector(f, lx).addScaledVector(s, lz).setY(y);
    const L2 = length / 2, W2 = width / 2;
    // Top slope
    const O = P(-L2, yLow, W2);
    const U = new THREE.Vector3().copy(f).multiplyScalar(length).addScaledVector(up, yHigh - yLow);
    const slopeLen = U.length();
    U.normalize();
    this.faces.push(faceFrom(O, U, s.clone().negate(), slopeLen, width, color));
    // Sides (trapezoids)
    const hSide = yHigh - baseY;
    const sideA = faceFrom(P(-L2, baseY, W2), f.clone(), up.clone(), length, hSide, color,
      [[0, 0], [length, 0], [length, hSide], [0, yLow - baseY]]);
    this.faces.push(sideA);
    const sideB = faceFrom(P(L2, baseY, -W2), f.clone().negate(), up.clone(), length, hSide, color,
      [[0, 0], [length, 0], [length, yLow - baseY], [0, hSide]]);
    this.faces.push(sideB);
    // High-end back face
    this.faces.push(faceFrom(P(L2, baseY, W2), s.clone().negate(), up.clone(), width, hSide, color));
    if (yLow - baseY > 0.05) this.faces.push(faceFrom(P(-L2, baseY, -W2), s.clone(), up.clone(), width, yLow - baseY, color));
  }

  // Adds a piece and its 180° point-mirrored copy (fair symmetric map).
  boxM(x0, x1, y0, y1, z0, z1, color) {
    this.box(x0, x1, y0, y1, z0, z1, color);
    this.box(-x1, -x0, y0, y1, -z1, -z0, color);
  }

  rampM(cx, cz, dir, length, width, baseY, yLow, yHigh, color) {
    this.ramp(cx, cz, dir, length, width, baseY, yLow, yHigh, color);
    const inv = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' }[dir];
    this.ramp(-cx, -cz, inv, length, width, baseY, yLow, yHigh, color);
  }

  // ---------- layout ----------
  build() {
    // Ground and perimeter
    this.box(-38, 38, -1, 0, -52, 52, PAL.floor, ['+y']);
    this.box(-38, -36, 0, 5, -52, 52, PAL.wall, ['+x']);
    this.box(36, 38, 0, 5, -52, 52, PAL.wall, ['-x']);
    this.box(-36, 36, 0, 5, 50, 52, PAL.wall, ['-z']);
    this.box(-36, 36, 0, 5, -52, -50, PAL.wall, ['+z']);

    // Spawn guards
    this.boxM(-13, -5, 0, 2.2, 38.5, 39.5, PAL.cover);
    this.boxM(5, 13, 0, 2.2, 38.5, 39.5, PAL.cover);
    this.boxM(-15.5, -14.5, 0, 2.2, 36, 44, PAL.cover);
    this.boxM(14.5, 15.5, 0, 2.2, 36, 44, PAL.cover);

    // Home zone: tall building with a side ramp to its roof
    this.boxM(-34, -22, 0, 4, 18, 30, PAL.violet);
    this.rampM(-20.5, 24, '-z', 12, 3, 0, 0, 4, PAL.ramp);
    // Containers
    this.boxM(18, 24.5, 0, 2.6, 26, 28.6, PAL.cream);
    this.boxM(27, 29.6, 0, 2.6, 16, 22.5, PAL.slate);
    this.boxM(30.5, 33.1, 0, 2.6, 28, 34.5, PAL.teal);
    // Home sniper platform with ramps and parapets
    this.boxM(-6, 6, 0, 2, 22, 28, PAL.plat);
    this.rampM(-9, 25, '+x', 6, 6, 0, 0, 2, PAL.ramp);
    this.rampM(9, 25, '-x', 6, 6, 0, 0, 2, PAL.ramp);
    this.boxM(-5, -1.2, 2, 2.9, 22, 22.6, PAL.cover);
    this.boxM(1.2, 5, 2, 2.9, 22, 22.6, PAL.cover);
    // Low cover walls
    this.boxM(-15, -11, 0, 1.2, 32.5, 33.5, PAL.cover);
    this.boxM(11, 15, 0, 1.2, 32.5, 33.5, PAL.cover);

    // Mid zone
    this.boxM(-34, -26, 0, 3.2, 4, 12, PAL.teal);          // alley block (2m alley by the wall)
    this.boxM(-19, -15, 0, 3.4, 8, 16, PAL.violet);        // arcade block
    this.boxM(-31, -28.4, 0, 2.6, -3, 2.5, PAL.cream);     // container
    this.boxM(22, 34, 0, 3, 4, 12, PAL.plat);               // lookout platform
    this.rampM(18.5, 8, '+x', 7, 4, 0, 0, 3, PAL.ramp);
    this.boxM(14, 16.6, 0, 2.6, 14, 20.5, PAL.slate);       // container
    this.boxM(-14, -10.5, 0, 2, -1.5, 1.5, PAL.cover);      // center flank cover
    this.boxM(6, 9, 0, 1.2, 15, 16, PAL.cover);               // low block
    this.boxM(-24, -20, 0, 1.2, 13.5, 14.5, PAL.cover);

    // Center plaza (point-symmetric by construction)
    this.box(-7, 7, 0, 1.5, -7, 7, PAL.plaza);
    this.rampM(0, 10, '-z', 6, 5, 0, 0, 1.5, PAL.ramp);
    this.box(-1.5, 1.5, 1.5, 4.5, -1.5, 1.5, PAL.violet);
    this.boxM(-5.5, -4.5, 1.5, 2.6, 1.5, 5, PAL.cover);

    // Spawns
    for (let i = 0; i < 4; i++) {
      const x = -4.5 + i * 3;
      this.spawns[TEAM.ORANGE].push(new THREE.Vector3(x, 0, 45));
      this.spawns[TEAM.BLUE].push(new THREE.Vector3(-x, 0, -45));
    }
    return this;
  }

  // Build a single merged mesh for all paintable faces. Requires faces packed
  // into the paint atlas (face.rect + atlas density).
  buildMesh(paint, material) {
    let triCount = 0;
    for (const f of this.faces) triCount += f.poly ? f.poly.length - 2 : 2;
    const pos = new Float32Array(triCount * 9);
    const nor = new Float32Array(triCount * 9);
    const uv = new Float32Array(triCount * 6);
    const puv = new Float32Array(triCount * 6);
    const col = new Float32Array(triCount * 9);
    let vi = 0;
    const tmp = new THREE.Vector3();
    const S = paint.size, dens = paint.density;
    const detail = 1 / 2.5;
    for (const f of this.faces) {
      const poly = f.poly || [[0, 0], [f.W, 0], [f.W, f.H], [0, f.H]];
      const emit = (p) => {
        tmp.copy(f.O).addScaledVector(f.U, p[0]).addScaledVector(f.V, p[1]);
        pos[vi * 3] = tmp.x; pos[vi * 3 + 1] = tmp.y; pos[vi * 3 + 2] = tmp.z;
        nor[vi * 3] = f.N.x; nor[vi * 3 + 1] = f.N.y; nor[vi * 3 + 2] = f.N.z;
        uv[vi * 2] = p[0] * detail; uv[vi * 2 + 1] = p[1] * detail;
        puv[vi * 2] = (f.rect.x + p[0] * dens) / S;
        puv[vi * 2 + 1] = (f.rect.y + p[1] * dens) / S;
        // Subtle ambient-occlusion-ish darkening near the ground on walls
        const ao = f.countable ? 1 : THREE.MathUtils.clamp(0.72 + tmp.y * 0.12, 0.72, 1);
        col[vi * 3] = f.color.r * ao; col[vi * 3 + 1] = f.color.g * ao; col[vi * 3 + 2] = f.color.b * ao;
        vi++;
      };
      for (let i = 1; i < poly.length - 1; i++) {
        emit(poly[0]); emit(poly[i]); emit(poly[i + 1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('paintUv', new THREE.BufferAttribute(puv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'arena';
    return mesh;
  }
}
