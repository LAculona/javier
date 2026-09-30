import * as THREE from 'three';
import { CAMERA } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  CameraController · cámara por encima del hombro
//  Seguimiento con amortiguación, ligero lag de rotación, colisión con el
//  entorno (se acerca en vez de atravesar), FOV dinámico (correr, surf,
//  apuntar), bobbing muy sutil, retroceso visual y screen shake.
// ─────────────────────────────────────────────────────────────

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function dampAngle(a, b, k, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}

export class CameraController {
  constructor(camera, collision) {
    this.camera = camera;
    this.collision = collision;
    this.yaw = 0;
    this.pitch = -0.1;
    this.pivot = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(-1, 0, 0);
    this.baseFov = CAMERA.fov;
    this.fov = CAMERA.fov;
    this.dist = CAMERA.distance;
    this.shoulder = CAMERA.shoulder;
    this.height = CAMERA.height;
    this.kickPitch = 0;
    this.kickVel = 0;
    this.bobPhase = 0;
    this.initialized = false;
    this._look = new THREE.Vector3();
    this._des = new THREE.Vector3();
    this._hit = {};
    this.surfBlend = 0;
    this.aimBlend = 0;
    this.runBlend = 0;
  }

  snap(target, yaw, pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.pivot.set(target.x, target.y + CAMERA.height, target.z);
    this.initialized = false;
  }

  kick(amount) {
    this.kickVel += amount;
  }

  /**
   * s: { pos (pies), speed, surfing, running, aiming, grounded }
   */
  update(dt, s, yaw, pitch, shake) {
    // lag de rotación
    this.yaw = dampAngle(this.yaw, yaw, CAMERA.rotationLag, dt);
    this.pitch = damp(this.pitch, pitch, CAMERA.rotationLag, dt);
    // retroceso visual (muelle)
    this.kickVel += (-this.kickPitch * 260 - this.kickVel * 22) * dt;
    this.kickPitch += this.kickVel * dt;

    this.aimBlend = damp(this.aimBlend, s.aiming ? 1 : 0, 14, dt);
    this.surfBlend = damp(this.surfBlend, s.surfing ? 1 : 0, 6, dt);
    this.runBlend = damp(this.runBlend, s.running && !s.surfing ? 1 : 0, 6, dt);

    // pivote amortiguado (más suave en vertical)
    const tx = s.pos.x;
    const ty = s.pos.y + CAMERA.height + (CAMERA.aimHeight - CAMERA.height) * this.aimBlend;
    const tz = s.pos.z;
    if (!this.initialized) {
      this.pivot.set(tx, ty, tz);
      this.initialized = true;
    }
    this.pivot.x = damp(this.pivot.x, tx, CAMERA.followStiffness, dt);
    this.pivot.z = damp(this.pivot.z, tz, CAMERA.followStiffness, dt);
    this.pivot.y = damp(this.pivot.y, ty, s.grounded ? 12 : 7, dt);

    const p = this.pitch + this.kickPitch + (shake ? shake.pitch : 0);
    const yw = this.yaw + (shake ? shake.yaw : 0);
    const cp = Math.cos(p);
    this.dir.set(Math.sin(yw) * cp, Math.sin(p), Math.cos(yw) * cp);
    this.right.set(-Math.cos(yw), 0, Math.sin(yw));

    const distTarget = CAMERA.distance + (CAMERA.aimDistance - CAMERA.distance) * this.aimBlend + this.surfBlend * 0.55;
    const shoulder = CAMERA.shoulder + (CAMERA.aimShoulder - CAMERA.shoulder) * this.aimBlend;

    // bobbing sutil al andar
    const speed = s.speed || 0;
    if (s.grounded && !s.surfing) this.bobPhase += dt * (4 + speed * 1.3);
    const bob = Math.sin(this.bobPhase * 2) * CAMERA.bobAmount * clamp(speed / 6, 0, 1) * (1 - this.aimBlend);

    // punto de hombro y posición deseada
    const sx = this.pivot.x + this.right.x * shoulder;
    const sy = this.pivot.y + bob;
    const sz = this.pivot.z + this.right.z * shoulder;
    // colisión: primero pivote→hombro, luego hombro→cámara
    let shoulderK = 1;
    const c = this.collision;
    const r = CAMERA.collisionRadius;
    {
      const dx = sx - this.pivot.x;
      const dz = sz - this.pivot.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-3) {
        const hit = c.raycast(this.pivot.x, this.pivot.y, this.pivot.z, dx / len, 0, dz / len, len + r, camFilter, this._hit);
        if (hit) shoulderK = clamp((hit.t - r) / len, 0, 1);
      }
    }
    const ox = this.pivot.x + (sx - this.pivot.x) * shoulderK;
    const oz = this.pivot.z + (sz - this.pivot.z) * shoulderK;
    let dist = distTarget;
    {
      const hit = c.raycast(ox, sy, oz, -this.dir.x, -this.dir.y, -this.dir.z, distTarget + r, camFilter, this._hit);
      if (hit) dist = Math.max(0.35, hit.t - r);
    }
    // acercarse rápido, alejarse suave
    this.dist = dist < this.dist ? dist : damp(this.dist, dist, 5, dt);
    this.position.set(ox - this.dir.x * this.dist, sy - this.dir.y * this.dist, oz - this.dir.z * this.dist);
    // no bajar del suelo
    const ground = c.groundHeight(this.position.x, this.position.z, 0.05, this.position.y + 0.5);
    if (ground > -1e5 && this.position.y < ground + 0.25) this.position.y = ground + 0.25;

    if (shake) {
      this.position.addScaledVector(this.right, shake.offsetX);
      this.position.y += shake.offsetY;
    }

    // FOV
    const fovTarget =
      this.baseFov + (CAMERA.runFov - CAMERA.fov) * this.runBlend + (CAMERA.surfFov - CAMERA.fov) * this.surfBlend + (CAMERA.aimFov - this.baseFov) * this.aimBlend;
    this.fov = damp(this.fov, fovTarget, 8, dt);

    this.apply(shake ? shake.roll : 0);
  }

  apply(roll = 0) {
    const cam = this.camera;
    cam.position.copy(this.position);
    this._look.copy(this.position).add(this.dir);
    cam.up.set(0, 1, 0);
    cam.lookAt(this._look);
    if (roll) cam.rotateZ(roll);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  /** Coloca la cámara libremente (cinemáticas, cámara de muerte, menú). */
  setFree(pos, look, fov) {
    this.position.copy(pos);
    this.dir.copy(look).sub(pos).normalize();
    if (fov) this.fov = fov;
    this.apply(0);
  }
}

function camFilter(s) {
  return s.blocksCamera;
}
