import * as THREE from 'three';
import { PLAYER } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  PlayerController
//  · CharacterMotor: física cinemática compartida por jugador y bots
//    (aceleración con inercia, coyote time, jump buffer, control aéreo
//    parcial, gravedad más fuerte al caer, surf sobre pintura propia)
//  · PlayerInput: traduce teclado/ratón a la misma "intención" que
//    produce la IA, así el jugador y los bots juegan con las mismas reglas
// ─────────────────────────────────────────────────────────────

const SUBSTEP = 1 / 120;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function makeIntent() {
  return {
    moveX: 0,
    moveZ: 0,
    lookYaw: 0,
    lookPitch: 0,
    fire: false,
    firePressed: false,
    aim: false,
    jump: false,
    jumpHeld: false,
    run: false,
    reload: false,
    melee: false,
    switchTo: -1,
    switchDelta: 0
  };
}

export class CharacterMotor {
  constructor(collision, team) {
    this.collision = collision;
    this.team = team;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.groundSolid = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.surfing = false;
    this.surfGrace = 0;
    this.paint = 0; // 1 propia, -1 enemiga, 0 nada
    this.airTime = 0;
    this.justLanded = 0; // velocidad de impacto del último aterrizaje (evento)
    this.justJumped = false;
    this.speedMult = 1;
    this.aiming = false;
    this.reloading = false;
    this.locked = false; // sin control (muerte, cinemáticas)
    this.fallSpeed = 0;
    this._ground = { height: 0, solid: null };
    this._l = { x: 0, z: 0 };
  }

