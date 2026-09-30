import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bevelBox, lathe, capsule, sphere, torus, tube, cylinder, trs, prep } from '../world/GeometryKit.js';
import { createToonMaterial } from '../render/ToonMaterial.js';
import { COLORS } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  CharacterRig · "Los Drippers"
//  Mascotas urbanas chibi (cabeza 1 : cuerpo 2,5). Modelo jerárquico de
//  ~40 piezas redondeadas fusionadas en un SkinnedMesh con piel rígida
//  (cada vértice pertenece 100% a un hueso) → 1 draw call para el cuerpo.
//  El visor (ojos dinámicos), el tanque translúcido y el líquido son mallas
//  hijas de sus huesos con shaders propios.
// ─────────────────────────────────────────────────────────────

// Nombres e índices de huesos
export const BONES = [
  'root',
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'antenna',
  'shoulderL',
  'upperArmL',
  'foreArmL',
  'handL',
  'shoulderR',
  'upperArmR',
  'foreArmR',
  'handR',
  'tank',
  'hood',
  'thighL',
  'shinL',
  'footL',
  'thighR',
  'shinR',
  'footR',
  'scarf'
];

// Posición de reposo de cada hueso relativa a su padre
const REST = {
  root: [null, 0, 0, 0],
  hips: ['root', 0, 0.58, 0],
  spine: ['hips', 0, 0.05, 0],
  chest: ['spine', 0, 0.17, 0],
  neck: ['chest', 0, 0.15, 0],
  head: ['neck', 0, 0.07, 0.01],
  antenna: ['head', 0, 0.44, -0.06],
  shoulderL: ['chest', 0.19, 0.08, 0],
  upperArmL: ['shoulderL', 0.03, 0, 0],
  foreArmL: ['upperArmL', 0, -0.19, 0],
  handL: ['foreArmL', 0, -0.17, 0],
  shoulderR: ['chest', -0.19, 0.08, 0],
  upperArmR: ['shoulderR', -0.03, 0, 0],
  foreArmR: ['upperArmR', 0, -0.19, 0],
  handR: ['foreArmR', 0, -0.17, 0],
  tank: ['chest', 0, 0.0, -0.3],
  hood: ['chest', 0, 0.13, -0.1],
  thighL: ['hips', 0.1, -0.03, 0],
  shinL: ['thighL', 0, -0.22, 0],
  footL: ['shinL', 0, -0.21, 0],
  thighR: ['hips', -0.1, -0.03, 0],
  shinR: ['thighR', 0, -0.22, 0],
  footR: ['shinR', 0, -0.21, 0],
  scarf: ['chest', 0, 0.12, -0.12]
};

export const LEG = { thigh: 0.22, shin: 0.21, footH: 0.12 };
export const HIP_HEIGHT = 0.55; // altura de la articulación de la cadera en reposo

// Materiales compartidos entre todos los personajes (el color va en vertex colors)
let SHARED = null;

function sharedMaterials() {
  if (SHARED) return SHARED;
  SHARED = {
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0,
      transmission: 0,
      transparent: true,
      opacity: 0.32,
      envMapIntensity: 1.6,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      depthWrite: false,
      side: THREE.FrontSide
    })
  };
  return SHARED;
}

