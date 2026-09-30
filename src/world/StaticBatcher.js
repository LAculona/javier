import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const STD_ATTRS = ['position', 'normal', 'uv', 'paintUV', 'edge', 'color'];
const _c = new THREE.Color();
const _box = new THREE.Box3();
const _center = new THREE.Vector3();

// Fusiona la geometría estática por material y por bloque espacial (para que
// el frustum culling siga funcionando en la cámara principal y en la sombra).
export class StaticBatcher {
  constructor(chunkSize = 48) {
    this.chunk = chunkSize;
    this.buckets = new Map();
    this.vertexCount = 0;
  }

  add(matKey, geo, matrix, color = 0xffffff, opts = {}) {
    const g = geo.clone();
    g.clearGroups();
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.paintUV) g.setAttribute('paintUV', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(-1), 2));
    if (!g.attributes.edge) g.setAttribute('edge', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    if (!g.attributes.color || opts.overrideColor !== false) {
      _c.set(color);
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = _c.r;
        arr[i * 3 + 1] = _c.g;
        arr[i * 3 + 2] = _c.b;
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    }
    for (const name of Object.keys(g.attributes)) {
      if (!STD_ATTRS.includes(name)) g.deleteAttribute(name);
    }
    if (!g.index) {
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    let key = matKey;
    if (!opts.noChunk) {
      g.computeBoundingBox();
      _box.copy(g.boundingBox).getCenter(_center);
      const cx = Math.floor(_center.x / this.chunk);
      const cz = Math.floor(_center.z / this.chunk);
      key = `${matKey}#${cx},${cz}`;
    } else {
      key = `${matKey}#all`;
    }
    let list = this.buckets.get(key);
    if (!list) {
      list = [];
      this.buckets.set(key, list);
    }
    list.push(g);
    this.vertexCount += n;
  }

  build(materials, shadowPolicy = () => true) {
    const group = new THREE.Group();
    group.name = 'static-world';
    for (const [key, list] of this.buckets) {
      const matKey = key.split('#')[0];
      const mat = materials[matKey];
      if (!mat) throw new Error(`StaticBatcher: material "${matKey}" no existe`);
      const merged = mergeGeometries(list, false);
      if (!merged) throw new Error(`StaticBatcher: no se pudo fusionar "${key}"`);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = key;
      mesh.castShadow = shadowPolicy(matKey);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      for (const g of list) g.dispose();
    }
    this.buckets.clear();
    return group;
  }
}

// Props repetidos: una InstancedMesh por pieza de cada tipo de prop.
export class InstancedProps {
  constructor() {
    this.types = new Map();
  }

  register(key, parts) {
    this.types.set(key, { parts, items: [] });
  }

  has(key) {
    return this.types.has(key);
  }

  place(key, matrix, color) {
    const t = this.types.get(key);
    if (!t) throw new Error(`InstancedProps: tipo "${key}" no registrado`);
    t.items.push({ matrix: matrix.clone(), color: color !== undefined ? new THREE.Color(color) : null });
  }

  build() {
    const group = new THREE.Group();
    group.name = 'instanced-props';
    for (const [key, t] of this.types) {
      if (!t.items.length) continue;
      for (const part of t.parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, t.items.length);
        im.name = `${key}:${part.name || 'part'}`;
        im.castShadow = part.castShadow !== false;
        im.receiveShadow = true;
        const useColor = part.tint !== false && t.items.some((it) => it.color);
        for (let i = 0; i < t.items.length; i++) {
          const it = t.items[i];
          im.setMatrixAt(i, it.matrix);
          if (useColor) im.setColorAt(i, it.color || _c.set(0xffffff));
        }
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        im.frustumCulled = true;
        group.add(im);
      }
    }
    return group;
  }
}
