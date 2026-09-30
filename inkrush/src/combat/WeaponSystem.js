// WeaponSystem: ink tank, fire cadence, spread, reload, roller rolling and melee.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { INK, MELEE } from '../core/config.js';

const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _ra = new THREE.Vector3();
const _rb = new THREE.Vector3();
const _out = new THREE.Vector3();

function randomCone(dir, angleDeg, out) {
  if (angleDeg <= 0) return out.copy(dir);
  const a = THREE.MathUtils.degToRad(angleDeg) * Math.sqrt(Math.random());
  const phi = Math.random() * Math.PI * 2;
  _ra.crossVectors(dir, Math.abs(dir.y) > 0.95 ? _rb.set(1, 0, 0) : _up).normalize();
  const up2 = _rb.crossVectors(_ra, dir).normalize();
  out.copy(dir).multiplyScalar(Math.cos(a))
    .addScaledVector(_ra, Math.sin(a) * Math.cos(phi))
    .addScaledVector(up2, Math.sin(a) * Math.sin(phi));
  return out.normalize();
}

export class WeaponSystem {
  constructor(owner, game) {
    this.owner = owner;
    this.game = game;
    this.index = 0;
    this.ink = INK.max;
    this.cooldown = 0;
    this.sinceShot = 99;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadFrom = 0;
    this.switchT = 0;
    this.heldTime = 0;
    this.rolling = false;
    this.rollTick = 0;
    this.meleeCd = 0;
    this.meleePending = -1;
    this.emptyCd = 0;
  }

  get def() { return WEAPONS[this.index]; }
  get inkFrac() { return this.ink / INK.max; }

  reset() {
    this.ink = INK.max;
    this.cooldown = 0;
    this.reloading = false;
    this.rolling = false;
    this.heldTime = 0;
    this.meleePending = -1;
  }

  select(i) {
    if (i === this.index || i < 0 || i >= WEAPONS.length) return false;
    this.index = i;
    this.switchT = 0.32;
    this.rolling = false;
    this.heldTime = 0;
    this.owner.model.setWeapon(WEAPONS[i].id);
    if (this.owner.isPlayer) this.game.audio.play('switch');
    return true;
  }

  reload() {
    if (this.reloading || this.ink >= INK.max - 0.5) return false;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadFrom = this.ink;
    this.rolling = false;
    this.game.audio.play('reload', this.owner.isPlayer ? null : this.owner.motor.pos);
    return true;
  }

  melee() {
    if (this.meleeCd > 0 || this.reloading) return false;
    this.meleeCd = MELEE.cooldown;
    this.meleePending = 0.12;
    this.owner.model.onMelee();
    this.game.audio.play('melee', this.owner.isPlayer ? null : this.owner.motor.pos);
    return true;
  }

  canFire() {
    return !this.reloading && this.switchT <= 0 && this.cooldown <= 0;
  }

  // input: {fireHeld, aimPoint, aiming, onOwnInk}
  update(dt, input) {
    const o = this.owner;
    const def = this.def;
    this.cooldown -= dt;
    this.switchT -= dt;
    this.meleeCd -= dt;
    this.emptyCd -= dt;
    this.sinceShot += dt;

    if (this.meleePending >= 0) {
      this.meleePending -= dt;
      if (this.meleePending < 0) this.resolveMelee();
    }

    if (this.reloading) {
      this.reloadT += dt;
      const k = Math.min(1, this.reloadT / INK.reloadTime);
      this.ink = this.reloadFrom + (INK.max - this.reloadFrom) * k;
      if (k >= 1) {
        this.reloading = false;
        if (o.isPlayer) this.game.audio.play('reloadDone');
      }
      this.rolling = false;
      return;
    }

    if (this.sinceShot > INK.refillDelay && !this.rolling) {
      this.ink = Math.min(INK.max, this.ink + (input.onOwnInk ? INK.ownInkRefill : INK.passiveRefill) * dt);
    }

    this.heldTime = input.fireHeld ? this.heldTime + dt : 0;

    // Roller: tap = flick, hold while moving = roll
    if (def.roll) {
      const speed = Math.hypot(o.motor.vel.x, o.motor.vel.z);
      this.rolling = input.fireHeld && this.heldTime > 0.3 && o.motor.grounded && speed > 1.2 && this.ink > 0.5 && this.switchT <= 0;
      if (this.rolling) {
        this.sinceShot = 0;
        this.ink = Math.max(0, this.ink - def.roll.inkPerSec * dt);
        this.rollTick -= dt;
        if (this.rollTick <= 0) {
          this.rollTick = def.roll.interval;
          this.doRoll(def);
        }
        return;
      }
      if (input.fireHeld && this.heldTime <= dt + 1e-6 && this.canFire()) this.fire(input);
      return;
    }

    if (input.fireHeld && this.canFire()) this.fire(input);
  }

