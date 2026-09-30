import * as THREE from 'three';
import { createToonMaterial } from '../render/ToonMaterial.js';
import { COLORS, PLAYER } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  Projectile · glóbulos de pintura
//  Pool fijo + InstancedMesh (cuerpo y estela de gotas). Deformación
//  elástica según la velocidad con temblor, gravedad real tras el alcance,
//  gotas de rastro en el suelo, impactos contra suelo/paredes/personajes.
// ─────────────────────────────────────────────────────────────

const MAX = 320;
const TRAIL = 3; // gotas de estela por proyectil

function blobMaterial() {
  const m = createToonMaterial({ name: 'projectile', color: 0xffffff, roughness: 0.12, envMapIntensity: 1.2, rim: 0.6, variation: 0, paint: 'none' });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = function (shader) {
    base.call(this, shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n\ttotalEmissiveRadiance += vColor.rgb * 0.9;\n#endif'
    );
  };
  m.customProgramCacheKey = () => 'ink-projectile';
  return m;
}

export class ProjectileSystem {
  constructor(scene, collision, paint, particles) {
    this.collision = collision;
    this.paint = paint;
    this.particles = particles;
    this.onHit = null; // (projectile, character, isHead, point) → void
    this.characters = [];
    const geo = new THREE.IcosahedronGeometry(1, 2);
    this.mesh = new THREE.InstancedMesh(geo, blobMaterial(), MAX * (1 + TRAIL));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.name = 'projectiles';
    scene.add(this.mesh);
    this.list = [];
    for (let i = 0; i < MAX; i++) {
      this.list.push({
        alive: false,
        owner: null,
        team: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        px: 0,
        py: 0,
        pz: 0,
        g: 0,
        dropG: 30,
        range: 20,
        dist: 0,
        damage: 0,
        critMult: 1,
        falloff: 0,
        splat: 1,
        size: 0.15,
        trailEvery: 0,
        trailRadius: 0.5,
        nextTrail: 0,
        age: 0,
        weapon: '',
        hist: new Float32Array(TRAIL * 3)
      });
    }
    this.active = 0;
    this._hit = {};
    this._c = new THREE.Color();
    this.teamColors = [new THREE.Color(COLORS.team[0].main), new THREE.Color(COLORS.team[1].main)];
  }

  clear() {
    for (const p of this.list) p.alive = false;
    this.mesh.count = 0;
  }

  spawn(o) {
    let p = null;
    for (const q of this.list) {
      if (!q.alive) {
        p = q;
        break;
      }
    }
    if (!p) {
      // pool lleno: reciclar el más viejo
      p = this.list.reduce((a, b) => (a.age > b.age ? a : b));
    }
    p.alive = true;
    p.owner = o.owner;
    p.team = o.team;
    p.x = p.px = o.x;
    p.y = p.py = o.y;
    p.z = p.pz = o.z;
    p.vx = o.vx;
    p.vy = o.vy;
    p.vz = o.vz;
    p.g = o.gravity || 0;
    p.dropG = o.dropGravity || 32;
    p.range = o.range || 20;
    p.dist = 0;
    p.damage = o.damage || 0;
    p.critMult = o.critMult || 1;
    p.falloff = o.falloff || 0;
    p.splat = o.splat || 1;
    p.size = o.size || 0.15;
    p.trailEvery = o.trailEvery || 0;
    p.trailRadius = o.trailRadius || 0.5;
    p.nextTrail = p.trailEvery * (0.4 + Math.random() * 0.6);
    p.age = 0;
    p.weapon = o.weapon || '';
    for (let k = 0; k < TRAIL; k++) {
      p.hist[k * 3] = o.x;
      p.hist[k * 3 + 1] = o.y;
      p.hist[k * 3 + 2] = o.z;
    }
    return p;
  }

