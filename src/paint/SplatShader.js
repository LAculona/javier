import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
//  SplatShader · shaders del sistema de pintura
//  1) Generador del atlas de sellos (4×4 formas orgánicas: manchas con
//     borde de ruido, gotas satélite, regueros direccionales, franja de
//     rodillo y gotas sueltas). Campo tipo distancia para umbralizar.
//  2) Estampado instanciado sobre el splat map (suelo XZ o atlas de
//     paredes). Canal R = naranja, G = azul, B = instante de pintado
//     ponderado. La mezcla premultiplicada hace que pintar un color RESTE
//     el otro: R' = a + R(1-a), G' = G(1-a).
// ─────────────────────────────────────────────────────────────

export const STAMP_GRID = 4;
export const STAMP = {
  ROUND: [0, 1, 2, 3, 4, 5, 6, 7],
  STREAK: [8, 9, 10, 11],
  ROLLER: [12, 13],
  DROP: [14, 15]
};

const fullscreenVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

// ── generador del atlas de sellos (CPU, determinista) ─────────────

function hash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function smin(a, b, k) {
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

function sdCapsule(px, py, ax, ay, bx, by, ra, rb) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - (ra + (rb - ra) * h);
}

function angNoise(a, s) {
  return Math.sin(a * 3 + s * 6.1) * 0.5 + Math.sin(a * 5 + s * 2.7) * 0.3 + Math.sin(a * 8 + s * 9.3) * 0.14 + Math.sin(a * 13 + s * 4.1) * 0.06;
}

// Parámetros de cada sello (satélites, regueros…) calculados una vez
function stampShapes(idx) {
  const s = idx * 7.31 + 1.7;
  const sh = { idx, s, sats: [], bridges: [], streaks: [], tips: [], drops: [] };
  if (idx < 8) {
    for (let i = 0; i < 9; i++) {
      const a = hash(s + i * 3.1) * Math.PI * 2;
      const dist = 0.58 + hash(s + i * 5.7) * 0.34;
      const rr = 0.025 + hash(s + i * 1.3) * 0.07;
      const cx = Math.cos(a) * dist;
      const cy = Math.sin(a) * dist;
      sh.sats.push([cx, cy, rr]);
      if (hash(s + i * 9.1) > 0.55) sh.bridges.push([cx * 0.7, cy * 0.7, cx, cy, rr * 0.5, rr * 0.8]);
    }
  } else if (idx < 12) {
    for (let i = 0; i < 5; i++) {
      const y = (hash(s + i * 2.3) - 0.5) * 0.7;
      const len = 0.45 + hash(s + i * 4.9) * 0.5;
      const w = 0.05 + hash(s + i * 7.7) * 0.07;
      sh.streaks.push([0.05, y * 0.8, 0.05 + len, y, w, w * 0.45]);
      sh.tips.push([0.12 + len + 0.08, y * 1.05, w * 0.7]);
    }
    for (let i = 0; i < 5; i++) {
      const a = hash(s + i * 3.9) * Math.PI * 2;
      const dist = 0.55 + hash(s + i * 1.9) * 0.3;
      sh.sats.push([Math.cos(a) * dist, Math.sin(a) * dist, 0.02 + hash(s + i) * 0.05]);
    }
  } else if (idx < 14) {
    for (let i = 0; i < 6; i++) {
      const x = (hash(s + i * 2.1) - 0.5) * 1.6;
      const side = hash(s + i * 6.3) > 0.5 ? 1 : -1;
      sh.drops.push([x, side, 0.08 + hash(s + i) * 0.12, 0.03 + hash(s + i * 8.1) * 0.05]);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const a = hash(s + i * 3.1) * Math.PI * 2;
      const d = 0.5 + hash(s + i) * 0.3;
      sh.sats.push([Math.cos(a) * d, Math.sin(a) * d, 0.05]);
    }
  }
  return sh;
}

