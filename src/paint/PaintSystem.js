import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { generateStampAtlas, createStampMaterial, createHeightMaterial, STAMP } from './SplatShader.js';
import { PaintAtlas } from './PaintAtlas.js';
import { sharedUniforms } from '../render/ToonMaterial.js';
import { PAINT } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  PaintSystem · pintura 100% en GPU, sin un objeto por mancha
//  · Suelo y superficies horizontales: splat map en espacio mundo (XZ)
//  · Paredes: atlas de caras con rect por superficie (PaintAtlas)
//  · Sellos procedurales instanciados con prueba de altura por texel
//  · Rejilla CPU de 0,5 m espejo de la GPU para consultas de juego
//    (velocidad, surf, daño por pintura enemiga, IA)
// ─────────────────────────────────────────────────────────────

const MAX = PAINT.maxStampsPerFrame;
const CELL = 0.5;

class StampBatch {
  constructor(material) {
    const geo = new THREE.InstancedBufferGeometry();
    const corners = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
    geo.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.params = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.extra = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.clip = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    for (const a of [this.center, this.params, this.extra, this.clip]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iCenterRad', this.center);
    geo.setAttribute('iParams', this.params);
    geo.setAttribute('iExtra', this.extra);
    geo.setAttribute('iClip', this.clip);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.count = 0;
  }

  push(cu, cv, ru, rv, rot, idx, team, strength, y, stretch, time, clip) {
    if (this.count >= MAX) return false;
    const i = this.count * 4;
    const c = this.center.array;
    const p = this.params.array;
    const e = this.extra.array;
    const k = this.clip.array;
    c[i] = cu;
    c[i + 1] = cv;
    c[i + 2] = ru;
    c[i + 3] = rv;
    p[i] = rot;
    p[i + 1] = idx;
    p[i + 2] = team;
    p[i + 3] = strength;
    e[i] = y;
    e[i + 1] = stretch;
    e[i + 2] = time;
    e[i + 3] = 0;
    if (clip) {
      k[i] = clip.x;
      k[i + 1] = clip.y;
      k[i + 2] = clip.rw;
      k[i + 3] = clip.rh;
    } else {
      k[i] = 0;
      k[i + 1] = 0;
      k[i + 2] = 1;
      k[i + 3] = 1;
    }
    this.count++;
    return true;
  }

  flush(renderer, target, camera) {
    if (this.count === 0) return;
    this.geo.instanceCount = this.count;
    for (const a of [this.center, this.params, this.extra, this.clip]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.count * 4);
      a.needsUpdate = true;
    }
    renderer.setRenderTarget(target);
    renderer.render(this.scene, camera);
    this.count = 0;
  }
}

export class PaintSystem {
  constructor(renderer, collision, atlas) {
    this.renderer = renderer;
    this.collision = collision;
    this.atlas = atlas;
    const b = PAINT.bounds;
    this.bounds = b;
    this.sizeX = b.maxX - b.minX;
    this.sizeZ = b.maxZ - b.minZ;
    this.time = 0; // tiempo de pintura (segundos desde el inicio de la partida)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.stamps = generateStampAtlas(512);
    this.quality = null;
    this.ground = null;
    this.wall = null;
    this.heightRT = null;
    // rejilla CPU
    this.gw = Math.ceil(this.sizeX / CELL);
    this.gh = Math.ceil(this.sizeZ / CELL);
    this.cpuO = new Float32Array(this.gw * this.gh);
    this.cpuB = new Float32Array(this.gw * this.gh);
    this.cpuH = new Float32Array(this.gw * this.gh);
    this.cpuFloor = new Uint8Array(this.gw * this.gh);
    this.buildCpuHeight();
    this.painted = [0, 0]; // m² aproximados pintados por equipo (estadística)
    this.onStamp = null;
    this._fc = { u: 0, v: 0 };
    this._uv = { x: 0, y: 0 };
  }

