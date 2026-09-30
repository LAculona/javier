// A combatant (player or bot): body, model, health and weapons, driven by a
// controller that fills `intent` each frame.
import * as THREE from 'three';
import { CHARACTER, otherTeam } from '../core/config.js';
import { CharacterMotor } from './CharacterMotor.js';
import { CharacterModel } from './CharacterModel.js';
import { HealthSystem } from '../combat/HealthSystem.js';
import { WeaponSystem } from '../combat/WeaponSystem.js';
import { WEAPONS } from '../combat/weapons.js';

const _v = new THREE.Vector3();

export function makeIntent() {
  return {
    moveX: 0, moveZ: 0, run: false, jump: false, aiming: false,
    fireHeld: false, reload: false, melee: false, switchTo: -1,
    aimYaw: 0, aimPitch: 0, aimPoint: new THREE.Vector3(),
  };
}

export class Character {
  constructor(game, { team, name, isPlayer = false, variant = 0, weapon = 0 }) {
    this.game = game;
    this.team = team;
    this.enemyTeam = otherTeam(team);
    this.name = name;
    this.isPlayer = isPlayer;
    this.motor = new CharacterMotor(game.world);
    this.model = new CharacterModel(team, variant);
    game.scene.add(this.model.root);
    this.health = new HealthSystem(this, (killer) => game.onCharacterDeath(this, killer), (amt, attacker, dir) => this.onDamaged(amt, attacker, dir));
    this.weapons = new WeaponSystem(this, game);
    this.weapons.index = -1;
    this.weapons.select(weapon);
    this.weapons.switchT = 0;
    this.controller = null;
    this.intent = makeIntent();
    this.stats = { kills: 0, deaths: 0, paint: 0, streak: 0, bestStreak: 0 };
    this.forward = new THREE.Vector3(0, 0, -1);
    this.moveDir = new THREE.Vector3(0, 0, -1);
    this.facingYaw = 0;
    this.surface = 0;
    this.climbing = false;
    this.lastFireTime = 99;
    this.dead = false;
  }

  get alive() { return !this.dead && this.health.alive; }

  resetStats() {
    this.stats.kills = this.stats.deaths = this.stats.paint = this.stats.streak = this.stats.bestStreak = 0;
  }

  onDamaged(amount, attacker, dir) {
    this.model.onHit();
    this.controller?.onDamaged?.(amount, attacker, dir);
  }

  onFired() { this.lastFireTime = 0; }

  spawnAt(pos, yaw, protection) {
    this.motor.teleport(pos);
    this.dead = false;
    this.health.reset(protection);
    this.weapons.reset();
    this.facingYaw = yaw;
    this.model.yaw = yaw;
    this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.moveDir.copy(this.forward);
    this.model.root.position.copy(pos);
    this.model.onSpawn();
    this.intent.aimYaw = yaw;
    this.controller?.onSpawn?.();
  }

  kill() {
    this.dead = true;
    this.model.root.visible = false;
    this.weapons.rolling = false;
  }

  update(dt, active) {
    if (!this.alive) return;
    const it = this.intent;
    if (active && this.controller) this.controller.update(dt, it);
    else {
      it.moveX = it.moveZ = 0; it.jump = it.fireHeld = it.reload = it.melee = false; it.switchTo = -1;
      if (this.controller && this.isPlayer) this.controller.updateLook?.(dt, it);
    }

    if (it.switchTo >= 0 && it.switchTo < WEAPONS.length) this.weapons.select(it.switchTo);
    if (it.reload) this.weapons.reload();
    if (it.melee) this.weapons.melee();

    // Surface under our feet drives speed, jump and refill
    this.surface = this.motor.grounded || this.climbing ? this.game.paint.ownerAt(this.motor.pos) : 0;
    const onOwn = this.surface === this.team;
    const onEnemy = this.surface === this.enemyTeam;
    let speed = it.run && !it.aiming ? CHARACTER.runSpeed : CHARACTER.walkSpeed;
    if (this.weapons.rolling) speed = CHARACTER.walkSpeed * 0.95;
    let mul = onOwn ? CHARACTER.ownInkMul : onEnemy ? CHARACTER.enemyInkMul : 1;
    if (it.aiming) mul *= CHARACTER.aimSpeedMul;
    if (this.weapons.reloading) mul *= 0.8;

    let mx = it.moveX, mz = it.moveZ;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    if (ml > 0.1) this.moveDir.set(mx, 0, mz).normalize();

    // Climb walls covered in our own ink
    this.climbing = false;
    if (this.motor.touchingWall && ml > 0.3) {
      const wn = this.motor.wallNormal;
      if (-(mx * wn.x + mz * wn.z) / Math.max(ml, 1e-3) > 0.55) {
        _v.copy(this.motor.pos).setY(this.motor.pos.y + 0.9).addScaledVector(wn, -this.motor.radius);
        this.climbing = this.game.paint.ownerAtWall(_v, wn) === this.team;
      }
    }

    const jumpSpeed = CHARACTER.jumpSpeed * (onEnemy ? 0.8 : 1);
    const wasGrounded = this.motor.grounded;
    this.motor.update(dt, mx * speed * mul, mz * speed * mul, { jump: it.jump, climb: this.climbing, jumpSpeed });
    if (it.jump && wasGrounded && !this.motor.grounded) {
      this.game.audio.play('jump', this.isPlayer ? null : this.motor.pos);
      this.game.fx.puff(this.motor.pos, 2, 0xe8e6f0, 0.2);
    }
    if (this.motor.landed) {
      this.game.fx.landing(this.motor.pos);
      if (this.isPlayer) this.game.audio.play('land');
    }
    if (onEnemy && this.motor.grounded && ml > 0.1 && Math.random() < dt * 6) {
      this.game.fx.splash(this.motor.pos, _v.set(0, 1, 0), this.enemyTeam, 1);
    }

    // Facing: aim direction while shooting/aiming, else movement direction
    this.lastFireTime += dt;
    const combat = it.aiming || it.fireHeld || this.lastFireTime < 0.8 || this.isPlayer;
    if (combat) this.facingYaw = it.aimYaw;
    else if (ml > 0.1) this.facingYaw = Math.atan2(-mx, -mz);
    this.forward.set(-Math.sin(this.facingYaw), 0, -Math.cos(this.facingYaw));

    const m = this.model;
    m.root.position.copy(this.motor.pos);
    const hs = Math.hypot(this.motor.vel.x, this.motor.vel.z);
    m.update(dt, {
      yaw: this.facingYaw,
      speed: hs,
      grounded: this.motor.grounded,
      vy: this.motor.vel.y,
      aiming: it.aiming,
      firing: it.fireHeld || this.lastFireTime < 0.4,
      rolling: this.weapons.rolling,
      climbing: this.climbing,
      inkFrac: this.weapons.inkFrac,
      aimPitch: combat ? it.aimPitch : 0,
      landing: this.motor.landed,
      groundY: this.motor.groundY,
    });
    m.root.updateMatrixWorld(true);

    this.weapons.update(dt, { fireHeld: active && it.fireHeld, aimPoint: it.aimPoint, aiming: it.aiming, onOwnInk: onOwn });
    this.health.update(dt, onEnemy);
    // Spawn protection shimmer
    m.root.visible = this.health.invulnerable <= 0 || Math.floor(this.health.invulnerable * 12) % 2 === 0 || this.isPlayer;
  }
}
