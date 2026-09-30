import * as THREE from 'three';
import { Blaster } from './weapons/Blaster.js';
import { Roller } from './weapons/Roller.js';
import { Splasher } from './weapons/Splasher.js';
import { bus } from '../core/EventBus.js';
import { PLAYER, COLORS, WEAPON_ORDER } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  WeaponSystem · arsenal de un personaje
//  Tanque de pintura (el líquido de la mochila y del arma baja al
//  disparar), recarga con R, cambio de arma animado (el arma gira y se
//  guarda a la espalda), golpe cuerpo a cuerpo con F, dispersión con
//  expansión de retícula y recarga pasiva según la pintura bajo los pies.
// ─────────────────────────────────────────────────────────────

const _muzzle = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _hit = {};
const DEG = Math.PI / 180;

const FACTORY = { blaster: Blaster, roller: Roller, splasher: Splasher };

export class WeaponSystem {
  /**
   * ctx: { projectiles, paint, particles, characters, damage(att, vic, dmg, crit, weapon, x,y,z) }
   */
  constructor(character, loadout, ctx) {
    this.character = character;
    this.ctx = ctx;
    this.paint = ctx.paint;
    this.particles = ctx.particles;
    this.teamColor = COLORS.team[character.team].main;
    this.loadout = loadout.slice();
    this.weapons = this.loadout.map((id) => new FACTORY[id](character.team));
    this.index = 0;
    this.ink = PLAYER.tankCapacity;
    this.reloadT = -1;
    this.reloadFrom = 0;
    this.switchT = -1;
    this.switchTo = 0;
    this.swapped = false;
    this.meleeT = -1;
    this.meleeCd = 0;
    this.meleeDone = false;
    this.sinceFire = 10;
    this.bloom = 0; // 0..1 expansión de retícula
    this.spreadNow = 0;
    this.aim = null;
    this.firingFlag = false;
    this.dryCd = 0;

    // soportes: mano derecha y funda a la espalda
    const b = character.rig.bones;
    this.hand = new THREE.Group();
    b.handR.add(this.hand);
    this.stow = new THREE.Group();
    b.chest.add(this.stow);
    for (const w of this.weapons) {
      w.model.visible = false;
      this.hand.add(w.model);
    }
    this.prevIndex = -1;
    this.equip(0, true);
  }

  get current() {
    return this.weapons[this.index];
  }

  get weaponId() {
    return this.current.id;
  }

  reset() {
    this.ink = PLAYER.tankCapacity;
    this.reloadT = -1;
    this.switchT = -1;
    this.meleeT = -1;
    this.meleeCd = 0;
    this.bloom = 0;
    this.sinceFire = 10;
    for (const w of this.weapons) {
      w.cooldown = 0;
      if (w.reset) w.reset();
    }
    this.character.rolling = false;
    this.character.motor.speedMult = 1;
    this.syncVisuals();
  }

  /** Coloca el arma i en la mano (y la anterior en la funda). */
  equip(i, instant = false) {
    const prev = this.weapons[this.index];
    this.index = i;
    const w = this.weapons[i];
    for (const x of this.weapons) {
      if (x !== w && x !== prev) x.model.visible = false;
    }
    if (prev && prev !== w && !instant) {
      this.stow.add(prev.model);
      prev.model.position.copy(prev.stowOffset);
      prev.model.rotation.copy(prev.stowRotation);
      prev.model.visible = true;
      this.prevIndex = this.weapons.indexOf(prev);
    }
    this.hand.add(w.model);
    w.model.position.copy(w.holdOffset);
    w.model.rotation.copy(w.holdRotation);
    w.model.visible = true;
    this.character.weaponId = w.id;
  }

  canFire() {
    const ch = this.character;
    return ch.alive && !ch.motor.surfing && !ch.motor.locked && this.reloadT < 0 && this.switchT < 0 && this.meleeT < 0;
  }

  consume(amount) {
    this.ink = Math.max(0, this.ink - amount);
    this.sinceFire = 0;
  }

  markFiring() {
    this.sinceFire = 0;
    this.firingFlag = true;
  }

  dry() {
    if (this.dryCd > 0) return;
    this.dryCd = 0.45;
    bus.emit('weapon:dry', { character: this.character });
  }

  emitAction(name) {
    bus.emit('weapon:' + name, { character: this.character, weapon: this.current });
  }

  requestSwitch(i) {
    if (i < 0 || i >= this.weapons.length || i === this.index) return;
    if (this.switchT >= 0 || this.reloadT >= 0 || !this.character.alive) return;
    this.switchT = 0;
    this.switchTo = i;
    this.swapped = false;
    this.character.animator.onSwitch();
    bus.emit('weapon:switch', { character: this.character, weapon: this.weapons[i] });
  }

  startReload() {
    if (this.reloadT >= 0 || this.switchT >= 0 || this.ink >= PLAYER.tankCapacity - 0.5 || !this.character.alive) return;
    this.reloadT = 0;
    this.reloadFrom = this.ink;
    bus.emit('weapon:reload', { character: this.character });
  }

