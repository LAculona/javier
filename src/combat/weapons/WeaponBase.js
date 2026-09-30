import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createToonMaterial } from '../../render/ToonMaterial.js';
import { createLiquidMaterial } from '../../player/CharacterRig.js';
import { prep } from '../../world/GeometryKit.js';
import { COLORS } from '../../config.js';

// ─────────────────────────────────────────────────────────────
//  WeaponBase · utilidades comunes a las armas
//  Los modelos se definen con el cañón hacia +Z y arriba +Y; el holder
//  del arma los orienta en la mano del personaje.
// ─────────────────────────────────────────────────────────────

let WEAPON_MAT = null;
let GLASS_MAT = null;

export function weaponMaterial() {
  if (!WEAPON_MAT) {
    WEAPON_MAT = createToonMaterial({
      name: 'weapon',
      vertexColors: true,
      roughness: 0.34,
      metalness: 0.05,
      envMapIntensity: 0.9,
      rim: 0.45,
      variation: 0.03,
      wear: 0.25,
      wearColor: 0xffffff,
      paint: 'none'
    });
  }
  return WEAPON_MAT;
}

export function glassMaterial() {
  if (!GLASS_MAT) {
    GLASS_MAT = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.05,
      transparent: true,
      opacity: 0.3,
      envMapIntensity: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      depthWrite: false
    });
  }
  return GLASS_MAT;
}

function colorize(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return g;
}

/**
 * Construye el modelo del arma.
 * parts: [[geo, matrix, color], ...] (opacos, se fusionan)
 * canister: { geo (cápsula de radio 0.098 y largo 0.2), matrix } → vidrio + líquido
 */
export function buildWeaponModel(parts, canister, team) {
  const list = parts.map(([geo, m, c]) => {
    const g = geo.clone();
    g.clearGroups();
    if (m) g.applyMatrix4(m);
    colorize(g, c);
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'paintUV', 'edge', 'color'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.paintUV) prep(g);
    if (!g.index) {
      const n = g.attributes.position.count;
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    return g;
  });
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  const group = new THREE.Group();
  const body = new THREE.Mesh(merged, weaponMaterial());
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  let liquidMat = null;
  if (canister) {
    liquidMat = createLiquidMaterial(COLORS.team[team].main);
    const liquid = new THREE.Mesh(new THREE.CapsuleGeometry(0.098, 0.2, 5, 14), liquidMat);
    liquid.matrixAutoUpdate = false;
    liquid.matrix.copy(canister.matrix);
    group.add(liquid);
    const glass = new THREE.Mesh(new THREE.CapsuleGeometry(0.112, 0.21, 5, 16), glassMaterial());
    glass.matrixAutoUpdate = false;
    glass.matrix.copy(canister.matrix);
    glass.renderOrder = 2;
    group.add(glass);
  }
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  group.add(muzzle);
  return { group, muzzle, liquidMat };
}

export class Weapon {
  constructor(cfg, team) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.team = team;
    this.cooldown = 0;
    const m = this.buildModel(team);
    this.model = m.group;
    this.muzzle = m.muzzle;
    this.liquidMat = m.liquidMat;
    // orientación dentro de la mano: cañón (+Z del modelo) → -Y de la mano
    this.holdRotation = new THREE.Euler(Math.PI / 2, 0, 0);
    this.holdOffset = new THREE.Vector3(0, -0.05, 0.03);
    // orientación guardada a la espalda
    this.stowRotation = new THREE.Euler(0.2, Math.PI, -0.75);
    this.stowOffset = new THREE.Vector3(0.05, 0.02, -0.46);
  }

  setInk(k) {
    if (this.liquidMat) this.liquidMat.uniforms.uFill.value = k;
  }

  setLiquidTime(t) {
    if (this.liquidMat) this.liquidMat.uniforms.uTime.value = t;
  }
}
