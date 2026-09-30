import * as THREE from 'three';
import { createToonMaterial, applyToonPatch } from './ToonMaterial.js';

// ─────────────────────────────────────────────────────────────
//  Water · agua del puerto (fuera de límites)
//  Malla con densidad decreciente desde el centro, olas por suma de senos
//  (normal analítica), espuma animada contra el muelle (SDF de rectángulos),
//  cresta más clara y destellos del sol que alimentan el bloom.
// ─────────────────────────────────────────────────────────────

const MAX_RECTS = 8;

const VERT_PARS = /* glsl */ `
uniform float uWaveTime;
varying float vWaveH;
float waterWaves( vec2 p, float t, out vec2 g ) {
  float fade = 1.0 - smoothstep( 110.0, 320.0, length( p ) );
  float h = 0.0;
  g = vec2( 0.0 );
  vec2 d; float k; float a; float ph;
  d = normalize( vec2( 0.8, 0.6 ) ); k = 0.42; a = 0.13; ph = dot( d, p ) * k + t * 1.35;
  h += a * sin( ph ); g += a * k * cos( ph ) * d;
  d = normalize( vec2( -0.35, 0.94 ) ); k = 0.71; a = 0.075; ph = dot( d, p ) * k + t * 1.9;
  h += a * sin( ph ); g += a * k * cos( ph ) * d;
  d = normalize( vec2( 0.97, -0.25 ) ); k = 1.13; a = 0.04; ph = dot( d, p ) * k + t * 2.6;
  h += a * sin( ph ); g += a * k * cos( ph ) * d;
  d = normalize( vec2( 0.2, 0.98 ) ); k = 0.16; a = 0.22; ph = dot( d, p ) * k + t * 0.7;
  h += a * sin( ph ); g += a * k * cos( ph ) * d;
  h *= fade; g *= fade;
  return h;
}
`;

const VERT_NORMAL = /* glsl */ `
vec2 wWorldXZ = ( modelMatrix * vec4( position, 1.0 ) ).xz;
vec2 wGrad;
float wH = waterWaves( wWorldXZ, uWaveTime, wGrad );
objectNormal = normalize( vec3( -wGrad.x, 1.0, -wGrad.y ) );
vWaveH = wH;
`;

const VERT_POS = /* glsl */ `
transformed.y += wH;
`;

const FRAG_PARS = /* glsl */ `
uniform vec4 uShoreRects[ ${MAX_RECTS} ];
uniform int uShoreCount;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform vec3 uFoamColor;
uniform float uWaveTime;
varying float vWaveH;
float sdRect( vec2 p, vec4 r ) {
  vec2 q = abs( p - r.xy ) - r.zw;
  return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 );
}
`;

const FRAG_ALBEDO = /* glsl */ `
{
  vec2 wp = vInkWorldPos.xz;
  float dist = 1e5;
  for ( int i = 0; i < ${MAX_RECTS}; i++ ) {
    if ( i >= uShoreCount ) break;
    dist = min( dist, sdRect( wp, uShoreRects[ i ] ) );
  }
  float nA = texture2D( uNoiseTex, wp * 0.045 + vec2( uWaveTime * 0.012, uWaveTime * 0.008 ) ).r;
  float nB = texture2D( uNoiseTex, wp * 0.11 - vec2( uWaveTime * 0.02, -uWaveTime * 0.015 ) ).g;
  float near = 1.0 - smoothstep( 0.0, 22.0, dist );
  vec3 water = mix( uWaterDeep, uWaterShallow, near * 0.65 + smoothstep( 0.05, 0.3, vWaveH ) * 0.35 );
  water *= 0.92 + nA * 0.16;
  // espuma: línea pegada al muelle + bandas que se alejan
  float band = sin( dist * 2.1 - uWaveTime * 2.2 + nA * 5.0 );
  float foamEdge = 1.0 - smoothstep( 0.0, 0.9 + nB * 0.8, dist );
  float foamBands = smoothstep( 0.72, 0.9, band ) * ( 1.0 - smoothstep( 1.0, 6.5, dist ) ) * smoothstep( 0.35, 0.65, nB );
  float crest = smoothstep( 0.2, 0.32, vWaveH + ( nB - 0.5 ) * 0.2 ) * smoothstep( 0.45, 0.7, nA );
  float foam = max( max( foamEdge, foamBands ), crest * 0.8 );
  diffuseColor.rgb = mix( water, uFoamColor, foam );
  inkMask = 0.0;
  inkFresh = foam; // reutilizado para rugosidad
}
`;