  // ── configuración de resolución (presets) ─────────────────
  setQuality(q) {
    if (this.quality === q) return;
    this.quality = q;
    const gd = PAINT.groundDensity[q];
    const wd = PAINT.wallDensity[q];
    const gW = Math.round(this.sizeX * gd);
    const gH = Math.round(this.sizeZ * gd);
    const aW = Math.min(4096, Math.round(this.atlas.size * wd));
    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false
    };
    const old = { ground: this.ground, wall: this.wall };
    this.ground = new THREE.WebGLRenderTarget(gW, gH, opts);
    this.wall = new THREE.WebGLRenderTarget(aW, aW, opts);
    // mapa de alturas cenital con la misma resolución que el suelo
    if (this.heightRT) this.heightRT.dispose();
    this.heightRT = new THREE.WebGLRenderTarget(gW, gH, { ...opts, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.renderHeightMap();
    this.groundMat = createStampMaterial({ stamps: this.stamps.texture, height: this.heightRT.texture, heightTol: PAINT.heightTolerance, useHeight: true, useClip: false });
    this.wallMat = createStampMaterial({ stamps: this.stamps.texture, height: this.heightRT.texture, heightTol: 1, useHeight: false, useClip: true });
    if (this.groundBatch) {
      this.groundBatch.mesh.material.dispose();
      this.wallBatch.mesh.material.dispose();
      this.groundBatch.mesh.material = this.groundMat;
      this.wallBatch.mesh.material = this.wallMat;
    } else {
      this.groundBatch = new StampBatch(this.groundMat);
      this.wallBatch = new StampBatch(this.wallMat);
    }
    this.clear();
    // copiar la pintura existente al cambiar de calidad a mitad de partida
    if (old.ground) {
      this.copyInto(old.ground, this.ground);
      this.copyInto(old.wall, this.wall);
      old.ground.dispose();
      old.wall.dispose();
    }
    sharedUniforms.uPaintGround.value = this.ground.texture;
    sharedUniforms.uPaintAtlas.value = this.wall.texture;
    sharedUniforms.uAtlasMeters.value = this.atlas.size;
  }

  copyInto(src, dst) {
    if (!this._copyMat) {
      this._copyMat = new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv); }',
        depthTest: false,
        depthWrite: false
      });
      this._copyScene = new THREE.Scene();
      this._copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._copyMat));
    }
    this._copyMat.uniforms.tSrc.value = src.texture;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(dst);
    r.render(this._copyScene, this.camera);
    r.setRenderTarget(prev);
  }

  /** Render cenital de los sólidos: altura (R) y máscara de suelo jugable (G). */
  renderHeightMap() {
    const b = this.bounds;
    const mat = createHeightMaterial(new THREE.Vector4(b.minX, b.minZ, 1 / this.sizeX, 1 / this.sizeZ));
    const scene = new THREE.Scene();
    const geos = [];
    // fondo: "agua" muy baja (sin suelo)
    const water = new THREE.PlaneGeometry(this.sizeX * 2, this.sizeZ * 2);
    water.rotateX(-Math.PI / 2);
    water.translate((b.minX + b.maxX) / 2, -30, (b.minZ + b.maxZ) / 2);
    water.setAttribute('floorFlag', new THREE.Float32BufferAttribute(new Float32Array(water.attributes.position.count), 1));
    geos.push(water);
    for (const s of this.collision.solids) {
      if (!s.walkable && s.tag !== 'building') continue;
      let g;
      if (s.type === 'ramp') {
        g = new THREE.BufferGeometry();
        const hx = s.hx;
        const hz = s.hz;
        const yl = s.yLow - s.cy;
        const yh = s.yHigh - s.cy;
        const y0 = -s.hy;
        const P = [-hx, yl, -hz, hx, yl, -hz, hx, yh, hz, -hx, yh, hz, -hx, y0, -hz, hx, y0, -hz, hx, y0, hz, -hx, y0, hz];
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 1, 4, 1, 0, 5, 6, 2, 5, 2, 1, 6, 7, 3, 6, 3, 2, 7, 4, 0, 7, 0, 3]);
      } else {
        g = new THREE.BoxGeometry(s.hx * 2, s.hy * 2, s.hz * 2);
        g.deleteAttribute('normal');
        g.deleteAttribute('uv');
      }
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(s.cx, s.cy, s.cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.rot, 0)), new THREE.Vector3(1, 1, 1)));
      const n = g.attributes.position.count;
      g.setAttribute('floorFlag', new THREE.Float32BufferAttribute(new Float32Array(n).fill(s.floor ? 1 : 0), 1));
      geos.push(g.index ? g.toNonIndexed() : g);
    }
    geos[0] = geos[0].index ? geos[0].toNonIndexed() : geos[0];
    // una sola geometría y una sola draw call para todo el mapa
    for (const g of geos) {
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'floorFlag') g.deleteAttribute(name);
      }
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.heightRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, this.camera);
    r.setRenderTarget(prev);
    r.setClearColor(prevColor, prevAlpha);
    scene.traverse((o) => o.geometry && o.geometry.dispose());
    mat.dispose();
  }

  buildCpuHeight() {
    const b = this.bounds;
    const res = { height: 0, solid: null };
    for (let j = 0; j < this.gh; j++) {
      for (let i = 0; i < this.gw; i++) {
        const x = b.minX + (i + 0.5) * CELL;
        const z = b.minZ + (j + 0.5) * CELL;
        const h = this.collision.groundHeight(x, z, 0.01, 100, res);
        const k = j * this.gw + i;
        this.cpuH[k] = h;
        this.cpuFloor[k] = res.solid && res.solid.floor ? 1 : 0;
      }
    }
  }

  clear() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    for (const t of [this.ground, this.wall]) {
      if (!t) continue;
      r.setRenderTarget(t);
      r.clear(true, false, false);
    }
    r.setRenderTarget(prev);
    r.setClearColor(prevColor, prevAlpha);
    this.cpuO.fill(0);
    this.cpuB.fill(0);
    this.painted[0] = this.painted[1] = 0;
  }

  // ── API de estampado ───────────────────────────────────────

  /**
   * Mancha en superficie horizontal (x,y,z = punto de impacto).
   * opts: rot, shape ('round'|'streak'|'roller'|'drop'), stretch, strength
   */
  stampGround(x, y, z, radius, team, opts = {}) {
    const shape = opts.shape || 'round';
    const list = shape === 'streak' ? STAMP.STREAK : shape === 'roller' ? STAMP.ROLLER : shape === 'drop' ? STAMP.DROP : STAMP.ROUND;
    const idx = list[(Math.random() * list.length) | 0];
    const rot = opts.rot !== undefined ? opts.rot : Math.random() * Math.PI * 2;
    const stretch = opts.stretch || 1;
    const strength = opts.strength !== undefined ? opts.strength : 1;
    const cu = (x - this.bounds.minX) / this.sizeX;
    const cv = (z - this.bounds.minZ) / this.sizeZ;
    if (cu < -0.05 || cu > 1.05 || cv < -0.05 || cv > 1.05) return;
    this.groundBatch.push(cu, cv, radius / this.sizeX, radius / this.sizeZ, rot, idx, team, strength, y, stretch, this.time, null);
    const area = this.cpuStamp(x, y, z, radius, team, strength, rot, stretch, shape);
    if (this.onStamp && area > 0) this.onStamp(team, area, opts.owner);
  }

  /** Mancha en una cara vertical registrada en el atlas. */
  stampWall(solid, face, x, y, z, radius, team, opts = {}) {
    if (!solid.faces || !solid.faces[face]) return false;
    const f = solid.faces[face];
    const l = solid.toLocal(x, z, this._l || (this._l = { x: 0, z: 0 }));
    PaintAtlas.faceCoords(solid, face, l.x, y - solid.cy, l.z, this._fc);
    const uv = this._uv;
    uv.x = f.x + (this._fc.u / f.w) * f.rw;
    uv.y = f.y + (this._fc.v / f.h) * f.rh;
    const r = radius / this.atlas.size;
    const list = opts.shape === 'streak' ? STAMP.STREAK : STAMP.ROUND;
    const idx = list[(Math.random() * list.length) | 0];
    const rot = opts.rot !== undefined ? opts.rot : Math.random() * Math.PI * 2;
    this.wallBatch.push(uv.x, uv.y, r, r, rot, idx, team, opts.strength !== undefined ? opts.strength : 1, 0, opts.stretch || 1, this.time, f);
    return true;
  }

  // rasterizado aproximado en la rejilla CPU (mismas reglas de mezcla)
  cpuStamp(x, y, z, radius, team, strength, rot, stretch, shape) {
    const b = this.bounds;
    const rx = radius * (shape === 'roller' ? 0.9 * stretch : shape === 'streak' ? 0.8 * stretch : 0.55);
    const rz = radius * (shape === 'roller' ? 0.62 : shape === 'streak' ? 0.5 : 0.55);
    const reach = Math.max(rx, rz);
    const i0 = Math.max(0, Math.floor((x - reach - b.minX) / CELL));
    const i1 = Math.min(this.gw - 1, Math.floor((x + reach - b.minX) / CELL));
    const j0 = Math.max(0, Math.floor((z - reach - b.minZ) / CELL));
    const j1 = Math.min(this.gh - 1, Math.floor((z + reach - b.minZ) / CELL));
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const tol = PAINT.heightTolerance;
    const mine = team === 0 ? this.cpuO : this.cpuB;
    const other = team === 0 ? this.cpuB : this.cpuO;
    let area = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * this.gw + i;
        if (Math.abs(this.cpuH[k] - y) > tol) continue;
        const px = b.minX + (i + 0.5) * CELL - x;
        const pz = b.minZ + (j + 0.5) * CELL - z;
        // al espacio local del sello (x = dirección del sello)
        const lx = px * c + pz * s;
        const lz = -px * s + pz * c;
        const d = (lx / rx) * (lx / rx) + (lz / rz) * (lz / rz);
        if (d > 1) continue;
        const a = strength * (d < 0.6 ? 1 : 1 - (d - 0.6) / 0.4);
        const before = mine[k];
        mine[k] = a + mine[k] * (1 - a);
        other[k] *= 1 - a;
        area += Math.max(0, mine[k] - before);
      }
    }
    this.painted[team] += area * CELL * CELL;
    return area * CELL * CELL;
  }

  /** Altura de la superficie superior en (x,z) según la rejilla CPU. */
  cellHeight(x, z) {
    const i = Math.floor((x - this.bounds.minX) / CELL);
    const j = Math.floor((z - this.bounds.minZ) / CELL);
    if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) return -100;
    return this.cpuH[j * this.gw + i];
  }

  /** Equipo cuya pintura cubre (x,z) según la rejilla CPU, o -1. */
  paintAt(x, z) {
    const i = Math.floor((x - this.bounds.minX) / CELL);
    const j = Math.floor((z - this.bounds.minZ) / CELL);
    if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) return -1;
    const k = j * this.gw + i;
    const o = this.cpuO[k];
    const bb = this.cpuB[k];
    if (o < 0.45 && bb < 0.45) return -1;
    return o >= bb ? 0 : 1;
  }

  /** Datos de celda para la IA: {team, cover, floor, height}. */
  cellAt(x, z, out) {
    const i = Math.floor((x - this.bounds.minX) / CELL);
    const j = Math.floor((z - this.bounds.minZ) / CELL);
    if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) {
      out.floor = 0;
      out.team = -1;
      return out;
    }
    const k = j * this.gw + i;
    out.floor = this.cpuFloor[k];
    out.height = this.cpuH[k];
    const o = this.cpuO[k];
    const bb = this.cpuB[k];
    out.team = o < 0.45 && bb < 0.45 ? -1 : o >= bb ? 0 : 1;
    out.cover = Math.max(o, bb);
    return out;
  }

  /** Vuelca los sellos del fotograma a los render targets (2 draw calls). */
  flush() {
    const r = this.renderer;
    if (this.groundBatch.count === 0 && this.wallBatch.count === 0) return;
    const prev = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    this.groundBatch.flush(r, this.ground, this.camera);
    this.wallBatch.flush(r, this.wall, this.camera);
    r.setRenderTarget(prev);
    r.autoClear = prevAuto;
  }

  update(dt) {
    this.time += dt;
    sharedUniforms.uPaintTime.value = this.time;
  }

  resetTime() {
    this.time = 0;
    sharedUniforms.uPaintTime.value = 0;
  }
}