  teleport(x, y, z) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.surfing = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
  }

  addImpulse(x, y, z) {
    this.vel.x += x;
    this.vel.y += y;
    this.vel.z += z;
    if (y > 0) this.grounded = false;
  }

  /**
   * intent: ver makeIntent(); env.paintAt(x,z) → equipo (0/1) o -1
   */
  update(dt, intent, env) {
    this.justLanded = 0;
    this.justJumped = false;

    // pintura bajo los pies
    const p = env.paintAt(this.pos.x, this.pos.z);
    this.paint = !this.grounded ? 0 : p < 0 ? 0 : p === this.team ? 1 : -1;

    // surf: Shift sobre pintura propia (con margen para cruzar huecos)
    const wantSurf = intent.run && !this.locked && !this.reloading;
    if (wantSurf && this.paint === 1) this.surfGrace = 0.16;
    else if (this.grounded) this.surfGrace -= dt;
    const wasSurfing = this.surfing;
    this.surfing = wantSurf && this.surfGrace > 0 && (this.grounded || wasSurfing);
    if (!wantSurf) this.surfGrace = 0;

    // velocidad objetivo
    let speed = PLAYER.walkSpeed;
    if (intent.run && !intent.aim) speed = PLAYER.runSpeed;
    if (this.paint === 1 && !this.surfing) speed *= PLAYER.ownPaintMult;
    if (this.paint === -1) speed *= PLAYER.enemyPaintMult;
    if (intent.aim && !this.surfing) speed *= PLAYER.aimSpeedMult;
    if (this.reloading) speed *= PLAYER.reloadSpeedMult;
    speed *= this.speedMult;

    let mx = intent.moveX;
    let mz = intent.moveZ;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    if (this.locked) {
      mx = 0;
      mz = 0;
    }

    // salto: buffer + coyote
    if (intent.jump && !this.locked) this.jumpBuffer = PLAYER.jumpBuffer;
    else this.jumpBuffer -= dt;
    if (this.grounded) this.coyote = PLAYER.coyoteTime;
    else this.coyote -= dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = PLAYER.jumpVelocity * (this.surfing ? 1.08 : 1) * (this.paint === -1 ? 0.85 : 1);
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.justJumped = true;
    }

    // movimiento horizontal
    const vx = this.vel.x;
    const vz = this.vel.z;
    if (this.surfing) {
      // carving: la dirección gira con velocidad angular limitada
      let cur = Math.hypot(vx, vz);
      let dirX = cur > 0.1 ? vx / cur : mx || Math.sin(intent.lookYaw);
      let dirZ = cur > 0.1 ? vz / cur : mz || Math.cos(intent.lookYaw);
      if (ml > 0.1) {
        const target = Math.atan2(mx, mz);
        const currentA = Math.atan2(dirX, dirZ);
        let diff = target - currentA;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const brake = Math.abs(diff) > 2.4;
        const step = clamp(diff, -PLAYER.surfTurnRate * dt, PLAYER.surfTurnRate * dt);
        const na = currentA + step;
        dirX = Math.sin(na);
        dirZ = Math.cos(na);
        const targetSpeed = brake ? PLAYER.walkSpeed : PLAYER.surfSpeed * (this.paint === 1 ? 1 : 0.85);
        cur += clamp(targetSpeed - cur, -PLAYER.surfAccel * 1.6 * dt, PLAYER.surfAccel * dt);
      } else {
        cur += clamp(PLAYER.surfSpeed * 0.8 - cur, -8 * dt, PLAYER.surfAccel * dt);
      }
      this.vel.x = dirX * cur;
      this.vel.z = dirZ * cur;
    } else {
      const tx = mx * speed;
      const tz = mz * speed;
      let accel;
      if (this.grounded) accel = ml > 0.05 ? PLAYER.accelGround : PLAYER.decelGround;
      else accel = PLAYER.accelAir * (ml > 0.05 ? 1 : 0.25) * PLAYER.airControl * 2;
      const dx = tx - vx;
      const dz = tz - vz;
      const dl = Math.hypot(dx, dz);
      const maxStep = accel * dt;
      if (dl <= maxStep) {
        this.vel.x = tx;
        this.vel.z = tz;
      } else {
        this.vel.x += (dx / dl) * maxStep;
        this.vel.z += (dz / dl) * maxStep;
      }
      // en el aire se conserva el impulso (p. ej. salto desde surf): sólo se
      // corrige la dirección y la velocidad decae suavemente
      if (!this.grounded) {
        const prev = Math.hypot(vx, vz);
        const now = Math.hypot(this.vel.x, this.vel.z);
        const keep = prev * (1 - 0.35 * dt);
        if (prev > speed && now < keep) {
          const k = keep / Math.max(now, 1e-4);
          this.vel.x *= k;
          this.vel.z *= k;
        }
      }
    }

    // integración con subpasos
    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    const wasGrounded = this.grounded;
    let minVy = 0;
    for (let i = 0; i < steps; i++) {
      this._step(h, intent);
      minVy = Math.min(minVy, this.vel.y);
    }
    if (!wasGrounded && this.grounded) {
      this.justLanded = Math.max(0.5, -minVy);
      this.airTime = 0;
    }
    if (!this.grounded) this.airTime += dt;
  }

  _step(h, intent) {
    const c = this.collision;
    const pos = this.pos;
    const vel = this.vel;
    // depenetración: si los pies quedaron dentro de un sólido transitable, subir
    const inside = c.pointInside(pos.x, pos.y + 0.02, pos.z);
    if (inside && inside.walkable) {
      const top = inside.topAtLocal(inside.toLocal(pos.x, pos.z, this._l).z);
      if (top - pos.y < 0.9) {
        pos.y = top;
        if (vel.y < 0) vel.y = 0;
      }
    }
    // horizontal
    pos.x += vel.x * h;
    pos.z += vel.z * h;
    const contacts = c.resolveCircle(pos, PLAYER.radius, pos.y, PLAYER.height, PLAYER.stepHeight);
    if (contacts > 0) {
      const nx = c.lastNormalX;
      const nz = c.lastNormalZ;
      const vn = vel.x * nx + vel.z * nz;
      if (vn < 0) {
        vel.x -= nx * vn;
        vel.z -= nz * vn;
        if (this.surfing) {
          // rebote suave al surfear contra una pared
          vel.x *= 0.92;
          vel.z *= 0.92;
        }
      }
    }
    // vertical
    const g = vel.y > 0 ? (intent.jumpHeld ? PLAYER.gravityUp : PLAYER.gravityUp * 2.1) : PLAYER.gravityDown;
    vel.y = Math.max(-PLAYER.maxFallSpeed, vel.y - g * h);
    const prevY = pos.y;
    pos.y += vel.y * h;
    // se busca suelo desde la altura ANTERIOR del subpaso: nunca se atraviesa una losa
    const reach = this.grounded ? PLAYER.stepHeight : 0.06;
    const ground = c.groundHeight(pos.x, pos.z, 0.3, Math.max(prevY, pos.y) + reach, this._ground);
    if (vel.y <= 0 && pos.y <= ground + 1e-4) {
      pos.y = ground;
      vel.y = 0;
      this.grounded = true;
      this.groundSolid = this._ground.solid;
    } else if (this.grounded && vel.y <= 0 && ground > -1e5 && pos.y - ground <= PLAYER.groundSnap) {
      pos.y = ground;
      vel.y = 0;
      this.groundSolid = this._ground.solid;
    } else {
      this.grounded = false;
    }
    // techo
    if (vel.y > 0) {
      const ceil = c.ceiling(pos.x, pos.z, PLAYER.radius, pos.y, PLAYER.height);
      if (pos.y + PLAYER.height > ceil) {
        pos.y = ceil - PLAYER.height;
        vel.y = 0;
      }
    }
  }
}