  startMelee() {
    if (this.meleeCd > 0 || this.meleeT >= 0 || this.switchT >= 0 || !this.character.alive || this.character.motor.surfing) return;
    this.meleeT = 0;
    this.meleeDone = false;
    this.meleeCd = PLAYER.meleeCooldown;
    this.character.animator.onMelee();
    bus.emit('weapon:melee', { character: this.character });
  }

  /**
   * aim: { origin: Vector3, dir: Vector3, point: Vector3 }
   */
  update(dt, intent, aim) {
    const ch = this.character;
    this.aim = aim;
    this.firingFlag = false;
    this.dryCd = Math.max(0, this.dryCd - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);

    if (ch.alive && !ch.motor.locked) {
      if (intent.switchTo >= 0) this.requestSwitch(intent.switchTo);
      else if (intent.switchDelta) {
        const n = this.weapons.length;
        this.requestSwitch((this.index + (intent.switchDelta > 0 ? 1 : n - 1)) % n);
      }
      if (intent.reload) this.startReload();
      if (intent.melee) this.startMelee();
    }

    // cambio de arma: a mitad de la animación se intercambian los modelos
    if (this.switchT >= 0) {
      this.switchT += dt / 0.42;
      const w = this.current;
      const spin = ch.animator.weaponSpin || 0;
      w.model.rotation.set(w.holdRotation.x - spin, w.holdRotation.y, w.holdRotation.z);
      if (this.switchT >= 0.5 && !this.swapped) {
        this.swapped = true;
        this.equip(this.switchTo);
      }
      if (this.switchT >= 1) {
        this.switchT = -1;
        const cw = this.current;
        cw.model.rotation.copy(cw.holdRotation);
      }
    }

    // recarga: el tanque se llena con una curva suave
    if (this.reloadT >= 0) {
      this.reloadT += dt / PLAYER.reloadDuration;
      const k = Math.min(1, this.reloadT);
      const e = k * k * (3 - 2 * k);
      this.ink = this.reloadFrom + (PLAYER.tankCapacity - this.reloadFrom) * e;
      if (this.reloadT >= 1) {
        this.reloadT = -1;
        this.ink = PLAYER.tankCapacity;
        bus.emit('weapon:reloaded', { character: ch });
      }
    }
    ch.reloadT = this.reloadT;

    // cuerpo a cuerpo
    if (this.meleeT >= 0) {
      this.meleeT += dt;
      if (this.meleeT >= 0.13 && !this.meleeDone) {
        this.meleeDone = true;
        this.meleeHit();
      }
      if (this.meleeT >= 0.38) this.meleeT = -1;
    }

    // arma actual
    if (ch.alive) this.current.update(this, dt, intent);

    // recarga pasiva
    this.sinceFire += dt;
    if (this.reloadT < 0 && ch.alive && this.sinceFire > 0.15) {
      const m = ch.motor;
      let rate = 0;
      if (m.surfing) rate = PLAYER.refillSurf;
      else if (m.paint === 1) rate = PLAYER.refillOwnPaint;
      else if (this.sinceFire > PLAYER.refillIdleDelay) rate = PLAYER.refillIdle;
      this.ink = Math.min(PLAYER.tankCapacity, this.ink + rate * dt);
    }

    // expansión de retícula
    this.bloom = Math.max(0, this.bloom - dt * 2.6);
    const cfg = this.current.cfg;
    const speed = Math.hypot(ch.motor.vel.x, ch.motor.vel.z);
    const base = intent.aim ? cfg.aimSpread || 0 : cfg.spread || 0;
    this.spreadNow = base + (cfg.moveSpreadAdd || 0) * Math.min(1, speed / PLAYER.walkSpeed) + this.bloom * (cfg.spread || 4) * 0.8 + (ch.motor.grounded ? 0 : 1.5);
    ch.firing = this.sinceFire < 0.3 || this.firingFlag;
    this.syncVisuals();
  }

  syncVisuals() {
    const k = this.ink / PLAYER.tankCapacity;
    this.character.setTankLevel(k);
    for (const w of this.weapons) {
      w.setInk(k);
      w.setLiquidTime(this.character.animator.t);
    }
    const liq = this.character.rig.liquidMat.uniforms;
    liq.uBubbles.value = this.reloadT >= 0 ? 1 : 0;
  }

