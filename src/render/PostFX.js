import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  Effect,
  EffectAttribute,
  BlendFunction,
  BloomEffect,
  SMAAEffect,
  SMAAPreset,
  EdgeDetectionMode,
  VignetteEffect,
  ToneMappingEffect,
  ToneMappingMode,
  LUT3DEffect,
  LookupTexture,
  ChromaticAberrationEffect
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

// ─────────────────────────────────────────────────────────────
//  Contornos: aristas por discontinuidad de 1/z (exacto para planos) y
//  por pliegue de normales reconstruidas. El color del contorno es el del
//  propio píxel multiplicado por un tinte lila oscuro → nunca negro puro.
// ─────────────────────────────────────────────────────────────
const outlineFrag = /* glsl */ `
uniform vec3 uTint;
uniform float uStrength;
uniform float uDepthThreshold;
uniform float uNormalThreshold;
uniform vec2 uProjScale;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform float uThickness;

float linZ( const in vec2 uv ) {
  return max( -getViewZ( readDepth( uv ) ), 1e-3 );
}

vec3 vpos( const in vec2 uv, const in float z ) {
  return vec3( ( uv * 2.0 - 1.0 ) * uProjScale * z, -z );
}

void mainImage( const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor ) {
  if ( depth >= 0.99999 ) { outputColor = inputColor; return; }
  vec2 o = texelSize * uThickness;
  float z0 = max( -getViewZ( depth ), 1e-3 );
  float zl = linZ( uv - vec2( o.x, 0.0 ) );
  float zr = linZ( uv + vec2( o.x, 0.0 ) );
  float zd = linZ( uv - vec2( 0.0, o.y ) );
  float zu = linZ( uv + vec2( 0.0, o.y ) );
  // segunda diferencia de 1/z (nula en planos, positiva en siluetas cercanas)
  float w0 = 1.0 / z0;
  float lapH = 2.0 - ( 1.0 / zl + 1.0 / zr ) / w0;
  float lapV = 2.0 - ( 1.0 / zd + 1.0 / zu ) / w0;
  float dEdge = smoothstep( uDepthThreshold, uDepthThreshold * 2.0, max( lapH, lapV ) );
  // pliegues
  vec3 p0 = vpos( uv, z0 );
  vec3 pl = vpos( uv - vec2( o.x, 0.0 ), zl );
  vec3 pr = vpos( uv + vec2( o.x, 0.0 ), zr );
  vec3 pd = vpos( uv - vec2( 0.0, o.y ), zd );
  vec3 pu = vpos( uv + vec2( 0.0, o.y ), zu );
  vec3 nF = normalize( cross( pr - p0, pu - p0 ) );
  vec3 nB = normalize( cross( p0 - pl, p0 - pd ) );
  float crease = 1.0 - dot( nF, nB );
  float nEdge = smoothstep( uNormalThreshold, uNormalThreshold * 1.8, crease );
  // sólo pliegues sin gran salto de profundidad (evita halos dobles)
  float rel = abs( zl - zr ) + abs( zu - zd );
  nEdge *= 1.0 - smoothstep( 0.08, 0.25, rel / z0 );
  float edge = max( dEdge, nEdge );
  edge *= 1.0 - smoothstep( uFadeStart, uFadeEnd, z0 );
  vec3 col = mix( inputColor.rgb, inputColor.rgb * uTint, clamp( edge * uStrength, 0.0, 1.0 ) );
  outputColor = vec4( col, inputColor.a );
}
`;

export class OutlineEffect extends Effect {
  constructor(camera, o = {}) {
    super('InkOutlineEffect', outlineFrag, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ['uTint', new THREE.Uniform(new THREE.Color(o.tint || 0x3a2c58).multiplyScalar(0.55))],
        ['uStrength', new THREE.Uniform(o.strength !== undefined ? o.strength : 0.85)],
        ['uDepthThreshold', new THREE.Uniform(o.depthThreshold !== undefined ? o.depthThreshold : 0.035)],
        ['uNormalThreshold', new THREE.Uniform(o.normalThreshold !== undefined ? o.normalThreshold : 0.32)],
        ['uProjScale', new THREE.Uniform(new THREE.Vector2(1, 1))],
        ['uFadeStart', new THREE.Uniform(o.fadeStart || 38)],
        ['uFadeEnd', new THREE.Uniform(o.fadeEnd || 95)],
        ['uThickness', new THREE.Uniform(o.thickness || 1)]
      ])
    });
    this.camera = camera;
  }

  update() {
    const p = this.camera.projectionMatrix.elements;
    this.uniforms.get('uProjScale').value.set(1 / p[0], 1 / p[5]);
  }
}

