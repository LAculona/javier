// Pooled particle effects: ink droplets, smoke, shock rings and spawn beams.
import * as THREE from 'three';
import { TEAM_INFO } from '../core/config.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

class ParticleLayer {
  constructor(scene, geo, mat, max) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color(), life: 0, max: 1, size: 1, grow: 0, gravity: 0, drag: 0 });
    this.n = 0;
  }

  emit(pos, vel, color, life, size, gravity = 18, grow = 0, drag = 0) {
    if (this.n >= this.max) return;
    const p = this.items[this.n++];
    p.pos.copy(pos); p.vel.copy(vel); p.color.copy(color);
    p.life = p.max = life; p.size = size; p.gravity = gravity; p.grow = grow; p.drag = drag;
  }

  update(dt, floorFn) {
    let i = 0;
    while (i < this.n) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.n--;
        const last = this.items[this.n];
        this.items[this.n] = p;
        this.items[i] = last;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (floorFn && p.pos.y < 0.03 && p.vel.y < 0) { p.pos.y = 0.03; p.vel.set(0, 0, 0); }
      i++;
    }
    for (let k = 0; k < this.n; k++) {
      const p = this.items[k];
      const t = p.life / p.max;
      const sz = p.size * (p.grow ? 1 + (1 - t) * p.grow : Math.min(1, t * 3));
      _s.set(sz, sz, sz);
      _m.compose(p.pos, _q.identity(), _s);
      this.mesh.setMatrixAt(k, _m);
      this.mesh.setColorAt(k, p.color);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.n = 0; this.mesh.count = 0; }
}

export class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.scale = 1;
    this.drops = new ParticleLayer(scene, new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.25, emissive: 0x222222 }), 900);
    this.smoke = new ParticleLayer(scene, new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, opacity: 0.3, depthWrite: false }), 160);
    this.sparks = new ParticleLayer(scene, new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ toneMapped: false }), 300);

    this.rings = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 1, max: 3 });
    }
    this.beams = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 14, 20, 1, true),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
      m.visible = false;
      scene.add(m);
      this.beams.push({ mesh: m, t: 0, dur: 1 });
    }
  }

  n(k) { return Math.max(1, Math.round(k * this.scale)); }

  splash(pos, normal, team, count = 6) {
    _c.setHex(TEAM_INFO[team].color);
    for (let i = 0; i < this.n(count); i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4).addScaledVector(normal, 3 + Math.random() * 3);
      this.drops.emit(pos, _v, _c, 0.35 + Math.random() * 0.3, 0.05 + Math.random() * 0.06, 20);
    }
  }

  hitBurst(pos, team) {
    _c.setHex(TEAM_INFO[team].color);
    for (let i = 0; i < this.n(8); i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(7);
      this.drops.emit(pos, _v, _c, 0.4 + Math.random() * 0.3, 0.06 + Math.random() * 0.06, 18);
    }
    _c.setHex(0xffffff);
    for (let i = 0; i < this.n(4); i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6);
      this.sparks.emit(pos, _v, _c, 0.2, 0.06, 0);
    }
  }

  muzzle(pos, dir, team) {
    _c.setHex(TEAM_INFO[team].glow);
    for (let i = 0; i < this.n(2); i++) {
      _v.copy(dir).multiplyScalar(4 + Math.random() * 3).add(_s.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2));
      this.drops.emit(pos, _v, _c, 0.15, 0.04, 6);
    }
  }

  puff(pos, count = 3, color = 0xdddde8, size = 0.35) {
    _c.setHex(color);
    for (let i = 0; i < this.n(count); i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(1.6);
      _s.copy(pos).addScaledVector(_v, 0.3);
      this.smoke.emit(_s, _v, _c, 0.6 + Math.random() * 0.4, size, -0.6, 2.2, 1.5);
    }
  }

  landing(pos) { this.puff(pos, 4, 0xe8e6f0, 0.22); }

  death(pos, team, killerTeam) {
    _c.setHex(TEAM_INFO[killerTeam].color);
    for (let i = 0; i < this.n(46); i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 7);
      this.drops.emit(_s.copy(pos).setY(pos.y + 1), _v, _c, 0.7 + Math.random() * 0.5, 0.08 + Math.random() * 0.12, 16);
    }
    _c.setHex(TEAM_INFO[team].color);
    for (let i = 0; i < this.n(16); i++) {
      _v.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(6);
      this.drops.emit(_s.copy(pos).setY(pos.y + 1), _v, _c, 0.6, 0.1, 14);
    }
    this.puff(_s.copy(pos).setY(pos.y + 0.8), 8, 0xcfc8e8, 0.55);
    this.ring(pos, TEAM_INFO[killerTeam].color, 4.5, 0.6);
  }

  respawn(pos, team) {
    const b = this.beams.find((x) => !x.mesh.visible) || this.beams[0];
    b.mesh.visible = true;
    b.mesh.material.color.setHex(TEAM_INFO[team].glow);
    b.mesh.position.copy(pos).setY(pos.y + 7);
    b.t = 0; b.dur = 1.1;
    this.ring(pos, TEAM_INFO[team].color, 3, 0.8);
    _c.setHex(TEAM_INFO[team].glow);
    for (let i = 0; i < this.n(24); i++) {
      const a = Math.random() * Math.PI * 2;
      _v.set(Math.cos(a) * 2, 3 + Math.random() * 5, Math.sin(a) * 2);
      _s.set(pos.x + Math.cos(a) * 0.6, pos.y + 0.2, pos.z + Math.sin(a) * 0.6);
      this.sparks.emit(_s, _v, _c, 0.8, 0.07, 2);
    }
  }

  ring(pos, color, max, dur) {
    const r = this.rings.find((x) => !x.mesh.visible) || this.rings[0];
    r.mesh.visible = true;
    r.mesh.material.color.setHex(color);
    r.mesh.position.copy(pos).setY(pos.y + 0.15);
    r.mesh.rotation.set(Math.PI / 2, 0, 0);
    r.t = 0; r.dur = dur; r.max = max;
  }

  clear() {
    this.drops.clear(); this.smoke.clear(); this.sparks.clear();
    for (const r of this.rings) r.mesh.visible = false;
    for (const b of this.beams) b.mesh.visible = false;
  }

  update(dt) {
    this.drops.update(dt, true);
    this.smoke.update(dt, false);
    this.sparks.update(dt, false);
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { r.mesh.visible = false; continue; }
      const s = 0.3 + (r.max - 0.3) * (1 - (1 - k) * (1 - k));
      r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = 1 - k;
    }
    for (const b of this.beams) {
      if (!b.mesh.visible) continue;
      b.t += dt;
      const k = b.t / b.dur;
      if (k >= 1) { b.mesh.visible = false; continue; }
      b.mesh.material.opacity = Math.sin(k * Math.PI) * 0.55;
      b.mesh.scale.set(1 - k * 0.6, 1, 1 - k * 0.6);
      b.mesh.rotation.y += dt * 4;
    }
  }
}
