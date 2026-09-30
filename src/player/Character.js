import * as THREE from 'three';
import { createDripper, resetPose } from './CharacterRig.js';
import { CharacterAnimator } from './CharacterAnimator.js';
import { CharacterMotor, makeIntent } from './PlayerController.js';
import { PLAYER } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  Character · entidad de juego (jugador o bot)
//  Une el rig visual, el animador procedural y el motor físico. Los
//  sistemas de armas y vida se enganchan a esta entidad.
// ─────────────────────────────────────────────────────────────

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

let NEXT_ID = 0;

export class Character {
  constructor({ name, team, look, isPlayer = false, collision }) {
    this.id = NEXT_ID++;
    this.name = name;
    this.team = team;
    this.isPlayer = isPlayer;
    this.look = { ...look, team };
    this.rig = createDripper(this.look);
    this.object = this.rig.mesh;
    this.object.userData.character = this;
    this.animator = new CharacterAnimator(this.rig);
    this.motor = new CharacterMotor(collision, team);
    this.collision = collision;
    this.intent = makeIntent();
    this.bodyYaw = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.turnRate = 0;
    this.visualY = 0;
    this.alive = true;
    this.visible = true;
    this.weaponId = 'blaster';
    this.firing = false;
    this.reloadT = -1; // progreso de recarga 0..1 (o -1)
    this.rolling = false;
    this.flashExtra = 0;
    this.animState = {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      grounded: true,
      aiming: false,
      firing: false,
      aimPitch: 0,
      aimYawOffset: 0,
      weapon: 'blaster',
      rolling: false,
      surfing: false,
      turnRate: 0,
      reloading: -1,
      dead: false,
      flashExtra: 0
    };
    this._groundAt = (x, z, maxY) => this.collision.groundHeight(x, z, 0.08, maxY);
  }

  get position() {
    return this.motor.pos;
  }

  get velocity() {
    return this.motor.vel;
  }

  /** Posición de la cabeza (para líneas de visión, etiquetas y puntería). */
  headPosition(out) {
    return out.set(this.motor.pos.x, this.motor.pos.y + 1.22, this.motor.pos.z);
  }

  chestPosition(out) {
    return out.set(this.motor.pos.x, this.motor.pos.y + 0.85, this.motor.pos.z);
  }

  spawnAt(x, y, z, yaw) {
    this.motor.teleport(x, y, z);
    this.bodyYaw = yaw;
    this.aimYaw = yaw;
    this.aimPitch = 0;
    this.visualY = y;
    this.alive = true;
    this.setVisible(true);
    this.animator.reset();
    resetPose(this.rig);
    this.object.position.set(x, y, z);
    this.object.rotation.set(0, yaw, 0);
  }

  setVisible(v) {
    this.visible = v;
    this.object.visible = v;
  }

  /**
   * Avanza la física y la animación.
   * env: { paintAt(x,z) }
   */
  update(dt, env) {
    const intent = this.intent;
    const m = this.motor;
    m.aiming = intent.aim;
    m.reloading = this.reloadT >= 0;
    m.update(dt, intent, env);

    // orientación del cuerpo: hacia el movimiento, o hacia la mira al disparar/apuntar
    this.aimYaw = intent.lookYaw;
    this.aimPitch = intent.lookPitch;
    const vx = m.vel.x;
    const vz = m.vel.z;
    const speed = Math.hypot(vx, vz);
    let targetYaw = this.bodyYaw;
    const combat = intent.aim || this.firing || intent.fire;
    if (m.surfing && speed > 1) targetYaw = Math.atan2(vx, vz);
    else if (combat) targetYaw = this.aimYaw;
    else if (speed > 0.6) targetYaw = Math.atan2(vx, vz);
    const prevYaw = this.bodyYaw;
    const rate = combat ? 22 : m.surfing ? 9 : 12;
    this.bodyYaw += angleDiff(this.bodyYaw, targetYaw) * (1 - Math.exp(-rate * dt));
    this.turnRate = dt > 0 ? angleDiff(prevYaw, this.bodyYaw) / dt : 0;

    // suavizado visual de escalones (la física sube de golpe, la malla no)
    if (m.pos.y > this.visualY) this.visualY += (m.pos.y - this.visualY) * (1 - Math.exp(-dt * (m.grounded ? 18 : 60)));
    else this.visualY = m.pos.y;
    if (Math.abs(m.pos.y - this.visualY) > 0.6) this.visualY = m.pos.y;

    // eventos de animación
    if (m.justJumped) this.animator.onJump();
    if (m.justLanded > 0) this.animator.onLand(m.justLanded);

    const s = this.animState;
    s.x = m.pos.x;
    s.y = m.pos.y;
    s.z = m.pos.z;
    s.yaw = this.bodyYaw;
    s.vx = vx;
    s.vz = vz;
    s.vy = m.vel.y;
    s.grounded = m.grounded;
    s.aiming = intent.aim;
    s.firing = this.firing;
    s.aimPitch = this.aimPitch;
    s.aimYawOffset = clamp(angleDiff(this.bodyYaw, this.aimYaw), -1.2, 1.2);
    s.weapon = this.weaponId;
    s.rolling = this.rolling;
    s.surfing = m.surfing;
    s.turnRate = this.turnRate;
    s.reloading = this.reloadT;
    s.dead = !this.alive;
    s.flashExtra = this.flashExtra;
    this.animator.update(dt, s, this._groundAt);

    this.object.position.set(m.pos.x, this.visualY, m.pos.z);
    this.object.rotation.set(0, this.bodyYaw, 0);
  }

  /** Nivel del tanque visible (0..1). */
  setTankLevel(k) {
    this.rig.liquidMat.uniforms.uFill.value = clamp(k, 0, 1);
  }

  isInWater() {
    return this.motor.pos.y < PLAYER.killY;
  }
}

export const _tmpV = new THREE.Vector3();