  /** Dispara un proyectil desde la boca del arma hacia el punto de mira. */
  shoot(weapon, o) {
    const ch = this.character;
    weapon.muzzle.getWorldPosition(_muzzle);
    ch.chestPosition(_chest);
    // si la boca atraviesa una pared, salir desde el pecho (nunca a través de muros)
    _tmp.subVectors(_muzzle, _chest);
    const len = _tmp.length();
    if (len > 1e-3) {
      _tmp.divideScalar(len);
      if (this.ctx.projectiles.collision.raycast(_chest.x, _chest.y, _chest.z, _tmp.x, _tmp.y, _tmp.z, len, solidFilter, _hit)) _muzzle.copy(_chest);
    }
    if (o.fromBody) {
      const yaw = ch.bodyYaw + (o.yawOffset || 0);
      const el = o.elevation || 0;
      _dir.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
    } else {
      const aim = this.aim;
      _dir.subVectors(aim.point, _muzzle);
      const d = _dir.length();
      if (d < 0.5) _dir.copy(aim.dir);
      else _dir.divideScalar(d);
      if (_dir.dot(aim.dir) < 0.3) _dir.copy(aim.dir);
      // dispersión en cono (distribución uniforme en disco)
      const spread = this.spreadNow * DEG;
      if (spread > 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * spread;
        perturb(_dir, Math.cos(a) * r, Math.sin(a) * r);
      }
    }
    const inherit = 0.25;
    const vel = ch.motor.vel;
    this.ctx.projectiles.spawn({
      owner: ch,
      team: ch.team,
      x: _muzzle.x,
      y: _muzzle.y,
      z: _muzzle.z,
      vx: _dir.x * o.speed + vel.x * inherit,
      vy: _dir.y * o.speed + Math.max(0, vel.y) * inherit,
      vz: _dir.z * o.speed + vel.z * inherit,
      damage: o.damage,
      critMult: o.critMult,
      falloff: o.falloff || 0,
      splat: o.splat,
      size: o.size,
      gravity: o.gravity,
      dropGravity: o.dropGravity,
      range: o.range,
      trailEvery: o.trailEvery,
      trailRadius: o.trailRadius,
      weapon: weapon.id
    });
    this.markFiring();
    if (!o.quiet) this.effectsFor(weapon, 1, _muzzle, _dir);
  }

  /** Retroceso, fogonazo, expansión de retícula y evento para cámara/audio. */
  effectsFor(weapon, strength = 1, muzzle, dir) {
    const ch = this.character;
    ch.animator.onShoot(strength * (weapon.id === 'splasher' ? 0.45 : 1));
    this.bloom = Math.min(1, this.bloom + (weapon.cfg.reticleKick || 5) / 30);
    if (this.particles && muzzle && dir) this.particles.muzzle(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, this.teamColor, weapon.id === 'splasher' ? 3 : 5);
    bus.emit('weapon:shot', { character: ch, weapon, strength });
  }

  meleeHit() {
    const ch = this.character;
    const yaw = ch.bodyYaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let hitAny = false;
    for (const other of this.ctx.characters) {
      if (other === ch || !other.alive || other.team === ch.team || other.invulnerable) continue;
      const dx = other.position.x - ch.position.x;
      const dz = other.position.z - ch.position.z;
      const dy = other.position.y - ch.position.y;
      const dist = Math.hypot(dx, dz);
      if (dist > PLAYER.meleeRange || Math.abs(dy) > 1.3) continue;
      const cos = (dx * fx + dz * fz) / Math.max(dist, 1e-3);
      if (cos < 0.3 && dist > 0.6) continue;
      hitAny = true;
      this.ctx.damage(ch, other, PLAYER.meleeDamage, false, 'melee', other.position.x, other.position.y + 0.9, other.position.z);
      const k = PLAYER.meleeKnockback;
      other.motor.addImpulse((dx / Math.max(dist, 1e-3)) * k, 3.2, (dz / Math.max(dist, 1e-3)) * k);
    }
    // salpicón delante
    this.paint.stampGround(ch.position.x + fx * 1.3, ch.position.y, ch.position.z + fz * 1.3, 1.0, ch.team, { rot: Math.atan2(fz, fx), shape: 'streak', owner: ch });
    if (this.particles) this.particles.splash(ch.position.x + fx * 1.0, ch.position.y + 0.9, ch.position.z + fz * 1.0, this.teamColor, ch.team, 8, 5, fx, 0.3, fz, 0.2);
    bus.emit('weapon:meleeHit', { character: ch, hit: hitAny });
  }
}

// gira una dirección unitaria dos ángulos pequeños en su base local
function perturb(d, ax, ay) {
  // base ortonormal alrededor de d
  let ux;
  let uy;
  let uz;
  if (Math.abs(d.y) < 0.95) {
    ux = -d.z;
    uy = 0;
    uz = d.x;
  } else {
    ux = 1;
    uy = 0;
    uz = 0;
  }
  let l = Math.hypot(ux, uy, uz);
  ux /= l;
  uy /= l;
  uz /= l;
  const vx = d.y * uz - d.z * uy;
  const vy = d.z * ux - d.x * uz;
  const vz = d.x * uy - d.y * ux;
  const tx = Math.tan(ax);
  const ty = Math.tan(ay);
  d.x += ux * tx + vx * ty;
  d.y += uy * tx + vy * ty;
  d.z += uz * tx + vz * ty;
  l = Math.hypot(d.x, d.y, d.z);
  d.x /= l;
  d.y /= l;
  d.z /= l;
}

function solidFilter(s) {
  return s.blocksProjectiles;
}

export const PLAYER_LOADOUT = WEAPON_ORDER;
