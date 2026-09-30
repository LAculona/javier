import { bus } from '../core/EventBus.js';
import { PLAYER } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  HealthSystem · vida, daño, regeneración y eliminaciones
//  · daño de proyectiles, rodillo y cuerpo a cuerpo
//  · daño periódico sobre pintura enemiga (sin llegar a matar)
//  · regeneración tras unos segundos sin recibir daño
//  · protección al reaparecer y muerte al caer al agua
// ─────────────────────────────────────────────────────────────

export class HealthSystem {
  constructor() {
    this.characters = [];
    this.enabled = true;
  }

  register(ch) {
    ch.hp = PLAYER.maxHP;
    ch.maxHp = PLAYER.maxHP;
    ch.lastHurt = -10;
    ch.lastAttacker = null;
    ch.lastAttackTime = -10;
    ch.contributors = new Map(); // atacante → último instante de daño
    ch.invulnerable = false;
    ch.protectT = 0;
    ch.paintDamageAcc = 0;
    this.characters.push(ch);
  }

  reset(ch) {
    ch.hp = ch.maxHp;
    ch.lastHurt = -10;
    ch.lastAttacker = null;
    ch.contributors.clear();
    ch.paintDamageAcc = 0;
  }

  protect(ch, seconds) {
    ch.protectT = seconds;
    ch.invulnerable = true;
  }

  /** Aplica daño. Devuelve true si el golpe fue letal. */
  damage(attacker, victim, amount, crit, weapon, x, y, z, now) {
    if (!this.enabled || !victim.alive || victim.invulnerable) return false;
    if (attacker && attacker.team === victim.team) return false;
    const dmg = Math.max(1, Math.round(amount));
    victim.hp = Math.max(0, victim.hp - dmg);
    victim.lastHurt = now;
    if (attacker) {
      victim.lastAttacker = attacker;
      victim.lastAttackTime = now;
      victim.contributors.set(attacker, now);
    }
    victim.animator.onHurt(dmg);
    const lethal = victim.hp <= 0;
    bus.emit('damage', { attacker, victim, amount: dmg, crit, lethal, weapon, x, y, z });
    if (lethal) this.kill(victim, attacker, weapon, now);
    return lethal;
  }

  kill(victim, killer, weapon, now, cause = 'hit') {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    const assisters = [];
    for (const [a, t] of victim.contributors) {
      if (a !== killer && now - t < 6 && a.team !== victim.team) assisters.push(a);
    }
    victim.contributors.clear();
    bus.emit('kill', { killer, victim, weapon, assisters, cause });
  }

  update(dt, now, paint) {
    for (const ch of this.characters) {
      if (ch.protectT > 0) {
        ch.protectT -= dt;
        if (ch.protectT <= 0) ch.invulnerable = false;
      }
      if (!ch.alive) continue;
      // caída al agua
      if (ch.isInWater()) {
        const recent = ch.lastAttacker && now - ch.lastAttackTime < 5 ? ch.lastAttacker : null;
        this.kill(ch, recent, 'water', now, 'water');
        continue;
      }
      // pintura enemiga: daño periódico sin matar
      if (ch.motor.paint === -1 && !ch.invulnerable) {
        if (ch.hp > PLAYER.enemyPaintMinHP) {
          ch.paintDamageAcc += PLAYER.enemyPaintDPS * dt;
          if (ch.paintDamageAcc >= 1) {
            const d = Math.floor(ch.paintDamageAcc);
            ch.paintDamageAcc -= d;
            ch.hp = Math.max(PLAYER.enemyPaintMinHP, ch.hp - d);
            ch.lastHurt = now;
            bus.emit('paintHurt', { victim: ch, amount: d });
          }
        }
      } else if (now - ch.lastHurt > PLAYER.regenDelay && ch.hp < ch.maxHp) {
        ch.hp = Math.min(ch.maxHp, ch.hp + PLAYER.regenRate * dt);
      }
    }
  }
}
