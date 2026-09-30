import * as THREE from 'three';
import { Weapon, buildWeaponModel } from './WeaponBase.js';
import { bevelBox, cylinder, torus, tube, trs } from '../../world/GeometryKit.js';
import { COLORS, WEAPONS } from '../../config.js';

// ROLLER · rodar pinta una franja ancha y arrolla; clic = barrido vertical.
const _fwd = new THREE.Vector3();

export class Roller extends Weapon {
  constructor(team) {
    super(WEAPONS.roller, team);
    this.muzzle.position.set(0, 0, 1.02);
    this.holdRotation.set(Math.PI / 2 + 0.2, 0, 0);
    this.holdOffset.set(0, -0.04, 0.02);
    this.stowRotation.set(0.35, Math.PI, -0.55);
    this.stowOffset.set(0.02, 0.28, -0.4);
    this.flickT = -1;
    this.rollAccum = 0;
    this.hitCooldowns = new Map();
    this.rolling = false;
  }

  buildModel(team) {
    const tc = COLORS.team[team];
    const dark = 0x3b3350;
    const X = Math.PI / 2;
    const parts = [
      [cylinder(0.022, 0.022, 0.96, 10), trs(0, 0, 0.4, X, 0, 0), dark],
      [torus(0.027, 0.01, 6, 12), trs(0, 0, -0.02), tc.accent],
      [torus(0.027, 0.01, 6, 12), trs(0, 0, 0.05), tc.accent],
      [bevelBox(0.07, 0.05, 0.09, { bevel: 0.02 }), trs(0, 0.02, 0.2), 0xf6f0e6],
      [tube([[0, 0, 0.86], [0.02, 0, 0.93], [0.36, 0, 0.97], [0.47, 0, 1.02]], 0.02, 10, 6), null, dark],
      [tube([[0, 0, 0.86], [-0.02, 0, 0.93], [-0.36, 0, 0.97], [-0.47, 0, 1.02]], 0.02, 10, 6), null, dark],
      [cylinder(0.14, 0.14, 0.86, 22), trs(0, 0, 1.02, 0, 0, Math.PI / 2), tc.main],
      [cylinder(0.152, 0.152, 0.04, 22), trs(0.44, 0, 1.02, 0, 0, Math.PI / 2), dark],
      [cylinder(0.152, 0.152, 0.04, 22), trs(-0.44, 0, 1.02, 0, 0, Math.PI / 2), dark]
    ];
    // relieve de espuma empapada
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push([torus(0.142, 0.012, 5, 22), trs(-0.36 + i * 0.1, 0, 1.02, 0, Math.PI / 2, a), tc.accent]);
    }
    return buildWeaponModel(parts, { matrix: trs(0, 0.075, 0.16, 0, 0, 0, 0.36, 0.34, 0.36) }, team);
  }

  update(ws, dt, intent) {
    const cfg = this.cfg;
    const ch = ws.character;
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const [id, t] of this.hitCooldowns) {
      if (t - dt <= 0) this.hitCooldowns.delete(id);
      else this.hitCooldowns.set(id, t - dt);
    }
    // barrido vertical
    if (this.flickT >= 0) {
      this.flickT += dt;
      if (this.flickT >= 0.16 && !this.flicked) {
        this.flicked = true;
        this.fling(ws);
      }
      if (this.flickT >= 0.42) this.flickT = -1;
    }
    if (intent.firePressed && ws.canFire() && this.cooldown <= 0 && this.flickT < 0) {
      if (ws.ink >= cfg.inkPerFlick) {
        ws.consume(cfg.inkPerFlick);
        this.cooldown = 1 / cfg.fireRate;
        this.flickT = 0;
        this.flicked = false;
        ch.animator.onFlick();
        ws.emitAction('flick');
      } else {
        ws.dry();
      }
    }
    // rodar
    const m = ch.motor;
    const speed = Math.hypot(m.vel.x, m.vel.z);
    this.rolling = intent.fire && m.grounded && speed > cfg.rollMinSpeed && this.flickT < 0 && ws.canFire() && ws.ink > 0.5;
    ch.rolling = intent.fire && this.flickT < 0 && ws.canFire();
    m.speedMult = this.rolling ? 0.92 : 1;
    if (!this.rolling) {
      this.rollAccum = 0.3;
      return;
    }
    ws.consume(cfg.inkPerSecondRolling * dt);
    ws.markFiring();
    const yaw = Math.atan2(m.vel.x, m.vel.z);
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    const hx = m.pos.x + _fwd.x * 1.02;
    const hz = m.pos.z + _fwd.z * 1.02;
    this.rollAccum += speed * dt;
    if (this.rollAccum >= 0.3) {
      this.rollAccum = 0;
      const R = cfg.rollWidth / 2 / 0.62;
      ws.paint.stampGround(hx, m.pos.y, hz, R, ch.team, { shape: 'roller', rot: Math.atan2(_fwd.z, _fwd.x), stretch: 0.34, owner: ch });
      if (ws.particles && Math.random() < 0.7) ws.particles.sparks(hx + (Math.random() - 0.5) * 1.4, m.pos.y, hz, m.vel.x * 0.3, m.vel.z * 0.3, ws.teamColor, 2);
    }
    // arrollar enemigos
    for (const other of ws.ctx.characters) {
      if (!other.alive || other.team === ch.team || other.invulnerable) continue;
      if (this.hitCooldowns.has(other.id)) continue;
      const dx = other.position.x - m.pos.x;
      const dz = other.position.z - m.pos.z;
      const along = dx * _fwd.x + dz * _fwd.z;
      const side = Math.abs(dx * _fwd.z - dz * _fwd.x);
      if (along > 0.3 && along < 1.7 && side < cfg.rollWidth / 2 + 0.3 && Math.abs(other.position.y - m.pos.y) < 1.2) {
        this.hitCooldowns.set(other.id, cfg.rollDamageCooldown);
        ws.ctx.damage(ch, other, cfg.rollDamage, false, 'roller', other.position.x, other.position.y + 0.6, other.position.z);
        other.motor.addImpulse(_fwd.x * 5, 3, _fwd.z * 5);
      }
    }
  }

  fling(ws) {
    const cfg = this.cfg;
    const n = cfg.flickProjectiles;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const elev = (-8 + t * cfg.flickSpread) * (Math.PI / 180);
      const side = (Math.random() - 0.5) * 0.18;
      ws.shoot(this, {
        speed: cfg.projectileSpeed * (0.8 + Math.random() * 0.35),
        gravity: cfg.projectileGravity,
        damage: cfg.damage,
        critMult: 1,
        falloff: 0.62,
        splat: cfg.splatRadius * (0.85 + Math.random() * 0.4),
        size: cfg.projectileSize * (0.8 + Math.random() * 0.5),
        range: cfg.range,
        dropGravity: 20,
        elevation: elev,
        yawOffset: side,
        fromBody: true,
        quiet: i > 0
      });
    }
    ws.effectsFor(this, 0.35);
  }

  reset() {
    this.flickT = -1;
    this.rolling = false;
    this.hitCooldowns.clear();
  }
}