// LUT de gradación procedural (dominio sRGB): contraste en S, saturación,
// split-toning cálido/lila y negros levantados hacia lila.
function makeGradeLUT(size = 32) {
  const lut = LookupTexture.createNeutral(size);
  const data = lut.image.data;
  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // saturación / vibrancia
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const sat = maxc - minc;
    const vib = 1.16 + (1 - sat) * 0.12;
    r = lum + (r - lum) * vib;
    g = lum + (g - lum) * vib;
    b = lum + (b - lum) * vib;
    // contraste en S
    const s = (x) => x + (x * x * (3 - 2 * x) - x) * 0.38;
    r = s(Math.min(1, Math.max(0, r)));
    g = s(Math.min(1, Math.max(0, g)));
    b = s(Math.min(1, Math.max(0, b)));
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sh = 1 - sm(0.0, 0.45, lum);
    const hi = sm(0.55, 1.0, lum);
    r += -0.012 * sh + 0.03 * hi;
    g += -0.016 * sh + 0.012 * hi;
    b += 0.032 * sh - 0.022 * hi;
    // negros levantados (tinte lila) → nunca negro puro
    r = 0.028 + r * (1 - 0.028);
    g = 0.02 + g * (1 - 0.02);
    b = 0.05 + b * (1 - 0.05);
    data[i] = Math.min(1, Math.max(0, r));
    data[i + 1] = Math.min(1, Math.max(0, g));
    data[i + 2] = Math.min(1, Math.max(0, b));
  }
  lut.needsUpdate = true;
  return lut;
}

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0
    });

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.aoPass = new N8AOPostPass(scene, camera, size.x, size.y);
    this.aoPass.configuration.aoRadius = 1.7;
    this.aoPass.configuration.distanceFalloff = 1.0;
    this.aoPass.configuration.intensity = 2.4;
    this.aoPass.configuration.color = new THREE.Color(0x3a2a55);
    this.aoPass.configuration.gammaCorrection = false;
    this.aoPass.setQualityMode('Low');
    this.composer.addPass(this.aoPass);

    this.outline = new OutlineEffect(camera);
    this.bloom = new BloomEffect({
      intensity: 1.05,
      luminanceThreshold: 1.05,
      luminanceSmoothing: 0.35,
      mipmapBlur: true,
      radius: 0.72,
      levels: 6
    });
    this.fxPass = new EffectPass(camera, this.outline, this.bloom);
    this.composer.addPass(this.fxPass);

    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
    this.lut = new LUT3DEffect(makeGradeLUT(32), { tetrahedralInterpolation: true });
    this.gradePass = new EffectPass(camera, this.toneMapping, this.vignette, this.lut);
    this.composer.addPass(this.gradePass);

    this.chroma = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0, 0),
      radialModulation: true,
      modulationOffset: 0.25
    });
    this.chromaPass = new EffectPass(camera, this.chroma);
    this.chromaPass.enabled = false;
    this.composer.addPass(this.chromaPass);

    this.smaa = new SMAAEffect({ preset: SMAAPreset.MEDIUM, edgeDetectionMode: EdgeDetectionMode.COLOR });
    this.smaaPass = new EffectPass(camera, this.smaa);
    this.composer.addPass(this.smaaPass);

    this.damagePulse = 0;
  }

  setScene(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.renderPass.mainScene = scene;
    this.renderPass.mainCamera = camera;
    this.aoPass.scene = scene;
    this.aoPass.camera = camera;
    this.fxPass.mainCamera = camera;
    this.gradePass.mainCamera = camera;
    this.chromaPass.mainCamera = camera;
    this.smaaPass.mainCamera = camera;
    this.outline.camera = camera;
  }

  applyPreset(p) {
    this.aoPass.enabled = !!p.ao;
    this.aoPass.configuration.halfRes = !!p.aoHalfRes;
    this.aoPass.setQualityMode(p.aoHalfRes ? 'Low' : 'Medium');
    this.bloom.enabled = p.bloom !== false;
    this.bloom.resolution.height = p.bloomResolution || 360;
    const preset = p.smaa === 'HIGH' ? SMAAPreset.HIGH : p.smaa === 'LOW' ? SMAAPreset.LOW : SMAAPreset.MEDIUM;
    this.smaa.applyPreset(preset);
    this.outline.uniforms.get('uStrength').value = p.outlines === false ? 0 : 0.85;
  }

  /** Pulso de daño: aberración cromática muy leve que se desvanece. */
  hit(amount = 1) {
    this.damagePulse = Math.min(1, this.damagePulse + 0.6 * amount);
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
  }

  render(dt) {
    if (this.damagePulse > 0.001) {
      this.damagePulse = Math.max(0, this.damagePulse - dt * 2.8);
      const k = this.damagePulse * this.damagePulse * 0.0045;
      this.chroma.offset.set(k, k * 0.6);
      this.chromaPass.enabled = true;
    } else if (this.chromaPass.enabled) {
      this.chroma.offset.set(0, 0);
      this.chromaPass.enabled = false;
    }
    this.outline.update();
    this.composer.render(dt);
  }
}
