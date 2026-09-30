// HealthSystem: hit points, regeneration, spawn protection and death events.
import { CHARACTER } from '../core/config.js';

export class HealthSystem {
  constructor(owner, onDeath, onDamage) {
    this.owner = owner;
    this.max = CHARACTER.maxHealth;
    this.hp = this.max;
    this.sinceDamage = 99;
    this.invulnerable = 0;
    this.onDeath = onDeath;
    this.onDamage = onDamage;
    this.lastAttacker = null;
  }

  reset(protection = 0) {
    this.hp = this.max;
    this.sinceDamage = 99;
    this.invulnerable = protection;
    this.lastAttacker = null;
  }

  get alive() { return this.hp > 0; }
  get frac() { return this.hp / this.max; }

  damage(amount, attacker, dirFrom) {
    if (!this.alive || this.invulnerable > 0 || amount <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.sinceDamage = 0;
    this.lastAttacker = attacker;
    this.onDamage?.(amount, attacker, dirFrom);
    if (this.hp <= 0) this.onDeath?.(attacker);
    return true;
  }

  update(dt, onEnemyInk) {
    if (!this.alive) return;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.sinceDamage += dt;
    if (this.sinceDamage > CHARACTER.regenDelay && !onEnemyInk && this.hp < this.max) {
      this.hp = Math.min(this.max, this.hp + CHARACTER.regenRate * dt);
    }
  }
}
