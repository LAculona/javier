import * as THREE from 'three';
import { COLORS } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  ToonMaterial
//  MeshStandardMaterial parcheado con onBeforeCompile:
//   · difuso toon de 3 bandas suaves (el sombreado de sombra también se
//     cuantiza), especular GGX conservado
//   · luz de borde (rim)
//   · variación de superficie en espacio mundo, suciedad en la base y
//     desgaste de aristas
//   · pintura: splat map del suelo (XZ) + atlas por superficie (paredes),
//     con borde orgánico, relieve, brillo húmedo y ondas de pintura fresca
//  Todas las variantes se seleccionan con `defines` para que three.js
//  comparta programas entre materiales equivalentes.
// ─────────────────────────────────────────────────────────────

export const sharedUniforms = {
  uInkTime: { value: 0 },
  uPaintTime: { value: 0 },
  uSunColorLin: { value: new THREE.Color(1, 1, 1) },
  uSunLum: { value: 1 },
  uSunDirW: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  uRimColor: { value: new THREE.Color(0xfff1dc) },
  uNoiseTex: { value: null },
  uTeamA: { value: new THREE.Color(COLORS.team[0].main) },
  uTeamB: { value: new THREE.Color(COLORS.team[1].main) },
  uTeamAGlow: { value: new THREE.Color(COLORS.team[0].accent) },
  uTeamBGlow: { value: new THREE.Color(COLORS.team[1].accent) },
  uPaintGround: { value: null },
  uPaintBounds: { value: new THREE.Vector4(-44, -64, 1 / 88, 1 / 128) },
  uPaintAtlas: { value: null },
  uAtlasMeters: { value: 200 },
  uDryTime: { value: 3.6 },
  uPaintBump: { value: 0.07 },
  uPaintGlow: { value: 0.0 },
  uFreshGlow: { value: 0.22 },
  uShadowTint: { value: new THREE.Color(0x8f86c8) },
  uOverlayTex: { value: null },
  uWetTex: { value: null },
  uBandSoft: { value: 0.06 }
};

const VERT_PARS = /* glsl */ `
varying vec3 vInkWorldPos;
varying vec3 vInkWorldNormal;
#ifdef INK_PAINT_ATLAS
attribute vec2 paintUV;
varying vec2 vPaintUV;
#endif
#ifdef INK_EDGEWEAR
attribute float edge;
varying float vInkEdge;
#endif
`;

const VERT_MAIN = /* glsl */ `
{
  vec4 inkWP = vec4( transformed, 1.0 );
  vec3 inkN = objectNormal;
  #ifdef USE_BATCHING
    inkWP = batchingMatrix * inkWP;
    inkN = mat3( batchingMatrix ) * inkN;
  #endif
  #ifdef USE_INSTANCING
    inkWP = instanceMatrix * inkWP;
    inkN = mat3( instanceMatrix ) * inkN;
  #endif
  inkWP = modelMatrix * inkWP;
  vInkWorldPos = inkWP.xyz;
  vInkWorldNormal = normalize( mat3( modelMatrix ) * inkN );
  #ifdef INK_PAINT_ATLAS
    vPaintUV = paintUV;
  #endif
  #ifdef INK_EDGEWEAR
    vInkEdge = edge;
  #endif
}
`;

export const PAINT_GLSL = /* glsl */ `
struct InkPaint {
  float mask;
  float teamB;
  float fresh;
  float edge;
  vec2 dH;
};

float inkHeight( float v, vec2 m, float fresh ) {
  float h = smoothstep( 0.44, 0.66, v );
  float rip = sin( m.x * 9.3 + m.y * 3.1 + uInkTime * 5.5 ) * sin( m.y * 7.1 - m.x * 3.7 - uInkTime * 4.1 );
  return h + rip * fresh * 0.035 * h;
}

float inkField( sampler2D tex, vec2 uv, float mScale, out vec4 s, out vec2 m ) {
  s = texture2D( tex, uv );
  m = uv * mScale;
  float n = texture2D( uNoiseTex, m * 0.17 ).g * 0.82 + texture2D( uNoiseTex, m * 0.55 ).b * 0.18;
  return s.r + s.g + ( n - 0.5 ) * 0.36;
}

InkPaint inkEvalPaint( sampler2D tex, vec2 uv, float mScale ) {
  InkPaint P;
  vec2 dx = dFdx( uv );
  vec2 dy = dFdy( uv );
  vec4 s0; vec4 sx; vec4 sy; vec2 m0; vec2 mx; vec2 my;
  float v0 = inkField( tex, uv, mScale, s0, m0 );
  float vx = inkField( tex, uv + dx, mScale, sx, mx );
  float vy = inkField( tex, uv + dy, mScale, sy, my );
  float cov = s0.r + s0.g;
  float stamp = s0.b / max( cov, 1e-3 );
  float fresh = ( 1.0 - smoothstep( 0.0, uDryTime, uPaintTime - stamp ) ) * step( 0.03, cov );
  float w = clamp( fwidth( v0 ) * 0.85, 0.012, 0.25 );
  P.mask = smoothstep( 0.5 - w, 0.5 + w, v0 );
  P.teamB = smoothstep( -0.05, 0.05, s0.g - s0.r );
  P.fresh = fresh;
  P.edge = 1.0 - smoothstep( 0.5, 0.66, v0 );
  float h0 = inkHeight( v0, m0, fresh );
  P.dH = vec2( inkHeight( vx, mx, fresh ) - h0, inkHeight( vy, my, fresh ) - h0 );
  return P;
}
`;