// ── entrada del jugador ─────────────────────────────────────
export class PlayerInput {
  constructor(input, settings) {
    this.input = input;
    this.settings = settings;
    this.yaw = 0;
    this.pitch = -0.08;
  }

  setView(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  sample(intent, cameraCfg, enabled = true) {
    const inp = this.input;
    const m = inp.consumeMouse();
    const wheel = inp.consumeWheel();
    if (enabled) {
      const sens = cameraCfg.sensitivity * this.settings.sensitivity * (intent.aim ? 0.7 : 1);
      this.yaw -= m.x * sens;
      this.pitch -= m.y * sens * (this.settings.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, cameraCfg.minPitch, cameraCfg.maxPitch);
    }
    const f = (inp.isDown('KeyW') ? 1 : 0) - (inp.isDown('KeyS') ? 1 : 0);
    const r = (inp.isDown('KeyD') ? 1 : 0) - (inp.isDown('KeyA') ? 1 : 0);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    // adelante = (sin, cos); derecha en pantalla = (-cos, sin)
    intent.moveX = enabled ? sy * f - cy * r : 0;
    intent.moveZ = enabled ? cy * f + sy * r : 0;
    intent.lookYaw = this.yaw;
    intent.lookPitch = this.pitch;
    intent.fire = enabled && inp.mouseDown(0);
    intent.firePressed = enabled && inp.mousePressed(0);
    intent.aim = enabled && inp.mouseDown(2);
    intent.jump = enabled && inp.wasPressed('Space');
    intent.jumpHeld = enabled && inp.isDown('Space');
    intent.run = enabled && (inp.isDown('ShiftLeft') || inp.isDown('ShiftRight'));
    intent.reload = enabled && inp.wasPressed('KeyR');
    intent.melee = enabled && inp.wasPressed('KeyF');
    intent.switchTo = -1;
    if (enabled) {
      if (inp.wasPressed('Digit1')) intent.switchTo = 0;
      else if (inp.wasPressed('Digit2')) intent.switchTo = 1;
      else if (inp.wasPressed('Digit3')) intent.switchTo = 2;
    }
    intent.switchDelta = enabled ? wheel : 0;
    return intent;
  }
}