// ── visor con ojos procedurales (SDF) ─────────────────────────
const VISOR_FRAG_PARS = /* glsl */ `
uniform float uEmotion;
uniform float uBlink;
uniform vec2 uLook;
uniform vec3 uEyeColor;
uniform float uEyeGlow;
float sdCapsuleV( vec2 p, float h, float r ) {
  p.y -= clamp( p.y, -h, h );
  return length( p ) - r;
}
float sdSeg( vec2 p, vec2 a, vec2 b, float r ) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
  return length( pa - ba * h ) - r;
}
float eyeShape( vec2 p, float side ) {
  // p: coordenadas del ojo (x a lo ancho, y alto), side: -1 izq, +1 der
  float e = uEmotion;
  float d;
  if ( e < 0.5 ) {
    // normal: píldora vertical
    d = sdCapsuleV( p * vec2( 1.0, 1.0 / max( 0.08, 1.0 - uBlink ) ), 0.07, 0.07 );
  } else if ( e < 1.5 ) {
    // enfado: píldora cortada por una diagonal
    d = sdCapsuleV( p * vec2( 1.0, 1.0 / max( 0.08, 1.0 - uBlink ) ), 0.055, 0.075 );
    float cut = dot( p - vec2( 0.0, 0.035 ), normalize( vec2( side * 0.55, 1.0 ) ) );
    d = max( d, cut );
  } else if ( e < 2.5 ) {
    // sorpresa: anillo grande
    d = abs( length( p ) - 0.1 ) - 0.03;
    d = min( d, length( p ) - 0.035 );
  } else if ( e < 3.5 ) {
    // KO: aspa
    d = min( sdSeg( p, vec2( -0.08, -0.08 ), vec2( 0.08, 0.08 ), 0.028 ), sdSeg( p, vec2( -0.08, 0.08 ), vec2( 0.08, -0.08 ), 0.028 ) );
  } else {
    // feliz: arco ^
    d = min( sdSeg( p, vec2( -0.085, -0.03 ), vec2( 0.0, 0.05 ), 0.03 ), sdSeg( p, vec2( 0.085, -0.03 ), vec2( 0.0, 0.05 ), 0.03 ) );
  }
  return d;
}
`;

const VISOR_FRAG = /* glsl */ `
{
  // vUv: u a lo ancho del visor (0..1), v alto (0..1)
  vec2 p = vec2( ( vUv.x - 0.5 ) * 1.35, ( vUv.y - 0.47 ) ) + uLook * vec2( 0.06, 0.04 );
  float dl = eyeShape( p - vec2( -0.16, 0.0 ), 1.0 );
  float dr = eyeShape( p - vec2( 0.16, 0.0 ), -1.0 );
  float d = min( dl, dr );
  float aa = fwidth( d ) * 0.9;
  float eye = 1.0 - smoothstep( -aa, aa, d );
  float halo = ( 1.0 - smoothstep( 0.0, 0.08, d ) ) * 0.35;
  // brillo del ojo
  vec2 hl = p - vec2( sign( p.x ) * 0.16 - 0.03, 0.04 );
  float spark = ( 1.0 - smoothstep( 0.012, 0.022, length( hl ) ) ) * step( uEmotion, 0.5 ) * ( 1.0 - uBlink );
  diffuseColor.rgb = mix( diffuseColor.rgb, uEyeColor * 0.6, eye );
  totalEmissiveRadiance += uEyeColor * ( eye * uEyeGlow + halo * uEyeGlow * 0.4 ) + vec3( spark * 2.0 );
}
`;

function createVisorMaterial(eyeColor) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1b1530,
    roughness: 0.08,
    metalness: 0.2,
    envMapIntensity: 1.5
  });
  mat.userData.visor = {
    uEmotion: { value: 0 },
    uBlink: { value: 0 },
    uLook: { value: new THREE.Vector2() },
    uEyeColor: { value: new THREE.Color(eyeColor) },
    uEyeGlow: { value: 2.4 }
  };
  mat.onBeforeCompile = function (shader) {
    Object.assign(shader.uniforms, this.userData.visor);
    shader.vertexShader = shader.vertexShader.replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>\nvarying vec2 vUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <uv_pars_fragment>', '#include <uv_pars_fragment>\nvarying vec2 vUv;\n' + VISOR_FRAG_PARS)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + VISOR_FRAG);
  };
  mat.customProgramCacheKey = () => 'ink-visor';
  return mat;
}

