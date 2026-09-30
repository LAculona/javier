// PaintSystem
// Visual paint: every paintable face owns a rectangle in a single GPU atlas
// (render target). Splats are rendered into the atlas as instanced quads with
// a procedural blob shader, so painting costs one draw call per frame.
// Gameplay paint: a coarse CPU grid (0.5 m cells) mirrors ownership for
// territory %, movement modifiers, ink refill and bot decisions.
import * as THREE from 'three';
import { TEAM, TEAM_INFO, PAINT } from '../core/config.js';

const MAX_BATCH = 1024;
const GUTTER = 4;

const splatVert = /* glsl */`
attribute vec2 iCenter;
attribute float iRadius;
attribute vec4 iClip;
attribute float iTeam;
attribute float iSeed;
varying vec2 vLocal;
varying vec2 vPix;
varying vec4 vClip;
varying float vTeam;
varying float vSeed;
void main() {
  vLocal = position.xy * 1.4;
  vec2 pix = iCenter + vLocal * iRadius;
  vPix = pix; vClip = iClip; vTeam = iTeam; vSeed = iSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pix, 0.0, 1.0);
}`;

const splatFrag = /* glsl */`
varying vec2 vLocal;
varying vec2 vPix;
varying vec4 vClip;
varying float vTeam;
varying float vSeed;
void main() {
  if (vPix.x < vClip.x || vPix.y < vClip.y || vPix.x > vClip.z || vPix.y > vClip.w) discard;
  float r = length(vLocal);
  float ang = atan(vLocal.y, vLocal.x);
  float s = vSeed * 6.2831;
  float edge = 0.8 + 0.09 * sin(ang * 3.0 + s) + 0.06 * sin(ang * 5.0 + s * 2.3) + 0.04 * sin(ang * 11.0 + s * 4.1);
  float a = 1.0 - smoothstep(edge - 0.16, edge + 0.02, r);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float aa = s * 1.7 + fi * 2.1;
    vec2 c = vec2(cos(aa), sin(aa)) * (0.98 + 0.2 * fract(vSeed * (7.0 + fi * 3.0)));
    float rr = 0.12 + 0.1 * fract(vSeed * (13.0 + fi * 5.0));
    a = max(a, 1.0 - smoothstep(rr - 0.09, rr + 0.02, length(vLocal - c)));
  }
  if (a < 0.01) discard;
  vec3 col = vTeam < 1.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  gl_FragColor = vec4(col, a);
}`;

const _p = new THREE.Vector3();

