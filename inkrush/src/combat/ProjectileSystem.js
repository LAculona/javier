// Pooled ink projectiles rendered with one InstancedMesh per team.
import * as THREE from 'three';
import { TEAM, TEAM_INFO } from '../core/config.js';
import { makeHit } from '../world/CollisionWorld.js';

const MAX = 900;
const _dir = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _hit = makeHit();

// Closest distance² between segment p0->p1 and vertical segment (x, y0..y1, z)
function segToAxisDist2(p0, p1, x, z, y0, y1) {
  // Sample-based (short segments): check endpoints and midpoint projections
  let best = Infinity, bestT = 0;
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const px = p0.x + (p1.x - p0.x) * t, py = p0.y + (p1.y - p0.y) * t, pz = p0.z + (p1.z - p0.z) * t;
    const cy = Math.max(y0, Math.min(py, y1));
    const d2 = (px - x) ** 2 + (py - cy) ** 2 + (pz - z) ** 2;
    if (d2 < best) { best = d2; bestT = t; }
  }
  return [best, bestT];
}

export class ProjectileSystem {
  constructor(scene, game) {
    this.game = game;
    this.pool = [];
    this.active = [];
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.meshes = {};
    for (const team of [TEAM.ORANGE, TEAM.BLUE]) {
      const c = new THREE.Color(TEAM_INFO[team].color);
      const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.2 });
      const mesh = new THREE.InstancedMesh(geo, mat, MAX);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes[team] = mesh;
    }
    for (let i = 0; i < MAX; i++) this.pool.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), prev: new THREE.Vector3() });
    this.splatSoundCd = 0;
  }

  clear() {
    while (this.active.length) this.pool.push(this.active.pop());
  }

  spawn(o) {
    const p = this.pool.pop();
    if (!p) return null;
    p.pos.copy(o.pos);
    p.vel.copy(o.vel);
    p.team = o.team;
    p.owner = o.owner;
    p.damage = o.damage ?? 0;
    p.size = o.size ?? 0.15;
    p.splatRadius = o.splatRadius ?? 0.8;
    p.straightTime = o.straightTime ?? 0.3;
    p.trailEvery = o.trailEvery ?? 0;
    p.trailRadius = o.trailRadius ?? 0.4;
    p.trailT = 0;
    p.droplet = !!o.droplet;
    p.age = 0;
    this.active.push(p);
    return p;
  }

  update(dt) {
    const g = this.game;
    this.splatSoundCd -= dt;
    const chars = g.characters;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;
      const falling = p.age > p.straightTime;
      p.vel.y -= (p.droplet ? 22 : falling ? 30 : 3) * dt;
      if (falling && !p.droplet) {
        const drag = Math.exp(-1.8 * dt);
        p.vel.x *= drag; p.vel.z *= drag;
      }
      p.prev.copy(p.pos);
      const len = p.vel.length() * dt;
      _dir.copy(p.vel).normalize();

      let hitT = Infinity, hitChar = null;
      // Characters
      if (!p.droplet) {
        _b.copy(p.pos).addScaledVector(_dir, len);
        for (const c of chars) {
          if (!c.alive || c.team === p.team) continue;
          const cp = c.motor.pos;
          if (Math.abs(cp.x - p.pos.x) > len + 1.5 || Math.abs(cp.z - p.pos.z) > len + 1.5) continue;
          const r = 0.5 + p.size;
          const [d2, t] = segToAxisDist2(p.pos, _b, cp.x, cp.z, cp.y + 0.35, cp.y + 1.5);
          if (d2 < r * r && t * len < hitT) { hitT = t * len; hitChar = c; }
        }
      }
      // World
      const wh = g.world.raycast(p.pos, _dir, len, _hit);
      if (wh && wh.t < hitT) {
        hitChar = null;
        hitT = wh.t;
      }

      if (hitChar) {
        p.pos.addScaledVector(_dir, hitT);
        const dmg = falling ? p.damage * 0.55 : p.damage;
        g.damageCharacter(hitChar, dmg, p.owner, _a.copy(_dir));
        g.fx.hitBurst(p.pos, p.team);
        this.release(i);
        continue;
      }
      if (wh) {
        _a.copy(wh.point).addScaledVector(wh.normal, 0.02);
        const radius = p.droplet ? p.trailRadius : p.splatRadius;
        const m2 = g.paint.splat(_a, radius, p.team);
        if (p.owner) p.owner.stats.paint += m2;
        if (!p.droplet) {
          g.fx.splash(_a, wh.normal, p.team, 5);
          if (this.splatSoundCd <= 0) {
            g.audio.play('splat', _a, 0.35);
            this.splatSoundCd = 0.05;
          }
        }
        this.release(i);
        continue;
      }
      p.pos.addScaledVector(_dir, len);

      if (p.trailEvery > 0) {
        p.trailT += dt;
        if (p.trailT >= p.trailEvery) {
          p.trailT = 0;
          this.spawn({ pos: p.pos, vel: _a.set(p.vel.x * 0.1, -1, p.vel.z * 0.1), team: p.team, owner: p.owner, droplet: true, size: 0.07, trailRadius: p.trailRadius });
        }
      }
      if (p.age > 3 || p.pos.y < -5) this.release(i);
    }
    this.render();
  }

  release(i) {
    const p = this.active[i];
    this.active[i] = this.active[this.active.length - 1];
    this.active.pop();
    this.pool.push(p);
  }

  render() {
    const counts = { [TEAM.ORANGE]: 0, [TEAM.BLUE]: 0 };
    for (const p of this.active) {
      const mesh = this.meshes[p.team];
      const speed = p.vel.length();
      _dir.copy(p.vel).divideScalar(speed || 1);
      _q.setFromUnitVectors(_z, _dir);
      const stretch = p.droplet ? 1.4 : Math.min(2.6, 1 + speed * 0.04);
      _s.set(p.size, p.size, p.size * stretch);
      _m.compose(p.pos, _q, _s);
      mesh.setMatrixAt(counts[p.team]++, _m);
    }
    for (const t of [TEAM.ORANGE, TEAM.BLUE]) {
      this.meshes[t].count = counts[t];
      this.meshes[t].instanceMatrix.needsUpdate = true;
    }
  }
}