const FRAG_PARS = /* glsl */ `
uniform float uInkTime;
uniform float uPaintTime;
uniform vec3 uSunColorLin;
uniform float uSunLum;
uniform vec3 uSunDirW;
uniform vec3 uRimColor;
uniform sampler2D uNoiseTex;
uniform vec3 uTeamA;
uniform vec3 uTeamB;
uniform vec3 uTeamAGlow;
uniform vec3 uTeamBGlow;
uniform float uDryTime;
uniform float uPaintBump;
uniform float uPaintGlow;
uniform float uFreshGlow;
uniform vec3 uShadowTint;
uniform float uBandSoft;
uniform float uRimStrength;
uniform float uVariation;
uniform float uVariationScale;
uniform float uGrime;
uniform float uGrimeHeight;
uniform float uWear;
uniform vec3 uWearColor;
uniform float uPaintable;
uniform float uFlash;
uniform vec3 uFlashColor;
varying vec3 vInkWorldPos;
varying vec3 vInkWorldNormal;
#ifdef INK_PAINT_GROUND
uniform sampler2D uPaintGround;
uniform vec4 uPaintBounds;
#endif
#ifdef INK_PAINT_ATLAS
uniform sampler2D uPaintAtlas;
uniform float uAtlasMeters;
varying vec2 vPaintUV;
#endif
#ifdef INK_EDGEWEAR
varying float vInkEdge;
#endif
#ifdef INK_OVERLAY
uniform sampler2D uOverlayTex;
uniform sampler2D uWetTex;
#endif

float inkToonRamp( float x ) {
  float s = uBandSoft;
  float b1 = smoothstep( 0.03, 0.03 + s * 1.5, x );
  float b2 = smoothstep( 0.42, 0.42 + s, x );
  return 0.52 * b1 + 0.48 * b2;
}

float inkTriNoise( vec3 p, vec3 n, float sc ) {
  vec3 w = pow( abs( n ), vec3( 4.0 ) );
  w /= ( w.x + w.y + w.z + 1e-5 );
  float a = texture2D( uNoiseTex, p.zy * sc ).r;
  float b = texture2D( uNoiseTex, p.xz * sc ).r;
  float c = texture2D( uNoiseTex, p.xy * sc ).r;
  return a * w.x + b * w.y + c * w.z;
}

vec3 inkPerturb( vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir ) {
  vec3 vSigmaX = dFdx( surfPos );
  vec3 vSigmaY = dFdy( surfPos );
  vec3 R1 = cross( vSigmaY, surfNorm );
  vec3 R2 = cross( surfNorm, vSigmaX );
  float fDet = dot( vSigmaX, R1 ) * faceDir;
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( fDet ) * surfNorm - vGrad );
}

${PAINT_GLSL}
`;