  update(dt) {
    const c = this.collision;
    const hit = this._hit;
    for (const p of this.list) {
      if (!p.alive) continue;
      p.age += dt;
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      // gravedad suave y caída fuerte al superar el alcance
      const g = p.dist > p.range ? p.dropG : p.g;
      p.vy -= g * dt;
      if (p.dist > p.range) {
        p.vx *= Math.exp(-1.2 * dt);
        p.vz *= Math.exp(-1.2 * dt);
      }
      const sx = p.vx * dt;
      const sy = p.vy * dt;
      const sz = p.vz * dt;
      const len = Math.hypot(sx, sy, sz);
      if (len < 1e-6) continue;
      const dx = sx / len;
      const dy = sy / len;
      const dz = sz / len;
      // personajes
      let bestT = len;
      let target = null;
      let head = false;
      for (const ch of this.characters) {
        if (!ch.alive || ch.team === p.team || ch.invulnerable) continue;
        const cp = ch.motor.pos;
        const bodyT = raySphere(p.x, p.y, p.z, dx, dy, dz, cp.x, cp.y + 0.62, cp.z, 0.46 + p.size * 0.5);
        if (bodyT >= 0 && bodyT < bestT) {
          bestT = bodyT;
          target = ch;
          head = false;
        }
        const headT = raySphere(p.x, p.y, p.z, dx, dy, dz, cp.x, cp.y + 1.2, cp.z, 0.33 + p.size * 0.5);
        if (headT >= 0 && headT <= bestT + 0.05) {
          bestT = headT;
          target = ch;
          head = true;
        }
      }
      // mundo
      const w = c.raycast(p.x, p.y, p.z, dx, dy, dz, bestT, projFilter, hit);
      if (w) {
        this.impactWorld(p, w, dx, dy, dz);
        p.alive = false;
        continue;
      }
      if (target) {
        const hx = p.x + dx * bestT;
        const hy = p.y + dy * bestT;
        const hz = p.z + dz * bestT;
        this.impactCharacter(p, target, head, hx, hy, hz, dx, dz);
        p.alive = false;
        continue;
      }
      p.x += sx;
      p.y += sy;
      p.z += sz;
      p.dist += len;
      // gotas de rastro bajo la trayectoria
      if (p.trailEvery > 0) {
        p.nextTrail -= len;
        if (p.nextTrail <= 0) {
          p.nextTrail += p.trailEvery * (0.7 + Math.random() * 0.6);
          const h = this.paint.cellHeight ? this.paint.cellHeight(p.x, p.z) : 0;
          if (h > -50 && p.y - h < 3.2) {
            this.paint.stampGround(p.x, h, p.z, p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { shape: 'drop', owner: p.owner });
          }
        }
      }
      // agua / fuera del mundo
      if (p.y < PLAYER.waterLevel || p.age > 4) {
        if (p.y < PLAYER.waterLevel + 0.3 && this.particles) this.particles.water(p.x, PLAYER.waterLevel, p.z);
        p.alive = false;
        continue;
      }
      // historial de la estela
      for (let k = TRAIL - 1; k > 0; k--) {
        p.hist[k * 3] = p.hist[(k - 1) * 3];
        p.hist[k * 3 + 1] = p.hist[(k - 1) * 3 + 1];
        p.hist[k * 3 + 2] = p.hist[(k - 1) * 3 + 2];
      }
      p.hist[0] = p.px;
      p.hist[1] = p.py;
      p.hist[2] = p.pz;
    }
    this.writeInstances();
  }

  impactWorld(p, w, dx, dy, dz) {
    const s = w.solid;
    const team = p.team;
    const color = this.teamColors[team];
    const hx = w.x;
    const hy = w.y;
    const hz = w.z;
    const rot = Math.atan2(dz, dx);
    const speed = Math.hypot(p.vx, p.vz);
    if (w.ny > 0.6) {
      if (s.groundPaint) {
        const shape = speed > 18 && Math.abs(dy) < 0.6 ? 'streak' : 'round';
        this.paint.stampGround(hx, hy, hz, p.splat, team, { rot, shape, stretch: shape === 'streak' ? 1.15 : 1, owner: p.owner });
      }
    } else if (Math.abs(w.ny) < 0.5) {
      if (s.faces && s.faces[w.face]) {
        // en la pared: orientar el reguero hacia abajo (gravedad) con algo de ruido
        this.paint.stampWall(s, w.face, hx, hy, hz, p.splat * 0.95, team, { rot: -Math.PI / 2 + (Math.random() - 0.5) * 0.9, shape: Math.random() < 0.5 ? 'streak' : 'round', stretch: 1.1 });
      }
      // goteo al pie de la pared
      const ground = this.paint.cellHeight ? this.paint.cellHeight(hx + w.nx * 0.4, hz + w.nz * 0.4) : 0;
      if (ground > -50 && hy - ground < 1.4) {
        this.paint.stampGround(hx + w.nx * 0.35, ground, hz + w.nz * 0.35, p.splat * 0.55, team, { shape: 'drop', owner: p.owner });
      }
    }
    if (this.particles) {
      this.particles.splash(hx + w.nx * 0.05, hy + w.ny * 0.05, hz + w.nz * 0.05, color, team, p.weapon === 'splasher' ? 5 : 9, 4 + p.splat * 2, w.nx, w.ny, w.nz, 0.2);
    }
    if (this.onWorldHit) this.onWorldHit(p, hx, hy, hz);
  }

