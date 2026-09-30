// PlayerController: turns keyboard/mouse into character intent and resolves
// the aim point under the crosshair.
import * as THREE from 'three';
import { makeHit } from '../world/CollisionWorld.js';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();
const _hit = makeHit();

export class PlayerController {
  constructor(game, character) {
    this.game = game;
    this.char = character;
    this.input = game.input;
    this.cam = game.cameraController;
    this.jumpBuf = 0;
    this.aimTarget = null;
  }

  updateLook(dt, it) {
    const { dx, dy } = this.input.consumeMouse();
    this.cam.look(dx, dy);
    it.aimYaw = this.cam.yaw;
    it.aimPitch = this.cam.pitch;
  }

  onSpawn() {
    this.jumpBuf = 0;
  }

  update(dt, it) {
    const inp = this.input;
    this.updateLook(dt, it);
    const yaw = this.cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const f = (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0) - (inp.down('KeyS') || inp.down('ArrowDown') ? 1 : 0);
    const r = (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') ? 1 : 0);
    it.moveX = fx * f + rx * r;
    it.moveZ = fz * f + rz * r;
    it.run = inp.down('ShiftLeft') || inp.down('ShiftRight');
    if (inp.hit('Space')) this.jumpBuf = 0.15;
    this.jumpBuf -= dt;
    it.jump = this.jumpBuf > 0;
    if (it.jump && this.char.motor.grounded) this.jumpBuf = 0;
    it.aiming = inp.mouse.right;
    it.fireHeld = inp.mouse.left;
    it.reload = inp.hit('KeyR');
    it.melee = inp.hit('KeyF') || inp.hit('KeyV');
    it.switchTo = inp.hit('Digit1') || inp.hit('Numpad1') ? 0 : inp.hit('Digit2') || inp.hit('Numpad2') ? 1 : inp.hit('Digit3') || inp.hit('Numpad3') ? 2 : -1;
    this.computeAimPoint(it.aimPoint);
  }

  computeAimPoint(out) {
    this.cam.aimRay(_o, _d);
    const pivot = this.cam.pivot;
    const t0 = Math.max(0, _c.subVectors(pivot, _o).dot(_d));
    _o.addScaledVector(_d, t0);
    let best = 90;
    const wh = this.game.world.raycast(_o, _d, best, _hit);
    if (wh) best = wh.t;
    this.aimTarget = null;
    for (const c of this.game.characters) {
      if (!c.alive || c.team === this.char.team) continue;
      for (const hy of [0.65, 1.3]) {
        _c.copy(c.motor.pos).setY(c.motor.pos.y + hy).sub(_o);
        const t = _c.dot(_d);
        if (t < 0 || t > best) continue;
        const d2 = _c.lengthSq() - t * t;
        if (d2 < 0.55 * 0.55) { best = t; this.aimTarget = c; }
      }
    }
    out.copy(_o).addScaledVector(_d, best);
    return out;
  }
}