// Código tras <color_fragment>: variación, suciedad, desgaste y pintura
const FRAG_ALBEDO = /* glsl */ `
vec3 inkWN = normalize( vInkWorldNormal );
float inkMask = 0.0;
float inkFresh = 0.0;
float inkEdge = 0.0;
vec3 inkCol = vec3( 0.0 );
vec2 inkDH = vec2( 0.0 );
float inkNoiseV = 0.5;
float inkWet = 0.0;
#ifdef INK_VARIATION
  inkNoiseV = inkTriNoise( vInkWorldPos, inkWN, uVariationScale );
  float inkFine = inkTriNoise( vInkWorldPos, inkWN, uVariationScale * 6.1 );
  diffuseColor.rgb *= 1.0 + ( inkNoiseV - 0.5 ) * uVariation + ( inkFine - 0.5 ) * uVariation * 0.45;
#endif
#if defined( INK_SLABS ) && defined( USE_MAP )
{
  // variación de tono por losa (las juntas coinciden con los bordes del tile)
  vec2 slab = floor( vMapUv + 0.0001 );
  float hs = fract( sin( dot( slab, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  float hs2 = fract( sin( dot( slab, vec2( 39.3468, 11.135 ) ) ) * 24634.6345 );
  diffuseColor.rgb *= 0.93 + hs * 0.12;
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.04, 0.99, 0.93 ), step( 0.7, hs2 ) );
}
#endif
#ifdef INK_GRIME
  float inkGrime = 1.0 - smoothstep( 0.0, uGrimeHeight, vInkWorldPos.y + ( inkNoiseV - 0.5 ) * 0.35 );
  diffuseColor.rgb *= 1.0 - inkGrime * uGrime;
#endif
#ifdef INK_EDGEWEAR
  float inkW = smoothstep( 0.35, 0.75, vInkEdge + ( inkNoiseV - 0.5 ) * 0.9 );
  diffuseColor.rgb = mix( diffuseColor.rgb, uWearColor, inkW * uWear );
#endif
#if defined( INK_OVERLAY ) && defined( INK_PAINT_GROUND )
{
  vec2 ovUV = ( vInkWorldPos.xz - uPaintBounds.xy ) * uPaintBounds.zw;
  ovUV.x = 1.0 - ovUV.x; // el lienzo del overlay es una vista cenital (+X a la izquierda)
  float upW = smoothstep( 0.6, 0.92, inkWN.y );
  vec4 ov = texture2D( uOverlayTex, ovUV );
  diffuseColor.rgb = mix( diffuseColor.rgb, ov.rgb, ov.a * upW );
  inkWet = texture2D( uWetTex, ovUV ).r * upW;
  diffuseColor.rgb *= 1.0 - inkWet * 0.28;
}
#endif
#if defined( INK_PAINT_GROUND ) || defined( INK_PAINT_ATLAS )
{
  float wG = 0.0;
  float wA = 0.0;
  InkPaint PG; PG.mask = 0.0; PG.teamB = 0.0; PG.fresh = 0.0; PG.edge = 0.0; PG.dH = vec2( 0.0 );
  InkPaint PA = PG;
  #ifdef INK_PAINT_GROUND
    vec2 inkGUV = ( vInkWorldPos.xz - uPaintBounds.xy ) * uPaintBounds.zw;
    PG = inkEvalPaint( uPaintGround, inkGUV, 1.0 / uPaintBounds.z );
    wG = smoothstep( 0.45, 0.8, inkWN.y );
    wG *= step( 0.0, inkGUV.x ) * step( inkGUV.x, 1.0 ) * step( 0.0, inkGUV.y ) * step( inkGUV.y, 1.0 );
  #endif
  #ifdef INK_PAINT_ATLAS
    PA = inkEvalPaint( uPaintAtlas, vPaintUV, uAtlasMeters );
    wA = ( 1.0 - smoothstep( 0.45, 0.8, abs( inkWN.y ) ) ) * step( 0.0, vPaintUV.x );
  #endif
  wG *= uPaintable;
  wA *= uPaintable;
  float wsum = wG + wA;
  if ( wsum > 0.0 ) {
    float fg = wG / wsum;
    inkMask = mix( PA.mask, PG.mask, fg ) * clamp( wsum, 0.0, 1.0 );
    float teamB = mix( PA.teamB, PG.teamB, fg );
    inkFresh = mix( PA.fresh, PG.fresh, fg );
    inkEdge = mix( PA.edge, PG.edge, fg );
    inkDH = ( PA.dH * wA + PG.dH * wG );
    inkCol = mix( uTeamA, uTeamB, teamB );
  }
  float inkVar = texture2D( uNoiseTex, vInkWorldPos.xz * 0.37 + vInkWorldPos.y * 0.21 ).r;
  vec3 paintAlbedo = inkCol * ( 0.9 + 0.2 * inkVar ) * ( 1.0 - 0.22 * inkEdge );
  diffuseColor.rgb = mix( diffuseColor.rgb, paintAlbedo, inkMask );
}
#endif
// INK_ALBEDO_END
`;

const FRAG_ROUGH = /* glsl */ `
roughnessFactor = mix( roughnessFactor, 0.07, inkWet );
roughnessFactor = mix( roughnessFactor, mix( 0.2, 0.06, inkFresh ), inkMask );
`;

const FRAG_METAL = /* glsl */ `
metalnessFactor *= ( 1.0 - inkMask );
`;

