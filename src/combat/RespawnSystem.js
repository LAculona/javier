import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bevelBox, cylinder, torus, sphere, trs, prep } from '../world/GeometryKit.js';
import { createToonMaterial } from '../render/ToonMaterial.js';
import { createLiquidMaterial } from '../player/CharacterRig.js';
import { bus } from '../core/EventBus.js';
import { COLORS, PLAYER } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  RespawnSystem
//  · Muerte: el personaje "revienta" en pintura del rival y su tanque sale
//    volando (objeto físico que rebota y se desvanece).
//  · Reaparición: tras 5 s el dron del equipo despega del mástil de la
//    base, vuela sobre la plataforma y suelta al personaje, que cae con
//    una estela y aterriza con squash. Protección temporal al reaparecer.
// ─────────────────────────────────────────────────────────────

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

function merge(parts) {
  const list = parts.map(([g, m, c]) => {
    const gg = g.clone();
    gg.clearGroups();
    if (m) gg.applyMatrix4(m);
    colorize(gg, c);
    for (const name of Object.keys(gg.attributes)) {
      if (!['position', 'normal', 'uv', 'paintUV', 'edge', 'color'].includes(name)) gg.deleteAttribute(name);
    }
    if (!gg.attributes.paintUV) prep(gg);
    return gg;
  });
  return mergeGeometries(list, false);
}

let PROP_MAT = null;
function propMaterial() {
  if (!PROP_MAT) {
    PROP_MAT = createToonMaterial({ name: 'drone', vertexColors: true, roughness: 0.3, metalness: 0.2, envMapIntensity: 0.9, rim: 0.4, variation: 0.03, paint: 'none' });
  }
  return PROP_MAT;
}

/** Dron de reaparición del equipo. */
function buildDrone(team) {
  const tc = COLORS.team[team];
  const g = new THREE.Group();
  const body = merge([
    [sphere(0.42, 20, 14), trs(0, 0, 0, 0, 0, 0, 1.25, 0.55, 1.25), 0xf6f0e6],
    [torus(0.52, 0.06, 8, 28), trs(0, 0, 0, Math.PI / 2, 0, 0), tc.main],
    [bevelBox(0.5, 0.12, 0.5, { bevel: 0.04 }), trs(0, -0.22, 0), 0x3b3350],
    [cylinder(0.05, 0.05, 0.5, 8), trs(0, -0.5, 0), 0x3b3350]
  ]);
  const bodyMesh = new THREE.Mesh(body, propMaterial());
  bodyMesh.castShadow = true;
  g.add(bodyMesh);
  // brazos + rotores
  const rotors = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 0.95;
    const z = Math.sin(a) * 0.95;
    const arm = merge([
      [bevelBox(0.9, 0.08, 0.12, { bevel: 0.03 }), trs(x / 2, 0.05, z / 2, 0, -a, 0), 0x3b3350],
      [cylinder(0.12, 0.14, 0.12, 12), trs(x, 0.08, z), 0xf6f0e6],
      [torus(0.36, 0.035, 6, 24), trs(x, 0.16, z, Math.PI / 2, 0, 0), tc.accent]
    ]);
    const armMesh = new THREE.Mesh(arm, propMaterial());
    armMesh.castShadow = true;
    g.add(armMesh);
    const blades = merge([
      [bevelBox(0.62, 0.015, 0.08, { bevel: 0.006 }), null, 0xe9e2f5],
      [bevelBox(0.08, 0.015, 0.62, { bevel: 0.006 }), null, 0xe9e2f5]
    ]);
    const rotor = new THREE.Mesh(blades, propMaterial());
    rotor.position.set(x, 0.17, z);
    g.add(rotor);
    rotors.push(rotor);
  }
  // pinza
  const claw = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const f = new THREE.Mesh(merge([[bevelBox(0.06, 0.3, 0.06, { bevel: 0.02 }), trs(0, -0.15, 0), tc.main]]), propMaterial());
    f.position.set(Math.cos(a) * 0.12, -0.72, Math.sin(a) * 0.12);
    f.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    claw.add(f);
  }
  g.add(claw);
  // luces
  const lights = new THREE.Mesh(
    merge([
      [sphere(0.07, 8, 6), trs(0.62, -0.05, 0), tc.accent],
      [sphere(0.07, 8, 6), trs(-0.62, -0.05, 0), tc.accent],
      [sphere(0.07, 8, 6), trs(0, -0.05, 0.62), tc.accent],
      [sphere(0.07, 8, 6), trs(0, -0.05, -0.62), tc.accent]
    ]),
    createToonMaterial({ name: 'droneLights', vertexColors: true, color: 0xffffff, emissive: new THREE.Color(tc.accent).multiplyScalar(2.5), roughness: 0.3, variation: 0, paint: 'none' })
  );
  g.add(lights);
  g.userData.rotors = rotors;
  g.userData.claw = claw;
  return g;
}