const FRAG_ROUGH = /* glsl */ `
roughnessFactor = mix( 0.06, 0.65, inkFresh );
`;

const FRAG_EMISSIVE = /* glsl */ `
{
  vec2 wp = vInkWorldPos.xz;
  float s1 = texture2D( uNoiseTex, wp * 0.32 + vec2( uWaveTime * 0.05, 0.0 ) ).b;
  float s2 = texture2D( uNoiseTex, wp * 0.27 - vec2( 0.0, uWaveTime * 0.045 ) ).b;
  float spark = smoothstep( 0.86, 0.95, s1 * s2 * 1.35 );
  vec3 V = normalize( vViewPosition );
  vec3 R = reflect( -V, normal );
  vec3 sunV = normalize( ( viewMatrix * vec4( uSunDirW, 0.0 ) ).xyz );
  float glint = pow( max( dot( R, sunV ), 0.0 ), 24.0 );
  totalEmissiveRadiance += uSunColorLin * spark * glint * 1.6 * ( 1.0 - inkFresh );
}
`;

function waterOnBeforeCompile(shader) {
  applyToonPatch(shader, this);
  Object.assign(shader.uniforms, this.userData.waterUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + VERT_NORMAL)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_POS);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
    .replace('// INK_ALBEDO_END', '// INK_ALBEDO_END\n' + FRAG_ALBEDO)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE);
}

function buildWaterGeometry(segments = 180, radius = 1400, a = 0.075) {
  const g = new THREE.PlaneGeometry(2, 2, segments, segments);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const map = (t) => {
    const s = Math.sign(t);
    const u = Math.abs(t);
    return s * radius * (a * u + (1 - a) * u * u * u);
  };
  for (let i = 0; i < p.count; i++) {
    p.setX(i, map(p.getX(i)));
    p.setZ(i, map(p.getZ(i)));
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export class Water {
  constructor(opts = {}) {
    this.level = opts.level !== undefined ? opts.level : -1.6;
    const mat = createToonMaterial({
      name: 'water',
      color: 0xffffff,
      roughness: 0.08,
      metalness: 0,
      envMapIntensity: 1.0,
      variation: 0,
      paint: 'none'
    });
    const rects = [];
    for (let i = 0; i < MAX_RECTS; i++) rects.push(new THREE.Vector4(0, 0, 0, 0));
    mat.userData.waterUniforms = {
      uWaveTime: { value: 0 },
      uShoreRects: { value: rects },
      uShoreCount: { value: 0 },
      uWaterDeep: { value: new THREE.Color(0x1d6f86).multiplyScalar(0.9) },
      uWaterShallow: { value: new THREE.Color(0x49b8b3) },
      uFoamColor: { value: new THREE.Color(0xf5fbf7).multiplyScalar(1.05) }
    };
    mat.onBeforeCompile = waterOnBeforeCompile;
    this.material = mat;
    this.mesh = new THREE.Mesh(buildWaterGeometry(), mat);
    this.mesh.position.y = this.level;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
  }

  /** rects: [{x, z, hx, hz}] zonas sólidas que generan espuma. */
  setShore(rects) {
    const u = this.material.userData.waterUniforms;
    rects.slice(0, MAX_RECTS).forEach((r, i) => u.uShoreRects.value[i].set(r.x, r.z, r.hx, r.hz));
    u.uShoreCount.value = Math.min(rects.length, MAX_RECTS);
  }

  update(time) {
    this.time = time;
    this.material.userData.waterUniforms.uWaveTime.value = time;
  }

  /** Altura del agua en (x,z): misma suma de ondas que el shader. */
  heightAt(x, z) {
    const t = this.time || 0;
    const len = Math.hypot(x, z);
    const fade = 1 - smooth(110, 320, len);
    let h = 0;
    for (const w of WAVES) {
      h += w.a * Math.sin((w.dx * x + w.dz * z) * w.k + t * w.s);
    }
    return this.level + h * fade;
  }
}

const WAVES = [
  { dx: 0.8, dz: 0.6, k: 0.42, a: 0.13, s: 1.35 },
  { dx: -0.35, dz: 0.94, k: 0.71, a: 0.075, s: 1.9 },
  { dx: 0.97, dz: -0.25, k: 1.13, a: 0.04, s: 2.6 },
  { dx: 0.2, dz: 0.98, k: 0.16, a: 0.22, s: 0.7 }
].map((w) => {
  const l = Math.hypot(w.dx, w.dz);
  return { ...w, dx: w.dx / l, dz: w.dz / l };
});

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