function stampSDF(sh, px, py) {
  const ang = Math.atan2(py, px);
  const s = sh.s;
  let d;
  if (sh.idx < 8) {
    d = Math.hypot(px, py) - 0.5 * (1 + 0.16 * angNoise(ang, s));
    for (const [cx, cy, rr] of sh.sats) d = smin(d, Math.hypot(px - cx, py - cy) - rr, 0.05);
    for (const b of sh.bridges) d = smin(d, sdCapsule(px, py, b[0], b[1], b[2], b[3], b[4], b[5]), 0.04);
  } else if (sh.idx < 12) {
    const qx = px + 0.2;
    d = Math.hypot(qx * 0.92, py) - 0.42 * (1 + 0.13 * angNoise(ang, s));
    for (const k of sh.streaks) d = smin(d, sdCapsule(px, py, k[0], k[1], k[2], k[3], k[4], k[5]), 0.08);
    for (const [tx, ty, tr] of sh.tips) d = Math.min(d, Math.hypot(px - tx, py - ty) - tr);
    for (const [cx, cy, rr] of sh.sats) d = smin(d, Math.hypot(px - cx, py - cy) - rr, 0.04);
  } else if (sh.idx < 14) {
    const edge = 0.62 + 0.05 * Math.sin(px * 9 + s) + 0.03 * Math.sin(px * 23 + s * 2);
    d = Math.max(Math.abs(px) - 0.9, Math.abs(py) - edge);
    for (const [x, side, off, r] of sh.drops) d = smin(d, Math.hypot(px - x, py - side * (edge + off)) - r, 0.06);
  } else {
    d = Math.hypot(px, py) - 0.34 * (1 + 0.12 * angNoise(ang, s));
    for (const [cx, cy, rr] of sh.sats) d = smin(d, Math.hypot(px - cx, py - cy) - rr, 0.05);
  }
  // desvanecer hacia el borde de la celda
  return Math.max(d, Math.max(Math.abs(px), Math.abs(py)) - 0.97);
}

/**
 * Atlas de sellos 4×4 generado en CPU (campo tipo distancia en R).
 * Devuelve un objeto con .texture para mantener la interfaz de render target.
 */
