// Third-person over-the-shoulder camera with collision, aim zoom and shake.
import * as THREE from 'three';
import { makeHit } from '../world/CollisionWorld.js';

const _pivot = new THREE.Vector3();
const _want = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hit = makeHit();

export class CameraController {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.pitch = -0.08;
    this.sensitivity = 1;
    this.invertY = false;
    this.aimBlend = 0;
    this.dist = 4.3;
    this.pivot = new THREE.Vector3();
    this.shakeAmt = 0;
    this.baseFov = 70;
    this.orbitT = 0;
    this.deathCam = 0;
    camera.rotation.order = 'YXZ';
  }

  look(dx, dy) {
    const s = 0.0022 * this.sensitivity * (1 - this.aimBlend * 0.45);
    this.yaw -= dx * s;
    this.pitch -= dy * s * (this.invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.25, 1.1);
  }

  shake(a) { this.shakeAmt = Math.min(0.5, this.shakeAmt + a); }

  snapBehind(target, yaw) {
    this.yaw = yaw;
    this.pitch = -0.1;
    this.pivot.copy(target).setY(target.y + 1.55);
  }

  follow(dt, targetPos, aiming) {
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * (1 - Math.exp(-12 * dt));
    _pivot.copy(targetPos).setY(targetPos.y + 1.55);
    this.pivot.lerp(_pivot, 1 - Math.exp(-20 * dt));

    const dist = THREE.MathUtils.lerp(4.3, 2.9, this.aimBlend);
    const shoulder = THREE.MathUtils.lerp(0.75, 1.05, this.aimBlend);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fx = -Math.sin(this.yaw) * cp, fy = sp, fz = -Math.cos(this.yaw) * cp;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);

    // Shoulder offset (also collision-checked)
    const shoulderPos = _want.set(this.pivot.x + rx * shoulder, this.pivot.y + 0.15, this.pivot.z + rz * shoulder);
    _dir.set(rx, 0, rz);
    let sd = shoulder;
    if (this.world.raycast(this.pivot, _dir, shoulder + 0.25, _hit)) sd = Math.max(0, _hit.t - 0.25);
    shoulderPos.set(this.pivot.x + rx * sd, this.pivot.y + 0.15, this.pivot.z + rz * sd);

    _dir.set(-fx, -fy, -fz);
    let d = dist;
    if (this.world.raycast(shoulderPos, _dir, dist + 0.3, _hit)) d = Math.max(0.4, _hit.t - 0.3);
    this.dist += (d - this.dist) * (d < this.dist ? 1 : 1 - Math.exp(-6 * dt));

    this.camera.position.copy(shoulderPos).addScaledVector(_dir, this.dist);
    if (this.camera.position.y < 0.3) this.camera.position.y = 0.3;
    this.applyShake(dt);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    const fov = THREE.MathUtils.lerp(this.baseFov, this.baseFov - 20, this.aimBlend);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  applyShake(dt) {
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shakeAmt *= Math.exp(-10 * dt);
    }
  }

  // Slow cinematic orbit (menu / countdown / end screen)
  orbit(dt, center, radius, height, speed = 0.12) {
    this.orbitT += dt * speed;
    const a = this.orbitT;
    this.camera.position.set(center.x + Math.sin(a) * radius, height, center.z + Math.cos(a) * radius);
    this.camera.lookAt(center);
    if (this.camera.fov !== this.baseFov) { this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix(); }
  }

  // Camera that looks at the killer while dead
  deathView(dt, victimPos, killerPos) {
    _want.copy(victimPos).setY(victimPos.y + 5);
    this.camera.position.lerp(_want.set(victimPos.x + 3, victimPos.y + 4.5, victimPos.z + 3), 1 - Math.exp(-3 * dt));
    const look = killerPos || victimPos;
    const m = new THREE.Matrix4().lookAt(this.camera.position, look, this.camera.up);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    this.camera.quaternion.slerp(q, 1 - Math.exp(-4 * dt));
    this.applyShake(dt);
  }

  aimRay(outOrigin, outDir) {
    outOrigin.copy(this.camera.position);
    this.camera.getWorldDirection(outDir);
  }
}