  fire(input) {
    const def = this.def;
    const o = this.owner;
    if (this.ink < def.inkCost) {
      if (this.emptyCd <= 0) {
        this.emptyCd = 0.35;
        if (o.isPlayer) {
          this.game.audio.play('empty');
          this.game.ui?.flashInkWarning();
        }
      }
      return false;
    }
    this.cooldown = def.fireInterval;
    this.ink -= def.inkCost;
    this.sinceShot = 0;
    o.model.muzzleWorld(_muzzle);
    const baseDir = _dir.subVectors(input.aimPoint, _muzzle);
    if (baseDir.lengthSq() < 0.01) baseDir.copy(o.forward);
    baseDir.normalize();
    const spread = input.aiming ? def.aimSpread : def.spread;
    for (let i = 0; i < def.pellets; i++) {
      let d = _vel.copy(baseDir);
      if (def.fan) {
        const a = THREE.MathUtils.degToRad(-def.fan / 2 + (def.fan * i) / (def.pellets - 1));
        _q.setFromAxisAngle(_up, a);
        d.applyQuaternion(_q);
        d.y += 0.08;
        d.normalize();
      }
      d = randomCone(d, spread, _out);
      const spd = def.speed * (def.fan ? 0.85 + Math.random() * 0.3 : 1);
      this.game.projectiles.spawn({
        pos: _muzzle,
        vel: d.multiplyScalar(spd),
        team: o.team,
        owner: o,
        damage: def.damage,
        size: def.projectileSize,
        splatRadius: def.splatRadius,
        straightTime: def.straightTime,
        trailEvery: def.trailEvery,
        trailRadius: def.trailRadius,
      });
    }
    o.model.onFire(def.recoil);
    this.game.fx.muzzle(_muzzle, baseDir, o.team);
    this.game.audio.play(def.sound, o.isPlayer ? null : o.motor.pos);
    if (o.isPlayer) this.game.cameraController.shake(def.shake);
    o.onFired?.(def);
    return true;
  }

  doRoll(def) {
    const o = this.owner;
    const f = o.moveDir;
    const p = _tmp.copy(o.motor.pos).addScaledVector(f, 0.9);
    p.y = o.motor.groundY + 0.05;
    const m2 = this.game.paint.splat(p, def.roll.width, o.team);
    o.stats.paint += m2;
    // Contact damage in front of the roller
    for (const c of this.game.characters) {
      if (!c.alive || c.team === o.team) continue;
      const dx = c.motor.pos.x - p.x, dz = c.motor.pos.z - p.z;
      if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(c.motor.pos.y - o.motor.pos.y) < 1.3) {
        this.game.damageCharacter(c, def.roll.dps * def.roll.interval, o, _dir.copy(f));
      }
    }
    if (Math.random() < 0.3) this.game.fx.splash(p, _up, o.team, 2);
    if (o.isPlayer && Math.random() < 0.25) this.game.audio.play('roll');
  }

  resolveMelee() {
    const o = this.owner;
    const f = o.forward;
    let hitAny = false;
    for (const c of this.game.characters) {
      if (!c.alive || c.team === o.team) continue;
      _tmp.subVectors(c.motor.pos, o.motor.pos);
      if (Math.abs(_tmp.y) > 1.4) continue;
      _tmp.y = 0;
      const d = _tmp.length();
      if (d > MELEE.range) continue;
      if (d > 0.3 && _tmp.divideScalar(d).dot(f) < MELEE.arc) continue;
      this.game.damageCharacter(c, MELEE.damage, o, _dir.copy(f));
      hitAny = true;
    }
    const p = _tmp.copy(o.motor.pos).addScaledVector(f, 1.3);
    p.y = o.motor.groundY + 0.05;
    o.stats.paint += this.game.paint.splat(p, 1.1, o.team);
    this.game.fx.splash(_muzzle.copy(p).setY(p.y + 0.8), f, o.team, 8);
    if (hitAny) this.game.audio.play('hit', o.isPlayer ? null : o.motor.pos);
  }
}