/** Tanque que sale volando al morir. */
function buildFlyingTank(team) {
  const g = new THREE.Group();
  const liquid = new THREE.Mesh(new THREE.CapsuleGeometry(0.098, 0.2, 5, 14), createLiquidMaterial(COLORS.team[team].main));
  liquid.material.uniforms.uFill.value = 0.55;
  g.add(liquid);
  const glass = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.113, 0.22, 5, 16),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.32, clearcoat: 1, envMapIntensity: 1.5, depthWrite: false })
  );
  glass.renderOrder = 2;
  g.add(glass);
  const caps = new THREE.Mesh(
    merge([
      [cylinder(0.118, 0.118, 0.05, 18), trs(0, 0.2, 0), 0x4b4262],
      [cylinder(0.1, 0.12, 0.05, 18), trs(0, -0.205, 0), 0x4b4262],
      [torus(0.12, 0.014, 6, 20), trs(0, 0.17, 0, Math.PI / 2, 0, 0), COLORS.team[team].accent]
    ]),
    propMaterial()
  );
  caps.castShadow = true;
  g.add(caps);
  g.visible = false;
  g.userData.liquid = liquid;
  return g;
}

export class RespawnSystem {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx; // { paint, particles, health, spawns, docks, heightAt }
    this.entries = new Map();
    this.drones = [0, 1].map((team) => {
      const d = buildDrone(team);
      const dock = ctx.docks[team];
      d.position.set(dock.x, dock.y, dock.z);
      scene.add(d);
      return { mesh: d, team, home: new THREE.Vector3(dock.x, dock.y, dock.z), queue: [], job: null, t: 0, pos: d.position };
    });
    this.tanks = [];
    this._v = new THREE.Vector3();
  }

  register(ch) {
    const tank = buildFlyingTank(ch.team);
    this.scene.add(tank);
    this.entries.set(ch, { timer: 0, state: 'alive', tank, tankVel: new THREE.Vector3(), tankSpin: new THREE.Vector3(), tankLife: 0, slot: 0 });
  }

  reset() {
    for (const [ch, e] of this.entries) {
      e.state = 'alive';
      e.timer = 0;
      e.tank.visible = false;
      ch.motor.locked = false;
    }
    for (const d of this.drones) {
      d.job = null;
      d.queue.length = 0;
      d.mesh.position.copy(d.home);
    }
  }

  /** El personaje revienta en pintura. killerTeam decide el color. */
  onDeath(ch, killer, cause) {
    const e = this.entries.get(ch);
    if (!e) return;
    const p = ch.position;
    const colorTeam = killer ? killer.team : ch.team;
    const color = COLORS.team[colorTeam].main;
    ch.animator.onPop();
    ch.frozen = true;
    e.state = 'dead';
    e.timer = PLAYER.respawnTime;
    e.popT = 0.12;
    ch.motor.locked = true;
    if (cause !== 'water') {
      this.ctx.particles.explosion(p.x, p.y, p.z, color, colorTeam);
      this.ctx.paint.stampGround(p.x, p.y, p.z, 2.1, colorTeam, { shape: 'round', owner: killer });
      // el tanque sale disparado
      const tank = e.tank;
      tank.visible = true;
      tank.position.set(p.x, p.y + 0.9, p.z);
      tank.rotation.set(0, 0, 0);
      const a = Math.random() * Math.PI * 2;
      e.tankVel.set(Math.cos(a) * 3.5, 7.5 + Math.random() * 2, Math.sin(a) * 3.5);
      e.tankSpin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 16);
      e.tankLife = 3.5;
      tank.scale.setScalar(1);
      tank.userData.liquid.material.uniforms.uFill.value = Math.max(0.1, ch.weapons.ink / 100);
    } else {
      this.ctx.particles.water(p.x, PLAYER.waterLevel + 0.05, p.z);
      e.popT = 0;
      ch.setVisible(false);
    }
    bus.emit('respawn:dead', { character: ch, time: PLAYER.respawnTime });
  }

  /** Reaparición inmediata (inicio de partida): sin dron. */
  placeAtSpawn(ch, slot) {
    const sp = this.ctx.spawns[ch.team][slot % this.ctx.spawns[ch.team].length];
    ch.frozen = false;
    ch.spawnAt(sp.x, sp.y, sp.z, sp.yaw);
    ch.motor.locked = false;
    this.ctx.health.reset(ch);
    const e = this.entries.get(ch);
    e.state = 'alive';
    e.slot = slot;
  }

  timeLeft(ch) {
    const e = this.entries.get(ch);
    return e && e.state === 'dead' ? Math.max(0, e.timer) : 0;
  }

  update(dt) {
    for (const [ch, e] of this.entries) {
      // tanque volador
      if (e.tankLife > 0) {
        e.tankLife -= dt;
        const t = e.tank;
        e.tankVel.y -= 20 * dt;
        t.position.addScaledVector(e.tankVel, dt);
        t.rotation.x += e.tankSpin.x * dt;
        t.rotation.y += e.tankSpin.y * dt;
        t.rotation.z += e.tankSpin.z * dt;
        const h = this.ctx.heightAt(t.position.x, t.position.z) + 0.14;
        if (t.position.y < h && e.tankVel.y < 0) {
          t.position.y = h;
          e.tankVel.y *= -0.38;
          e.tankVel.x *= 0.6;
          e.tankVel.z *= 0.6;
          e.tankSpin.multiplyScalar(0.55);
          if (Math.abs(e.tankVel.y) > 1.5) this.ctx.particles.splash(t.position.x, h, t.position.z, COLORS.team[ch.team].main, ch.team, 4, 2.5, 0, 1, 0, 0.5);
        }
        if (e.tankLife < 0.6) t.scale.setScalar(Math.max(0.01, e.tankLife / 0.6));
        if (e.tankLife <= 0) t.visible = false;
      }
      if (e.state === 'dead') {
        if (e.popT > 0) {
          e.popT -= dt;
          if (e.popT <= 0) ch.setVisible(false);
        }
        e.timer -= dt;
        if (e.timer <= 0) {
          e.state = 'waiting';
          this.drones[ch.team].queue.push(ch);
        }
      }
      if (e.state === 'falling') {
        // caída desde el dron hasta tocar la plataforma
        ch.motor.locked = true;
        e.trailT = (e.trailT || 0) - dt;
        if (e.trailT <= 0) {
          e.trailT = 0.03;
          const p = ch.position;
          this.ctx.particles.sparks(p.x, p.y + 0.6, p.z, 0, 0, COLORS.team[ch.team].accent, 2);
        }
        if (ch.motor.grounded) {
          e.state = 'alive';
          ch.motor.locked = false;
          ch.flashExtra = 0;
          this.ctx.particles.splash(ch.position.x, ch.position.y + 0.1, ch.position.z, COLORS.team[ch.team].main, ch.team, 10, 4, 0, 1, 0, 0.5);
          this.ctx.paint.stampGround(ch.position.x, ch.position.y, ch.position.z, 1.4, ch.team, { owner: ch });
          bus.emit('respawn:landed', { character: ch });
        }
      }
      // parpadeo de protección
      if (ch.alive && ch.invulnerable) {
        ch.flashExtra = 0.25 + 0.25 * Math.sin(performance.now() * 0.02);
      } else if (ch.alive && e.state === 'alive') {
        ch.flashExtra = 0;
      }
    }
    for (const d of this.drones) this.updateDrone(d, dt);
  }

  updateDrone(d, dt) {
    const m = d.mesh;
    for (const r of m.userData.rotors) r.rotation.y += dt * 38;
    const bob = Math.sin(performance.now() * 0.003 + d.team) * 0.08;
    if (!d.job && d.queue.length) {
      const ch = d.queue.shift();
      const e = this.entries.get(ch);
      const slots = this.ctx.spawns[ch.team];
      const sp = slots[e.slot % slots.length];
      d.job = { ch, phase: 'go', from: m.position.clone(), to: new THREE.Vector3(sp.x, sp.y + 6.2, sp.z), sp, t: 0 };
      // el personaje cuelga del dron durante el trayecto
      this.ctx.health.reset(ch);
      ch.frozen = false;
      ch.spawnAt(m.position.x, m.position.y - 1.3, m.position.z, sp.yaw);
      ch.alive = false;
      ch.motor.locked = true;
      ch.setVisible(true);
      e.state = 'carried';
    }
    const job = d.job;
    if (!job) {
      m.position.lerp(this._v.copy(d.home).setY(d.home.y + bob), 1 - Math.exp(-dt * 3));
      m.rotation.set(0, m.rotation.y + dt * 0.3, 0);
      return;
    }
    job.t += dt;
    const ch = job.ch;
    const e = this.entries.get(ch);
    if (job.phase === 'go') {
      const k = Math.min(1, job.t / 0.75);
      const s = k * k * (3 - 2 * k);
      m.position.lerpVectors(job.from, job.to, s);
      m.position.y += Math.sin(s * Math.PI) * 1.2 + bob;
      m.rotation.set((1 - s) * 0.25, m.rotation.y, 0);
      ch.motor.teleport(m.position.x, m.position.y - 1.35, m.position.z);
      ch.object.position.set(m.position.x, m.position.y - 1.35, m.position.z);
      ch.visualY = m.position.y - 1.35;
      if (k >= 1) {
        job.phase = 'drop';
        job.t = 0;
        // soltar
        ch.alive = true;
        this.ctx.health.protect(ch, PLAYER.spawnProtection);
        e.state = 'falling';
        ch.motor.vel.set(0, -2, 0);
        ch.motor.grounded = false;
        bus.emit('respawn:drop', { character: ch });
      }
    } else if (job.phase === 'drop') {
      m.userData.claw.rotation.y += dt * 6;
      if (job.t > 0.45) {
        job.phase = 'back';
        job.t = 0;
        job.from = m.position.clone();
      }
    } else if (job.phase === 'back') {
      const k = Math.min(1, job.t / 1.1);
      const s = k * k * (3 - 2 * k);
      m.position.lerpVectors(job.from, d.home, s);
      m.position.y += Math.sin(s * Math.PI) * 1.5;
      if (k >= 1) d.job = null;
    }
  }
}