const FRAG_NORMAL_BEGIN = /* glsl */ `
vec3 inkGeoNormal = normal;
`;

const FRAG_NORMAL = /* glsl */ `
#if defined( INK_PAINT_GROUND ) || defined( INK_PAINT_ATLAS )
if ( inkMask > 0.001 ) {
  normal = normalize( mix( normal, inkGeoNormal, inkMask ) );
  normal = inkPerturb( - vViewPosition, normal, inkDH * uPaintBump * inkMask, faceDirection );
}
#endif
`;

const FRAG_EMISSIVE = /* glsl */ `
#if defined( INK_PAINT_GROUND ) || defined( INK_PAINT_ATLAS )
if ( inkMask > 0.001 ) {
  // relieve "emboss" en pantalla: brillo fino en el borde superior de cada
  // mancha y sombra en el inferior (lectura de líquido espeso)
  float inkEmb = -inkDH.y * 5.0 + inkDH.x * 1.5;
  float inkHi = smoothstep( 0.12, 0.45, inkEmb );
  float inkLo = smoothstep( 0.12, 0.45, -inkEmb );
  diffuseColor.rgb *= 1.0 - inkLo * 0.38 * inkMask;
  // destello del sol y de una luz clave ligada a la cámara, umbralizados
  vec3 inkV = normalize( vViewPosition );
  vec3 inkSunV = normalize( ( viewMatrix * vec4( uSunDirW, 0.0 ) ).xyz );
  float inkS2 = pow( max( dot( normal, normalize( inkSunV + inkV ) ), 0.0 ), 160.0 );
  float inkS = pow( max( dot( normal, normalize( vec3( 0.25, 0.9, 0.35 ) + inkV ) ), 0.0 ), 90.0 );
  float inkWetK = mix( 0.55, 1.0, inkFresh );
  float inkHL = inkHi * 0.85 + ( smoothstep( 0.55, 0.7, inkS2 ) * 0.7 + smoothstep( 0.7, 0.8, inkS ) * 0.2 * inkFresh ) * inkWetK;
  totalEmissiveRadiance += vec3( 1.0, 0.97, 0.93 ) * inkHL * inkMask;
  totalEmissiveRadiance += inkCol * inkMask * ( uPaintGlow + inkFresh * uFreshGlow );
}
#endif
`;

const FRAG_RIM = /* glsl */ `
vec3 inkRim = vec3( 0.0 );
#ifdef INK_RIM
{
  vec3 inkV = normalize( vViewPosition );
  float fr = pow( 1.0 - saturate( dot( normal, inkV ) ), 3.0 );
  float sunSide = 0.45 + 0.55 * saturate( dot( inkWN, uSunDirW ) * 0.5 + 0.5 );
  inkRim = uRimColor * smoothstep( 0.25, 0.75, fr ) * uRimStrength * sunSide;
}
#endif
`;

const FRAG_LIGHTS_END = /* glsl */ `
#if defined( INK_PAINT_GROUND ) || defined( INK_PAINT_ATLAS )
  // el color de equipo manda: el reflejo del cielo se atenúa sobre la pintura
  reflectedLight.indirectSpecular *= 1.0 - inkMask * ( 0.75 - inkFresh * 0.25 );
#endif
`;

function patchLightsChunk() {
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const target = 'vec3 irradiance = dotNL * directLight.color;';
  if (!src.includes(target)) {
    throw new Error('ToonMaterial: no se encontró el punto de inyección de iluminación');
  }
  // La luz direccional (sol) es la única luz directa del juego: se extrae el
  // término de sombra de la luminancia recibida y se cuantiza junto al N·L.
  const toon = /* glsl */ `
	float inkShadowTerm = saturate( dot( directLight.color, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( uSunLum, 1e-4 ) );
	float inkLit = min( dotNL * 1.15, inkShadowTerm );
	vec3 irradiance = inkToonRamp( inkLit ) * uSunColorLin;`;
  return src.replace(target, toon);
}

let TOON_LIGHTS_CHUNK = null;

export function applyToonPatch(shader, mat) {
  if (!TOON_LIGHTS_CHUNK) TOON_LIGHTS_CHUNK = patchLightsChunk();
  Object.assign(shader.uniforms, sharedUniforms, mat.userData.inkUniforms);

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + VERT_MAIN);

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
    .replace('#include <lights_physical_pars_fragment>', TOON_LIGHTS_CHUNK)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_ALBEDO)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + FRAG_METAL)
    .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n' + FRAG_NORMAL_BEGIN)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE)
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_LIGHTS_END)
    .replace(
      'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
      FRAG_RIM +
        '\n\tvec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance + inkRim;' +
        '\n#ifdef INK_FLASH\n\toutgoingLight = mix( outgoingLight, uFlashColor, uFlash );\n#endif'
    );
}