export class PaintSystem {
  constructor(renderer, faces, collisionWorld) {
    this.renderer = renderer;
    this.faces = faces;
    this.size = PAINT.atlasSize;
    this.cellSize = PAINT.cellSize;
    this.counts = [0, 0, 0];
    this.total = 0;
    this.pack();
    this.buildGrids(collisionWorld);

    this.rt = new THREE.WebGLRenderTarget(this.size, this.size, {
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // Splat batch (instanced quads in atlas pixel space)
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aCenter = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BATCH * 2), 2);
    this.aRadius = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BATCH), 1);
    this.aClip = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BATCH * 4), 4);
    this.aTeam = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BATCH), 1);
    this.aSeed = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BATCH), 1);
    for (const a of [this.aCenter, this.aRadius, this.aClip, this.aTeam, this.aSeed]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iCenter', this.aCenter);
    g.setAttribute('iRadius', this.aRadius);
    g.setAttribute('iClip', this.aClip);
    g.setAttribute('iTeam', this.aTeam);
    g.setAttribute('iSeed', this.aSeed);
    g.instanceCount = 0;
    this.splatGeo = g;
    const m = new THREE.ShaderMaterial({
      vertexShader: splatVert,
      fragmentShader: splatFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.splatMesh = new THREE.Mesh(g, m);
    this.splatMesh.frustumCulled = false;
    this.splatScene = new THREE.Scene();
    this.splatScene.add(this.splatMesh);
    this.splatCam = new THREE.OrthographicCamera(0, this.size, this.size, 0, -1, 1);
    this.batch = 0;
    this.clear();
  }

  // Shelf-pack every face into the atlas, shrinking texel density until it fits.
  pack() {
    let density = 14;
    const order = [...this.faces].sort((a, b) => b.H * 1000 + b.W - (a.H * 1000 + a.W));
    for (let attempt = 0; attempt < 30; attempt++) {
      let x = GUTTER, y = GUTTER, shelfH = 0, ok = true;
      for (const f of order) {
        const w = Math.ceil(f.W * density), h = Math.ceil(f.H * density);
        if (x + w + GUTTER > this.size) { x = GUTTER; y += shelfH + GUTTER; shelfH = 0; }
        if (w + 2 * GUTTER > this.size || y + h + GUTTER > this.size) { ok = false; break; }
        f.rect = { x, y, w, h };
        x += w + GUTTER;
        shelfH = Math.max(shelfH, h);
      }
      if (ok) { this.density = density; return; }
      density *= 0.92;
    }
    throw new Error('Paint atlas overflow');
  }

  buildGrids(world) {
    const cs = this.cellSize;
    const tmpList = [];
    for (const f of this.faces) {
      f.cols = Math.max(1, Math.ceil(f.W / cs));
      f.rows = Math.max(1, Math.ceil(f.H / cs));
      f.grid = new Uint8Array(f.cols * f.rows);
      if (!f.countable) continue;
      for (let j = 0; j < f.rows; j++) {
        for (let i = 0; i < f.cols; i++) {
          _p.copy(f.O).addScaledVector(f.U, (i + 0.5) * cs).addScaledVector(f.V, (j + 0.5) * cs);
          const y = _p.y + 0.05;
          let blocked = false;
          for (const c of world.query(_p.x, _p.z, _p.x, _p.z, tmpList)) {
            if (c.type === 'box' && c.min.y <= y && c.max.y > y &&
              _p.x > c.min.x && _p.x < c.max.x && _p.z > c.min.z && _p.z < c.max.z) { blocked = true; break; }
          }
          if (blocked) f.grid[j * f.cols + i] = 255;
          else this.total++;
        }
      }
    }
    this.countableFaces = this.faces.filter((f) => f.countable);
  }

  clear() {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    this.batch = 0;
    for (const f of this.faces) {
      const g = f.grid;
      for (let i = 0; i < g.length; i++) if (g[i] !== 255) g[i] = 0;
    }
    this.counts[1] = this.counts[2] = 0;
  }

  // Paint a sphere of influence. Returns m² newly claimed (for scoring).
  splat(point, radius, team, seed = Math.random()) {
    let changed = 0;
    for (const f of this.faces) {
      _p.subVectors(point, f.O);
      const d = _p.dot(f.N);
      if (d > radius || d < -0.2) continue;
      const rr = Math.sqrt(Math.max(0, radius * radius - d * d));
      if (rr < 0.05) continue;
      const u = _p.dot(f.U), v = _p.dot(f.V);
      if (u + rr < 0 || u - rr > f.W || v + rr < 0 || v - rr > f.H) continue;
      this.queue(f, u, v, rr, team, seed);
      changed += this.stamp(f, u, v, rr * 0.88, team);
    }
    return changed * this.cellSize * this.cellSize;
  }

  queue(f, u, v, rr, team, seed) {
    if (this.batch >= MAX_BATCH) this.flush();
    const i = this.batch++;
    const dens = this.density;
    this.aCenter.array[i * 2] = f.rect.x + u * dens;
    this.aCenter.array[i * 2 + 1] = f.rect.y + v * dens;
    this.aRadius.array[i] = Math.max(1.5, rr * dens);
    this.aClip.array[i * 4] = f.rect.x - 1.5;
    this.aClip.array[i * 4 + 1] = f.rect.y - 1.5;
    this.aClip.array[i * 4 + 2] = f.rect.x + f.rect.w + 1.5;
    this.aClip.array[i * 4 + 3] = f.rect.y + f.rect.h + 1.5;
    this.aTeam.array[i] = team;
    this.aSeed.array[i] = (seed * 7.31 + i * 0.137) % 1;
  }

  stamp(f, u, v, r, team) {
    const cs = this.cellSize;
    const i0 = Math.max(0, Math.floor((u - r) / cs)), i1 = Math.min(f.cols - 1, Math.floor((u + r) / cs));
    const j0 = Math.max(0, Math.floor((v - r) / cs)), j1 = Math.min(f.rows - 1, Math.floor((v + r) / cs));
    const r2 = r * r;
    let changed = 0;
    for (let j = j0; j <= j1; j++) {
      const dv = (j + 0.5) * cs - v;
      for (let i = i0; i <= i1; i++) {
        const du = (i + 0.5) * cs - u;
        if (du * du + dv * dv > r2) continue;
        const k = j * f.cols + i;
        const old = f.grid[k];
        if (old === 255 || old === team) continue;
        f.grid[k] = team;
        if (f.countable) {
          if (old) this.counts[old]--;
          this.counts[team]++;
          changed++;
        }
      }
    }
    return changed;
  }

  flush() {
    if (this.batch === 0) return;
    for (const a of [this.aCenter, this.aRadius, this.aClip, this.aTeam, this.aSeed]) a.needsUpdate = true;
    this.splatGeo.instanceCount = this.batch;
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.rt);
    r.render(this.splatScene, this.splatCam);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    this.batch = 0;
  }

  cellOwner(f, u, v) {
    if (u < 0 || v < 0 || u > f.W || v > f.H) return -1;
    const i = Math.min(f.cols - 1, Math.floor(u / this.cellSize));
    const j = Math.min(f.rows - 1, Math.floor(v / this.cellSize));
    const o = f.grid[j * f.cols + i];
    return o === 255 ? 0 : o;
  }

  // Ownership of the walkable surface under a point.
  ownerAt(point, maxDist = 0.35) {
    let best = -1, bestD = Infinity;
    for (const f of this.countableFaces) {
      _p.subVectors(point, f.O);
      const d = _p.dot(f.N);
      if (d < -0.2 || d > maxDist) continue;
      const ad = Math.abs(d);
      if (ad >= bestD) continue;
      const o = this.cellOwner(f, _p.dot(f.U), _p.dot(f.V));
      if (o < 0) continue;
      best = o; bestD = ad;
    }
    return best < 0 ? TEAM.NONE : best;
  }

  // Ownership of a wall surface facing `normal` near `point`.
  ownerAtWall(point, normal, maxDist = 0.8) {
    for (const f of this.faces) {
      if (f.countable || f.N.dot(normal) < 0.7) continue;
      _p.subVectors(point, f.O);
      const d = _p.dot(f.N);
      if (d < -0.1 || d > maxDist) continue;
      const o = this.cellOwner(f, _p.dot(f.U), _p.dot(f.V));
      if (o >= 0) return o;
    }
    return TEAM.NONE;
  }

  percentages() {
    const t = Math.max(1, this.total);
    return { [TEAM.ORANGE]: (this.counts[1] / t) * 100, [TEAM.BLUE]: (this.counts[2] / t) * 100 };
  }

  // Material for the arena: standard PBR + paint atlas overlay.
  createWorldMaterial(detailMap) {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detailMap,
      roughness: 0.78,
      metalness: 0.05,
    });
    const orange = new THREE.Color(TEAM_INFO[1].color);
    const blue = new THREE.Color(TEAM_INFO[2].color);
    const paintTex = this.rt.texture;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.paintMap = { value: paintTex };
      shader.uniforms.inkA = { value: orange };
      shader.uniforms.inkB = { value: blue };
      shader.uniforms.paintTexel = { value: 1 / this.size };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 paintUv;\nvarying vec2 vPaintUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPaintUv = paintUv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D paintMap;
