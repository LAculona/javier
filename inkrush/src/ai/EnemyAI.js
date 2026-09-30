// EnemyAI: bot brain used by both enemy and allied bots. Roams towards
// unpainted/strategic spots, paints on the move, fights visible enemies,
// manages ink and unsticks itself.
import * as THREE from 'three';
import { WEAPONS } from '../combat/weapons.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _eye = new THREE.Vector3();

export const DIFFICULTY = {
  easy: { aimError: 7, reaction: 0.75, fireChance: 0.7, sight: 24 },
  normal: { aimError: 4.2, reaction: 0.45, fireChance: 0.9, sight: 30 },
  hard: { aimError: 2.2, reaction: 0.25, fireChance: 1, sight: 36 },
};

export class BotAI {
  constructor(game, character, difficulty = 'normal') {
    this.game = game;
    this.char = character;
    this.skill = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.repathT = 0;
    this.senseT = Math.random() * 0.3;
    this.target = null;
    this.lostT = 0;
    this.reactionT = 0;
    this.strafe = 1;
    this.strafeT = 0;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.errYaw = 0;
    this.errPitch = 0;
    this.sweep = Math.random() * 10;
    this.paintBurst = 0;
    this.jumpCd = 0;
    this.pulse = 0;
    this.thinkT = 0;
  }

  setDifficulty(d) { this.skill = DIFFICULTY[d] || DIFFICULTY.normal; }

  onSpawn() {
    this.path = null;
    this.goal = null;
    this.target = null;
    this.stuckT = 0;
    this.lastPos.copy(this.char.motor.pos);
    // Occasionally change loadout on respawn for variety
    if (Math.random() < 0.3) this.char.weapons.select(Math.floor(Math.random() * WEAPONS.length));
  }

  onDamaged(amount, attacker) {
    if (!this.target && attacker && attacker.alive && attacker.team !== this.char.team) {
      this.target = attacker;
      this.reactionT = this.skill.reaction * 0.7;
      this.lostT = 0;
    }
  }

  findTarget() {
    const me = this.char;
    _eye.copy(me.motor.pos).setY(me.motor.pos.y + 1.45);
    let best = null, bestD = this.skill.sight;
    for (const c of this.game.characters) {
      if (!c.alive || c.team === me.team) continue;
      const d = c.motor.pos.distanceTo(me.motor.pos);
      if (d > bestD) continue;
      _v.copy(c.motor.pos).setY(c.motor.pos.y + 1.1);
      if (!this.game.world.lineOfSight(_eye, _v)) continue;
      best = c; bestD = d;
    }
    return best;
  }

  pickGoal() {
    const nav = this.game.nav;
    const me = this.char;
    const paint = this.game.paint;
    const progress = this.game.match ? this.game.match.progress : 0.5;
    const forward = me.team === 1 ? -1 : 1; // orange attacks towards -z
    let best = null, bestS = -Infinity;
    for (let i = 0; i < 16; i++) {
      const n = nav.randomGoal();
      if (!n) continue;
      const owner = paint.ownerAt(n.pos);
      let s = owner === me.team ? 0 : owner === 0 ? 9 : 12;
      s -= n.pos.distanceTo(me.motor.pos) * 0.09;
      if (n.pos.y > 1) s += 2.5;
      s += n.pos.z * forward * 0.04 * (0.4 + progress);
      s += Math.random() * 5;
      if (s > bestS) { bestS = s; best = n; }
    }
    return best;
  }

  repath(goalNode) {
    const nav = this.game.nav;
    const start = nav.nearest(this.char.motor.pos);
    this.goal = goalNode;
    this.path = nav.path(start, goalNode);
    this.pathIdx = 0;
    this.repathT = 4 + Math.random() * 2;
  }