export function generateStampAtlas(size = 512) {
  const data = new Uint8Array(size * size * 4);
  const cell = size / STAMP_GRID;
  const shapes = [];
  for (let i = 0; i < STAMP_GRID * STAMP_GRID; i++) shapes.push(stampShapes(i));
  for (let y = 0; y < size; y++) {
    const cyi = Math.floor(y / cell);
    const py = ((y - cyi * cell + 0.5) / cell) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const cxi = Math.floor(x / cell);
      const px = ((x - cxi * cell + 0.5) / cell) * 2 - 1;
      const d = stampSDF(shapes[cyi * STAMP_GRID + cxi], px, py);
      const a = Math.min(1, Math.max(0, 0.5 - d * 5));
      const k = (y * size + x) * 4;
      const v = Math.round(a * 255);
      data[k] = v;
      data[k + 1] = v;
      data[k + 2] = v;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { texture: tex, dispose: () => tex.dispose() };
}

// ── estampado instanciado ─────────────────────────────────────

const stampVert = /* glsl */ `
attribute vec2 corner;         // [-1,1]
attribute vec4 iCenterRad;     // centro uv (xy) + radio uv (zw)
attribute vec4 iParams;        // rotación, índice de sello, equipo, fuerza
attribute vec4 iExtra;         // altura de impacto, estiramiento, tiempo, (libre)
attribute vec4 iClip;          // rect de recorte (x, y, w, h) — sólo paredes
varying vec2 vLocal;
varying vec2 vStampUV;
varying vec2 vUvPos;
varying float vTeam;
varying float vStrength;
varying float vImpactY;
varying float vTime;
varying vec4 vClip;
void main() {
  float rot = iParams.x;
  float c = cos( rot );
  float s = sin( rot );
  vec2 k = corner * vec2( iExtra.y, 1.0 );
  vec2 r = vec2( c * k.x - s * k.y, s * k.x + c * k.y );
  vec2 uvPos = iCenterRad.xy + r * iCenterRad.zw;
  vUvPos = uvPos;
  vLocal = corner;
  float idx = iParams.y;
  vec2 cell = vec2( mod( idx, ${STAMP_GRID}.0 ), floor( idx / ${STAMP_GRID}.0 ) );
  vStampUV = ( cell + corner * 0.5 + 0.5 ) / ${STAMP_GRID}.0;
  vTeam = iParams.z;
  vStrength = iParams.w;
  vImpactY = iExtra.x;
  vTime = iExtra.z;
  vClip = iClip;
  gl_Position = vec4( uvPos * 2.0 - 1.0, 0.0, 1.0 );
}
`;

const stampFrag = /* glsl */ `
uniform sampler2D uStamps;
uniform sampler2D uHeight;
uniform float uHeightTol;
uniform float uUseHeight;
uniform float uUseClip;
varying vec2 vLocal;
varying vec2 vStampUV;
varying vec2 vUvPos;
varying float vTeam;
varying float vStrength;
varying float vImpactY;
varying float vTime;
varying vec4 vClip;
void main() {
  float a = texture2D( uStamps, vStampUV ).r * vStrength;
  if ( uUseHeight > 0.5 ) {
    float h = texture2D( uHeight, vUvPos ).r;
    a *= 1.0 - smoothstep( uHeightTol * 0.6, uHeightTol, abs( h - vImpactY ) );
  }
  if ( uUseClip > 0.5 ) {
    vec2 q = ( vUvPos - vClip.xy ) / vClip.zw;
    if ( q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0 ) discard;
  }
  if ( a <= 0.002 ) discard;
  vec2 team = vTeam < 0.5 ? vec2( a, 0.0 ) : vec2( 0.0, a );
  gl_FragColor = vec4( team, vTime * a, a );
}
`;

export function createStampMaterial({ stamps, height, heightTol, useHeight, useClip }) {
  return new THREE.ShaderMaterial({
    vertexShader: stampVert,
    fragmentShader: stampFrag,
    uniforms: {
      uStamps: { value: stamps },
      uHeight: { value: height },
      uHeightTol: { value: heightTol },
      uUseHeight: { value: useHeight ? 1 : 0 },
      uUseClip: { value: useClip ? 1 : 0 }
    },
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor
  });
}

// ── mapa de alturas y máscara de territorio (render cenital) ─────
const heightVert = /* glsl */ `
attribute float floorFlag;
varying float vY;
varying float vFloor;
uniform vec4 uBounds; // minX, minZ, 1/sizeX, 1/sizeZ
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vY = wp.y;
  vFloor = floorFlag;
  vec2 uv = ( wp.xz - uBounds.xy ) * uBounds.zw;
  // z de profundidad: los puntos más altos ganan
  gl_Position = vec4( uv * 2.0 - 1.0, 1.0 - ( wp.y + 20.0 ) / 60.0, 1.0 );
}
`;

const heightFrag = /* glsl */ `
varying float vY;
varying float vFloor;
void main() {
  gl_FragColor = vec4( vY, vFloor, 0.0, 1.0 );
}
`;

export function createHeightMaterial(bounds) {
  return new THREE.ShaderMaterial({
    vertexShader: heightVert,
    fragmentShader: heightFrag,
    uniforms: { uBounds: { value: bounds } },
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide
  });
}

// ── reducción para el conteo de territorio ─────────────────────
const territoryFrag = /* glsl */ `
uniform sampler2D uPaint;
uniform sampler2D uHeight;
uniform vec2 uCells;          // celdas de la rejilla
uniform vec4 uPlayRect;       // rect jugable en uv (x0, y0, x1, y1)
varying vec2 vUv;
void main() {
  vec2 cellSize = 1.0 / uCells;
  vec2 base = floor( vUv * uCells ) * cellSize;
  float o = 0.0;
  float b = 0.0;
  float m = 0.0;
  for ( int j = 0; j < 4; j++ ) {
    for ( int i = 0; i < 4; i++ ) {
      vec2 uv = base + ( vec2( float( i ), float( j ) ) + 0.5 ) * 0.25 * cellSize;
      float inside = step( uPlayRect.x, uv.x ) * step( uv.x, uPlayRect.z ) * step( uPlayRect.y, uv.y ) * step( uv.y, uPlayRect.w );
      float mask = texture2D( uHeight, uv ).g * inside;
      vec4 p = texture2D( uPaint, uv );
      float cov = step( 0.5, p.r + p.g );
      float team = step( p.r, p.g ); // 0 naranja, 1 azul
      o += mask * cov * ( 1.0 - team );
      b += mask * cov * team;
      m += mask;
    }
  }
  gl_FragColor = vec4( o / 16.0, b / 16.0, m / 16.0, 1.0 );
}
`;

export function createTerritoryMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: territoryFrag,
    uniforms: {
      uPaint: { value: null },
      uHeight: { value: null },
      uCells: { value: new THREE.Vector2(88, 128) },
      uPlayRect: { value: new THREE.Vector4(0, 0, 1, 1) }
    },
    depthTest: false,
    depthWrite: false
  });
}