uniform vec3 inkA;
uniform vec3 inkB;
uniform float paintTexel;
varying vec2 vPaintUv;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
vec2 pnt = texture2D(paintMap, vPaintUv).rg;
float cov = pnt.r + pnt.g;
float aa = max(fwidth(cov), 0.02);
float pMask = smoothstep(0.5 - aa, 0.5 + aa, cov);
float tA = smoothstep(0.4, 0.6, pnt.r / (cov + 1e-4));
vec3 inkCol = mix(inkB, inkA, tA);
float inner = smoothstep(0.55, 0.95, cov);
inkCol *= mix(0.78, 1.0, inner);
float pnx = texture2D(paintMap, vPaintUv + vec2(paintTexel * 2.0, 0.0)).r + texture2D(paintMap, vPaintUv + vec2(paintTexel * 2.0, 0.0)).g;
float pny = texture2D(paintMap, vPaintUv + vec2(0.0, paintTexel * 2.0)).r + texture2D(paintMap, vPaintUv + vec2(0.0, paintTexel * 2.0)).g;
float shine = clamp((pnx - cov) * 1.5 + (pny - cov) * 1.5, -0.4, 0.4);
inkCol *= 1.0 + shine * 0.5;
diffuseColor.rgb = mix(diffuseColor.rgb, inkCol, pMask);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.22, pMask);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += inkCol * 0.1 * pMask;`);
    };
    return mat;
  }

  // ---------- minimap ----------
  buildMinimapIndex(width, height, toPix) {
    this.mini = { width, height, faces: [] };
    const faces = [...this.countableFaces].sort((a, b) => a.O.y - b.O.y);
    const cs = this.cellSize;
    for (const f of faces) {
      const idx = new Int32Array(f.cols * f.rows);
      for (let j = 0; j < f.rows; j++) {
        for (let i = 0; i < f.cols; i++) {
          _p.copy(f.O).addScaledVector(f.U, (i + 0.5) * cs).addScaledVector(f.V, (j + 0.5) * cs);
          const [px, py] = toPix(_p.x, _p.z);
          idx[j * f.cols + i] = px >= 0 && py >= 0 && px < width && py < height ? py * width + px : -1;
        }
      }
      const shade = Math.min(1, 0.55 + f.O.y * 0.09);
      this.mini.faces.push({ f, idx, shade });
    }
  }

  fillMinimap(data) {
    const O2 = [(TEAM_INFO[1].color >> 16) & 255, (TEAM_INFO[1].color >> 8) & 255, TEAM_INFO[1].color & 255];
    const B2 = [(TEAM_INFO[2].color >> 16) & 255, (TEAM_INFO[2].color >> 8) & 255, TEAM_INFO[2].color & 255];
    for (let i = 0; i < data.length; i += 4) { data[i] = 20; data[i + 1] = 22; data[i + 2] = 38; data[i + 3] = 200; }
    for (const { f, idx, shade } of this.mini.faces) {
      const g = f.grid;
      const base = Math.round(90 + 110 * shade);
      for (let k = 0; k < g.length; k++) {
        const p = idx[k];
        if (p < 0) continue;
        const o = g[k], q = p * 4;
        if (o === 1) { data[q] = O2[0]; data[q + 1] = O2[1]; data[q + 2] = O2[2]; }
        else if (o === 2) { data[q] = B2[0]; data[q + 1] = B2[1]; data[q + 2] = B2[2]; }
        else if (o === 255) { data[q] = 60; data[q + 1] = 64; data[q + 2] = 92; }
        else { data[q] = base * 0.62; data[q + 1] = base * 0.64; data[q + 2] = base * 0.74; }
        data[q + 3] = 235;
      }
    }
  }
}