  // Steering along the current path. Returns desired move vector (x,z) in _w.
  followPath(it) {
    const me = this.char;
    _w.set(0, 0, 0);
    if (!this.path || this.pathIdx >= this.path.length) return false;
    const step = this.path[this.pathIdx];
    const np = step.node.pos;
    const dx = np.x - me.motor.pos.x, dz = np.z - me.motor.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.1 && Math.abs(np.y - me.motor.pos.y) < 1.2) {
      this.pathIdx++;
      return this.followPath(it);
    }
    _w.set(dx / d, 0, dz / d);
    if (step.jump && d < 2.6 && me.motor.grounded && np.y > me.motor.pos.y + 0.4) it.jump = true;
    return true;
  }

  update(dt, it) {
    const me = this.char;
    const w = me.weapons;
    const def = w.def;
    it.jump = false; it.reload = false; it.melee = false; it.switchTo = -1; it.run = false; it.aiming = false;
    this.jumpCd -= dt;

    // Perception
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.2 + Math.random() * 0.12;
      const t = this.findTarget();
      if (t && t !== this.target) { this.reactionT = this.skill.reaction * (0.7 + Math.random() * 0.6); }
      if (t) { this.target = t; this.lostT = 0; }
    }
    if (this.target) {
      this.lostT += dt;
      if (!this.target.alive || this.lostT > 2.2) this.target = null;
    }

    // Ink management
    const lowInk = w.ink < Math.max(def.inkCost * 2, 12);
    if (lowInk && !w.reloading && (!this.target || w.ink < def.inkCost)) it.reload = true;

    let moveX = 0, moveZ = 0;
    it.fireHeld = false;

    if (this.target) {
      const t = this.target;
      const tp = t.motor.pos;
      const dist = tp.distanceTo(me.motor.pos);
      const range = def.botRange;
      // Movement: approach / keep distance / strafe
      _v.subVectors(tp, me.motor.pos).setY(0).normalize();
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 1.2; this.strafe = Math.random() < 0.5 ? -1 : 1; }
      const want = def.roll ? 0.5 : range * 0.65;
      const approach = dist > want + 2 ? 1 : dist < want - 3 ? -0.7 : 0;
      moveX = _v.x * approach + -_v.z * this.strafe * 0.8;
      moveZ = _v.z * approach + _v.x * this.strafe * 0.8;
      if (dist > range + 4) {
        // Chase using the nav graph when far
        this.repathT -= dt;
        if (!this.path || this.repathT <= 0 || this.goal !== this.game.nav.nearest(tp)) this.repath(this.game.nav.nearest(tp));
        if (this.followPath(it)) { moveX = _w.x; moveZ = _w.z; }
        it.run = true;
      }
      if (Math.random() < dt * 0.5 && me.motor.grounded && this.jumpCd <= 0) { it.jump = true; this.jumpCd = 1.5; }

      // Aim with human-like error that drifts over time
      const lead = Math.min(0.5, dist / def.speed);
      _v.copy(tp).setY(tp.y + 1.0).addScaledVector(t.motor.vel, lead * 0.8);
      const err = THREE.MathUtils.degToRad(this.skill.aimError);
      this.errYaw += ((Math.random() - 0.5) * err * 2 - this.errYaw) * Math.min(1, dt * 3);
      this.errPitch += ((Math.random() - 0.5) * err - this.errPitch) * Math.min(1, dt * 3);
      _eye.copy(me.motor.pos).setY(me.motor.pos.y + 1.4);
      const dx = _v.x - _eye.x, dy = _v.y - _eye.y, dz = _v.z - _eye.z;
      const hd = Math.hypot(dx, dz);
      it.aimYaw = Math.atan2(-dx, -dz) + this.errYaw;
      // Compensate projectile drop at long range
      const drop = dist > def.speed * def.straightTime ? (dist - def.speed * def.straightTime) * 0.06 : 0;
      it.aimPitch = Math.atan2(dy, hd) + this.errPitch + drop;
      const cp = Math.cos(it.aimPitch);
      it.aimPoint.set(_eye.x - Math.sin(it.aimYaw) * cp * dist, _eye.y + Math.sin(it.aimPitch) * dist, _eye.z - Math.cos(it.aimYaw) * cp * dist);

      this.reactionT -= dt;
      if (this.reactionT <= 0 && dist < range + 3 && w.ink >= def.inkCost) {
        if (def.roll) {
          // Roller: flick when close, otherwise roll at them
          this.pulse -= dt;
          if (dist < 7 && this.pulse <= 0) { it.fireHeld = true; this.pulse = 0.75; }
          else if (dist < 3) it.fireHeld = false;
          if (dist < 2.2) it.melee = Math.random() < dt * 2;
        } else {
          it.fireHeld = Math.random() < this.skill.fireChance;
        }
      }
      if (dist < 2 && !def.roll && Math.random() < dt * 1.5) it.melee = true;
    } else {
      // Roam & paint
      this.repathT -= dt;
      if (!this.path || this.pathIdx >= this.path.length || this.repathT <= 0) this.repath(this.pickGoal());
      if (this.followPath(it)) { moveX = _w.x; moveZ = _w.z; }
      else { moveX = Math.sin(this.sweep); moveZ = Math.cos(this.sweep); }
      it.run = w.ink > 60 && Math.random() < 0.02 ? true : it.run;

      // Paint the ground ahead with a sweeping aim
      this.sweep += dt * 1.7;
      const mlen = Math.hypot(moveX, moveZ) || 1;
      const fx = moveX / mlen, fz = moveZ / mlen;
      const side = Math.sin(this.sweep) * 0.7;
      const ax = fx * Math.cos(side) - fz * Math.sin(side);
      const az = fz * Math.cos(side) + fx * Math.sin(side);
      const reach = def.roll ? 2 : 6 + Math.sin(this.sweep * 0.7) * 2;
      _v.set(me.motor.pos.x + ax * reach, me.motor.groundY, me.motor.pos.z + az * reach);
      it.aimPoint.copy(_v);
      it.aimYaw = Math.atan2(-ax, -az);
      _eye.copy(me.motor.pos).setY(me.motor.pos.y + 1.4);
      it.aimPitch = Math.atan2(_v.y - _eye.y, reach);
      const owner = this.game.paint.ownerAt(_v, 0.5);
      this.paintBurst -= dt;
      if (owner !== me.team && this.paintBurst <= 0) this.paintBurst = 0.5 + Math.random() * 0.6;
      const wantPaint = this.paintBurst > 0 || Math.random() < 0.02;
      if (def.roll) it.fireHeld = w.ink > 15;
      else it.fireHeld = wantPaint && w.ink > 22;
    }

    // Stuck detection
    const moved = this.lastPos.distanceTo(me.motor.pos);
    if (Math.hypot(moveX, moveZ) > 0.3 && moved < dt * 1.2) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    this.lastPos.copy(me.motor.pos);
    if (this.stuckT > 0.7) {
      if (me.motor.grounded) it.jump = true;
      moveX += (Math.random() - 0.5) * 2;
      moveZ += (Math.random() - 0.5) * 2;
      if (this.stuckT > 1.6) { this.stuckT = 0; this.path = null; }
    }

    it.moveX = moveX;
    it.moveZ = moveZ;
  }
}
