// Kinematic character body shared by the player and bots.
import * as THREE from 'three';
import { CHARACTER } from '../core/config.js';

const _n = new THREE.Vector3();

export class CharacterMotor {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = CHARACTER.radius;
    this.height = CHARACTER.height;
    this.grounded = false;
    this.groundY = 0;
    this.wallNormal = new THREE.Vector3();
    this.touchingWall = false;
    this.landed = false;
    this.airTime = 0;
    this.fallSpeed = 0;
  }

  teleport(p) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.groundY = p.y;
  }

  // wish: desired horizontal velocity (x,z). opts: {jump, climb}
  update(dt, wishX, wishZ, opts = {}) {
    const accel = this.grounded ? CHARACTER.groundAccel : CHARACTER.airAccel;
    const k = Math.min(1, accel * dt / Math.max(0.001, Math.hypot(wishX - this.vel.x, wishZ - this.vel.z)));
    this.vel.x += (wishX - this.vel.x) * Math.min(1, k * 1);
    this.vel.z += (wishZ - this.vel.z) * Math.min(1, k * 1);

    this.landed = false;
    if (opts.jump && this.grounded) {
      this.vel.y = opts.jumpSpeed ?? CHARACTER.jumpSpeed;
      this.grounded = false;
    }
    if (opts.climb) {
      this.vel.y = Math.max(this.vel.y, CHARACTER.climbSpeed);
    } else {
      this.vel.y -= CHARACTER.gravity * dt;
    }
    if (this.vel.y < -30) this.vel.y = -30;

    // Horizontal move + slide
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.touchingWall = this.world.resolveCylinder(this.pos, this.radius, this.height, CHARACTER.stepHeight, _n);
    if (this.touchingWall) {
      this.wallNormal.copy(_n);
      const into = this.vel.x * _n.x + this.vel.z * _n.z;
      if (into < 0) { this.vel.x -= _n.x * into; this.vel.z -= _n.z * into; }
    }

    // Vertical
    const wasGrounded = this.grounded;
    this.fallSpeed = -this.vel.y;
    this.pos.y += this.vel.y * dt;
    const ground = this.world.groundHeight(this.pos.x, this.pos.z, this.pos.y + CHARACTER.stepHeight, this.radius * 0.6);
    this.groundY = ground;
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      if (this.vel.y <= 0) {
        if (!wasGrounded && this.airTime > 0.25) this.landed = true;
        this.vel.y = 0;
        this.grounded = true;
      }
    } else if (wasGrounded && this.vel.y <= 0 && this.pos.y - ground < 0.4) {
      this.pos.y = ground; // stick to ramps / small drops
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    this.airTime = this.grounded ? 0 : this.airTime + dt;

    const ceil = this.world.ceilingHeight(this.pos.x, this.pos.z, this.pos.y, this.radius);
    if (this.pos.y + this.height > ceil) {
      this.pos.y = ceil - this.height;
      if (this.vel.y > 0) this.vel.y = 0;
    }

    // Safety: never fall out of the world
    if (this.pos.y < -10) {
      this.pos.y = 2;
      this.vel.set(0, 0, 0);
    }
  }
}