function toonOnBeforeCompile(shader) {
  applyToonPatch(shader, this);
}

/**
 * Crea un material toon.
 * @param {object} o
 *  color, map, normalMap, normalScale, roughness, metalness, emissive, emissiveIntensity,
 *  emissiveMap, envMapIntensity, vertexColors, transparent, opacity, side,
 *  rim (0..1), variation (0..1), variationScale, grime (0..1), grimeHeight,
 *  wear (0..1), wearColor, paint: 'none' | 'ground' | 'atlas' | 'both'
 */
export function createToonMaterial(o = {}) {
  const params = {
    color: o.color !== undefined ? o.color : 0xffffff,
    roughness: o.roughness !== undefined ? o.roughness : 0.6,
    metalness: o.metalness !== undefined ? o.metalness : 0,
    envMapIntensity: o.envMapIntensity !== undefined ? o.envMapIntensity : 0.55,
    vertexColors: !!o.vertexColors,
    transparent: !!o.transparent,
    opacity: o.opacity !== undefined ? o.opacity : 1,
    side: o.side !== undefined ? o.side : THREE.FrontSide,
    flatShading: !!o.flatShading
  };
  if (o.map) params.map = o.map;
  if (o.normalMap) {
    params.normalMap = o.normalMap;
    params.normalScale = o.normalScale || new THREE.Vector2(1, 1);
  }
  if (o.roughnessMap) params.roughnessMap = o.roughnessMap;
  if (o.emissive !== undefined) params.emissive = o.emissive;
  if (o.emissiveIntensity !== undefined) params.emissiveIntensity = o.emissiveIntensity;
  if (o.emissiveMap) params.emissiveMap = o.emissiveMap;
  if (o.alphaTest !== undefined) params.alphaTest = o.alphaTest;
  if (o.depthWrite !== undefined) params.depthWrite = o.depthWrite;

  const mat = new THREE.MeshStandardMaterial(params);
  mat.name = o.name || 'toon';

  const defines = { INK_TOON: '' };
  const rim = o.rim !== undefined ? o.rim : 0;
  const variation = o.variation !== undefined ? o.variation : 0.18;
  const grime = o.grime !== undefined ? o.grime : 0;
  const wear = o.wear !== undefined ? o.wear : 0;
  if (rim > 0) defines.INK_RIM = '';
  if (variation > 0) defines.INK_VARIATION = '';
  if (grime > 0) defines.INK_GRIME = '';
  if (wear > 0) defines.INK_EDGEWEAR = '';
  const paint = o.paint || 'none';
  if (paint === 'ground' || paint === 'both') defines.INK_PAINT_GROUND = '';
  if (paint === 'atlas' || paint === 'both') defines.INK_PAINT_ATLAS = '';
  if (o.overlay) defines.INK_OVERLAY = '';
  if (o.slabs) defines.INK_SLABS = '';
  if (o.flash) defines.INK_FLASH = '';
  mat.defines = defines;

  mat.userData.inkUniforms = {
    uRimStrength: { value: rim },
    uVariation: { value: variation },
    uVariationScale: { value: o.variationScale !== undefined ? o.variationScale : 0.11 },
    uGrime: { value: grime },
    uGrimeHeight: { value: o.grimeHeight !== undefined ? o.grimeHeight : 0.9 },
    uWear: { value: wear },
    uWearColor: { value: new THREE.Color(o.wearColor !== undefined ? o.wearColor : 0xe9e2d4) },
    uPaintable: { value: o.paintable !== undefined ? o.paintable : 1 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1.6, 1.6, 1.6) }
  };
  mat.onBeforeCompile = toonOnBeforeCompile;
  return mat;
}

/** Ajusta dinámicamente un uniform propio de un material toon. */
export function setToonUniform(mat, name, value) {
  const u = mat.userData.inkUniforms && mat.userData.inkUniforms[name];
  if (!u) return;
  if (u.value && u.value.set && value !== undefined && typeof value !== 'number') u.value.copy(value);
  else u.value = value;
}

/** Actualiza la información del sol usada por la rampa toon. */
export function setSunUniforms(light) {
  const c = sharedUniforms.uSunColorLin.value;
  c.copy(light.color).multiplyScalar(light.intensity);
  sharedUniforms.uSunLum.value = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const d = sharedUniforms.uSunDirW.value;
  d.copy(light.position).sub(light.target.position).normalize();
}