// ── líquido del tanque (nivel real, oleaje y menisco) ─────────
const LIQUID_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  vViewPos = mv.xyz;
  vNormalV = normalize( normalMatrix * normal );
  gl_Position = projectionMatrix * mv;
}
`;

const LIQUID_FRAG = /* glsl */ `
uniform float uFill;
uniform vec2 uTilt;
uniform float uTime;
uniform float uMinY;
uniform float uMaxY;
uniform vec3 uColor;
uniform vec3 uColorDeep;
uniform float uBubbles;
varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  float level = mix( uMinY, uMaxY, clamp( uFill, 0.0, 1.0 ) );
  float wave = sin( vLocal.x * 38.0 + uTime * 7.0 ) * 0.004 + sin( vLocal.z * 31.0 - uTime * 5.3 ) * 0.003;
  float surf = level + dot( uTilt, vLocal.xz ) + wave;
  if ( vLocal.y > surf ) discard;
  vec3 col;
  float glow = 0.0;
  if ( gl_FrontFacing ) {
    float depth = clamp( ( surf - vLocal.y ) / ( uMaxY - uMinY + 1e-3 ), 0.0, 1.0 );
    col = mix( uColor * 1.15, uColorDeep, depth * 0.8 );
    // menisco brillante junto a la superficie
    float men = 1.0 - smoothstep( 0.0, 0.018, surf - vLocal.y );
    col += uColor * men * 0.9;
    glow = men * 0.6;
    // burbujas
    float b = step( 0.985, fract( sin( floor( ( vLocal.y + uTime * 0.12 ) * 60.0 ) * 91.3 + floor( vLocal.x * 40.0 ) * 17.1 ) * 4375.5 ) );
    col += vec3( b * uBubbles * 0.6 );
    float fres = pow( 1.0 - abs( dot( normalize( -vViewPos ), vNormalV ) ), 2.0 );
    col += uColor * fres * 0.5;
  } else {
    // cara trasera = superficie del líquido vista desde arriba
    col = uColor * 1.45;
    glow = 0.4;
  }
  gl_FragColor = vec4( col * ( 1.0 + glow ), 1.0 );
}
`;

function createLiquidMaterial(color) {
  const c = new THREE.Color(color);
  return new THREE.ShaderMaterial({
    vertexShader: LIQUID_VERT,
    fragmentShader: LIQUID_FRAG,
    uniforms: {
      uFill: { value: 1 },
      uTilt: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uMinY: { value: -0.19 },
      uMaxY: { value: 0.19 },
      uColor: { value: c.clone() },
      uColorDeep: { value: c.clone().multiplyScalar(0.45) },
      uBubbles: { value: 0 }
    },
    side: THREE.DoubleSide
  });
}

// ── constructor de piezas ────────────────────────────────────

class PartSet {
  constructor(boneIndex, boneWorld) {
    this.parts = [];
    this.boneIndex = boneIndex;
    this.boneWorld = boneWorld;
  }
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

const _pos = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/**
 * Crea un Dripper.
 * look: { team, hoodie, pants, helmet, accessory, seed }
 */
export function createDripper(look) {
  const team = COLORS.team[look.team];
  const hoodie = look.hoodie !== undefined ? look.hoodie : COLORS.lilac;
  const pants = look.pants !== undefined ? look.pants : 0x3d3552;
  const helmet = look.helmet !== undefined ? look.helmet : 0xfbf6ee;
  const shoeUpper = look.shoes !== undefined ? look.shoes : 0xfbf6ee;
  const glove = look.glove !== undefined ? look.glove : 0xf3ece2;

  // ── huesos
  const bones = [];
  const byName = {};
  for (const name of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    const [parent, x, y, z] = REST[name];
    b.position.set(x, y, z);
    if (parent) byName[parent].add(b);
    bones.push(b);
    byName[name] = b;
  }
  const root = byName.root;
  root.updateMatrixWorld(true);
  const rest = {};
  for (const b of bones) rest[b.name] = { position: b.position.clone(), quaternion: b.quaternion.clone() };

  // ── piezas por hueso (geometría en el espacio local del hueso)
  const geos = [];
  const add = (boneName, geo, m, color) => {
    const g = geo.clone();
    g.clearGroups();
    if (m) g.applyMatrix4(m);
    const bone = byName[boneName];
    g.applyMatrix4(bone.matrixWorld);
    colorize(g, color);
    const n = g.attributes.position.count;
    const idx = BONES.indexOf(boneName);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = idx;
      sw[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'paintUV', 'edge', 'color', 'skinIndex', 'skinWeight'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.paintUV) prep(g);
    if (!g.index) {
      const ii = new Uint32Array(n);
      for (let i = 0; i < n; i++) ii[i] = i;
      g.setIndex(new THREE.BufferAttribute(ii, 1));
    }
    geos.push(g);
    return g;
  };

  // CABEZA: casco
  const helm = sphere(0.305, 28, 20);
  add('head', helm, trs(0, 0.2, 0, 0, 0, 0, 1, 0.93, 1), helmet);
  // cresta de color de equipo (de la frente a la nuca)
  add('head', torus(0.3, 0.042, 8, 28, Math.PI * 0.85), trs(0, 0.2, 0, 0, Math.PI / 2, -Math.PI * 0.1, 1, 0.94, 1), team.main);
  // orejeras
  for (const sx of [-1, 1]) {
    add('head', cylinder(0.085, 0.095, 0.08, 16), trs(sx * 0.3, 0.19, -0.01, 0, 0, Math.PI / 2), 0x4b4262);
    add('head', torus(0.07, 0.018, 6, 16), trs(sx * 0.345, 0.19, -0.01, 0, Math.PI / 2, 0), team.accent);
  }
  // marco del visor: parche esférico oscuro algo mayor que el visor
  const rim = prep(new THREE.SphereGeometry(0.309, 32, 16, -Math.PI * 0.39 + Math.PI / 2, Math.PI * 0.78, Math.PI * 0.27, Math.PI * 0.42));
  add('head', rim, trs(0, 0.2, 0.004, 0, 0, 0, 1.02, 0.93, 1.06), 0x3b3352);
  // cuello
  add('neck', cylinder(0.075, 0.09, 0.1, 14), trs(0, 0.03, 0), 0x4b4262);

  // TORSO: sudadera oversize
  const hood = lathe(
    [
      [0.001, -0.02],
      [0.22, -0.02],
      [0.262, 0.03],
      [0.272, 0.12],
      [0.262, 0.22],
      [0.225, 0.3],
      [0.14, 0.345],
      [0.001, 0.35]
    ],
    24
  );
  add('chest', hood, trs(0, -0.2, 0, 0, 0, 0, 1.08, 1, 0.84), hoodie);
  add('chest', torus(0.225, 0.035, 8, 26), trs(0, -0.2, 0, Math.PI / 2, 0, 0, 1.08, 0.84, 1), team.accent); // dobladillo
  add('chest', bevelBox(0.22, 0.09, 0.04, { bevel: 0.018 }), trs(0, -0.07, 0.212, -0.08, 0, 0), new THREE.Color(hoodie).multiplyScalar(0.85).getHex()); // bolsillo
  // cordones
  for (const sx of [-1, 1]) {
    add('chest', tube([[sx * 0.05, 0.13, 0.15], [sx * 0.055, 0.06, 0.2], [sx * 0.06, -0.01, 0.215]], 0.008, 8, 5), null, 0xfbf6ee);
    add('chest', sphere(0.016, 8, 6), trs(sx * 0.06, -0.015, 0.217), team.accent);
  }
  // capucha (color de equipo) — hueso con muelle
  add('hood', torus(0.13, 0.055, 10, 20, Math.PI * 1.25), trs(0, -0.02, 0.07, Math.PI / 2 - 0.15, 0, Math.PI * 0.87, 1.05, 1, 0.9), team.main);
  add('hood', sphere(0.14, 16, 12), trs(0, -0.01, -0.03, 0.4, 0, 0, 1.05, 0.62, 0.8), team.main);

  // CADERA / PANTALÓN
  add('hips', bevelBox(0.32, 0.13, 0.22, { bevel: 0.055 }), trs(0, -0.02, 0), pants);
  add('hips', torus(0.14, 0.018, 6, 22), trs(0, 0.035, 0, Math.PI / 2, 0, 0, 1.1, 0.8, 1), 0x2d2640); // cinturón

  // PIERNAS
  for (const [side, sx] of [
    ['L', 1],
    ['R', -1]
  ]) {
    add('thigh' + side, capsule(0.068, 0.14, 4, 10), trs(0, -0.11, 0), pants);
    add('shin' + side, capsule(0.06, 0.13, 4, 10), trs(0, -0.1, 0), pants);
    add('shin' + side, torus(0.06, 0.016, 6, 14), trs(0, -0.19, 0, Math.PI / 2, 0, 0), team.accent); // calcetín
    // zapatilla chunky
    add('foot' + side, bevelBox(0.16, 0.055, 0.29, { bevel: 0.025 }), trs(0, -0.093, 0.04), team.main); // suela de equipo
    add('foot' + side, bevelBox(0.145, 0.085, 0.25, { bevel: 0.04 }), trs(0, -0.035, 0.035), shoeUpper);
    add('foot' + side, sphere(0.075, 12, 8), trs(0, -0.045, 0.14, 0, 0, 0, 1, 0.75, 1.1), shoeUpper); // puntera
    add('foot' + side, bevelBox(0.09, 0.02, 0.12, { bevel: 0.008 }), trs(0, 0.012, 0.07, 0.25, 0, 0), team.accent); // cordones
    add('foot' + side, bevelBox(0.05, 0.07, 0.03, { bevel: 0.01 }), trs(0, 0.02, -0.095, -0.2, 0, 0), team.accent); // talón
    void sx;
  }

  // BRAZOS
  for (const side of ['L', 'R']) {
    add('upperArm' + side, capsule(0.068, 0.11, 4, 10), trs(0, -0.09, 0), hoodie);
    add('foreArm' + side, capsule(0.062, 0.1, 4, 10), trs(0, -0.08, 0), hoodie);
    add('foreArm' + side, torus(0.058, 0.02, 6, 14), trs(0, -0.155, 0, Math.PI / 2, 0, 0), team.accent); // puño
    add('hand' + side, sphere(0.06, 12, 10), trs(0, -0.035, 0.005, 0, 0, 0, 1, 1.05, 0.9), glove);
    add('hand' + side, capsule(0.022, 0.03, 3, 6), trs(side === 'L' ? -0.045 : 0.045, -0.02, 0.035, 0.6, 0, 0), glove); // pulgar
  }

  // MOCHILA-TANQUE (piezas opacas)
  add('tank', cylinder(0.118, 0.118, 0.05, 18), trs(0, 0.2, 0), 0x4b4262); // tapa superior
  add('tank', cylinder(0.1, 0.12, 0.05, 18), trs(0, -0.205, 0), 0x4b4262); // base
  add('tank', torus(0.12, 0.014, 6, 20), trs(0, 0.17, 0, Math.PI / 2, 0, 0), team.accent);
  add('tank', torus(0.12, 0.014, 6, 20), trs(0, -0.17, 0, Math.PI / 2, 0, 0), team.accent);
  add('tank', cylinder(0.025, 0.03, 0.06, 8), trs(0.05, 0.24, 0), 0x6d6588); // válvula
  add('tank', bevelBox(0.16, 0.3, 0.04, { bevel: 0.015 }), trs(0, 0, 0.12), 0x4b4262); // placa trasera
  // correas
  for (const sx of [-1, 1]) {
    add('chest', tube([[sx * 0.09, 0.14, -0.2], [sx * 0.13, 0.19, -0.02], [sx * 0.12, 0.13, 0.18], [sx * 0.1, -0.02, 0.215]], 0.018, 10, 5), null, 0x4b4262);
  }

  // ACCESORIO
  const acc = look.accessory || 'none';
  if (acc === 'cap') {
    add('head', sphere(0.29, 18, 10, {}), trs(0, 0.33, -0.01, 0, 0, 0, 1.02, 0.55, 1.02), look.accColor || COLORS.yellow);
    add('head', bevelBox(0.26, 0.025, 0.2, { bevel: 0.01 }), trs(0, 0.33, -0.3, -0.12, 0, 0), look.accColor || COLORS.yellow);
    add('head', sphere(0.03, 8, 6), trs(0, 0.49, -0.01), team.accent);
  } else if (acc === 'headphones') {
    add('head', torus(0.33, 0.025, 8, 24, Math.PI), trs(0, 0.2, -0.03, 0, 0, 0, 1, 1.02, 1), 0x2d2640);
    for (const sx of [-1, 1]) {
      add('head', cylinder(0.12, 0.12, 0.09, 18), trs(sx * 0.33, 0.18, -0.03, 0, 0, Math.PI / 2), look.accColor || COLORS.pink);
      add('head', cylinder(0.06, 0.06, 0.1, 12), trs(sx * 0.35, 0.18, -0.03, 0, 0, Math.PI / 2), 0xfbf6ee);
    }
  } else if (acc === 'antenna') {
    add('antenna', cylinder(0.012, 0.018, 0.3, 6), trs(0, 0.14, 0), 0x4b4262);
    add('antenna', sphere(0.05, 10, 8), trs(0, 0.31, 0), team.accent);
    add('head', cylinder(0.04, 0.05, 0.05, 10), trs(0, 0.47, -0.06), 0x4b4262);
  } else if (acc === 'scarf') {
    add('neck', torus(0.11, 0.045, 8, 20), trs(0, 0.0, 0, Math.PI / 2, 0, 0, 1, 1, 0.9), look.accColor || COLORS.mint);
    add('scarf', bevelBox(0.09, 0.22, 0.03, { bevel: 0.012 }), trs(0.04, -0.12, -0.02, 0.2, 0, 0.1), look.accColor || COLORS.mint);
    add('scarf', bevelBox(0.07, 0.16, 0.03, { bevel: 0.012 }), trs(-0.05, -0.1, -0.01, 0.15, 0, -0.15), new THREE.Color(look.accColor || COLORS.mint).multiplyScalar(0.85).getHex());
  } else if (acc === 'crown') {
    // cresta punk de pintura
    for (let i = 0; i < 5; i++) {
      const a = -0.5 + i * 0.25;
      add('head', capsule(0.035, 0.08 + (i === 2 ? 0.05 : 0), 3, 6), trs(0, 0.47 + Math.cos(a) * 0.02, Math.sin(a) * 0.24, a, 0, 0), team.accent);
    }
  }

  const geometry = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  geometry.computeBoundingSphere();

  const bodyMat = createToonMaterial({
    name: 'dripper',
    vertexColors: true,
    roughness: 0.42,
    metalness: 0,
    envMapIntensity: 0.75,
    rim: 0.55,
    variation: 0.03,
    variationScale: 2,
    paint: 'none',
    flash: true
  });

  const mesh = new THREE.SkinnedMesh(geometry, bodyMat);
  mesh.name = 'dripper-body';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.add(root);

  // ── visor (hijo de la cabeza)
  const visorGeo = new THREE.SphereGeometry(0.312, 32, 16, -Math.PI * 0.36 + Math.PI / 2, Math.PI * 0.72, Math.PI * 0.3, Math.PI * 0.36);
  // SphereGeometry: phi = π/2 apunta a +Z (frente del personaje)
  visorGeo.scale(1.02, 0.93, 1.06);
  visorGeo.translate(0, 0.2, 0.005);
  const visorMat = createVisorMaterial(team.accent);
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.name = 'visor';
  visor.castShadow = false;
  byName.head.add(visor);

  // ── tanque translúcido + líquido (hijos del hueso tanque)
  const liquidMat = createLiquidMaterial(team.main);
  const liquid = new THREE.Mesh(new THREE.CapsuleGeometry(0.098, 0.2, 6, 18), liquidMat);
  liquid.name = 'tank-liquid';
  liquid.castShadow = false;
  byName.tank.add(liquid);
  const glass = new THREE.Mesh(new THREE.CapsuleGeometry(0.113, 0.22, 6, 20), sharedMaterials().glass);
  glass.name = 'tank-glass';
  glass.castShadow = false;
  glass.renderOrder = 2;
  byName.tank.add(glass);

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);

  return {
    mesh,
    bones: byName,
    boneList: bones,
    rest,
    bodyMat,
    visorMat,
    liquidMat,
    liquid,
    glass,
    look
  };
}

/** Pone todos los huesos en su pose de reposo. */
export function resetPose(rig) {
  for (const name of BONES) {
    const b = rig.bones[name];
    const r = rig.rest[name];
    b.position.copy(r.position);
    b.quaternion.copy(r.quaternion);
    b.scale.set(1, 1, 1);
  }
}

export { _pos, _q, _s };