  impactCharacter(p, ch, head, hx, hy, hz, dx, dz) {
    const color = this.teamColors[p.team];
    if (this.particles) this.particles.splash(hx, hy, hz, color, p.team, 8, 4, -dx, 0.4, -dz, 0.3);
    // la pintura gotea a los pies del alcanzado
    const cp = ch.motor.pos;
    this.paint.stampGround(cp.x + (Math.random() - 0.5) * 0.6, cp.y, cp.z + (Math.random() - 0.5) * 0.6, p.splat * 0.6, p.team, { owner: p.owner });
    let dmg = p.damage;
    if (p.falloff > 0) {
      const k = Math.min(1, p.dist / p.range);
      dmg *= 1 - k * p.falloff;
    }
    if (head) dmg *= p.critMult;
    if (this.onHit) this.onHit(p, ch, head && p.critMult > 1, dmg, hx, hy, hz);
  }

  writeInstances() {
    const m = this.mesh.instanceMatrix.array;
    const col = this.mesh.instanceColor.array;
    let n = 0;
    for (const p of this.list) {
      if (!p.alive) continue;
      const tc = this.teamColors[p.team];
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      const wob = 1 + Math.sin(p.age * 38) * 0.12;
      const stretch = (1 + Math.min(0.9, sp * 0.02)) * wob;
      n = writeBlob(m, col, n, p.x, p.y, p.z, p.vx, p.vy, p.vz, sp, p.size * 0.72, stretch, tc.r * 1.1, tc.g * 1.1, tc.b * 1.1);
      for (let k = 0; k < TRAIL; k++) {
        const f = 1 - (k + 1) / (TRAIL + 1);
        const hx = p.hist[k * 3];
        const hy = p.hist[k * 3 + 1];
        const hz = p.hist[k * 3 + 2];
        n = writeBlob(m, col, n, hx, hy, hz, p.vx, p.vy, p.vz, sp, p.size * (0.22 + 0.32 * f), 1 + Math.min(1.4, sp * 0.03), tc.r * 1.3, tc.g * 1.3, tc.b * 1.3);
      }
    }
    this.mesh.count = n;
    if (n > 0) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.clearUpdateRanges();
      this.mesh.instanceColor.addUpdateRange(0, n * 3);
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

function writeBlob(m, col, n, x, y, z, vx, vy, vz, sp, s, stretch, r, g, b) {
  const o = n * 16;
  if (sp > 1e-3) {
    const yx = vx / sp;
    const yy = vy / sp;
    const yz = vz / sp;
    let ax = yy;
    let ay = -yx;
    let az = 0;
    let al = Math.hypot(ax, ay);
    if (al < 1e-3) {
      ax = 1;
      ay = 0;
      al = 1;
    }
    ax /= al;
    ay /= al;
    const zx = ay * yz - az * yy;
    const zy = az * yx - ax * yz;
    const zz = ax * yy - ay * yx;
    const sx = s / Math.sqrt(stretch);
    const sy = s * stretch;
    m[o] = ax * sx;
    m[o + 1] = ay * sx;
    m[o + 2] = az * sx;
    m[o + 4] = yx * sy;
    m[o + 5] = yy * sy;
    m[o + 6] = yz * sy;
    m[o + 8] = zx * sx;
    m[o + 9] = zy * sx;
    m[o + 10] = zz * sx;
  } else {
    m[o] = s;
    m[o + 1] = 0;
    m[o + 2] = 0;
    m[o + 4] = 0;
    m[o + 5] = s;
    m[o + 6] = 0;
    m[o + 8] = 0;
    m[o + 9] = 0;
    m[o + 10] = s;
  }
  m[o + 3] = 0;
  m[o + 7] = 0;
  m[o + 11] = 0;
  m[o + 12] = x;
  m[o + 13] = y;
  m[o + 14] = z;
  m[o + 15] = 1;
  col[n * 3] = r;
  col[n * 3 + 1] = g;
  col[n * 3 + 2] = b;
  return n + 1;
}

// distancia a lo largo del rayo (dir normalizada) hasta la esfera, o -1
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx;
  const ly = oy - cy;
  const lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  if (c < 0) return 0;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}

function projFilter(s) {
  return s.blocksProjectiles;
}

export { raySphere };
