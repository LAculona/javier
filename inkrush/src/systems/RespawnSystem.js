// RespawnSystem: timed respawns at the team base with spawn protection.
import { MATCH } from '../core/config.js';

export class RespawnSystem {
  constructor(game, spawns) {
    this.game = game;
    this.spawns = spawns;
    this.queue = [];
  }

  clear() { this.queue.length = 0; }

  schedule(char, delay = MATCH.respawnTime) {
    this.queue.push({ char, t: delay, total: delay });
  }

  timeLeft(char) {
    const e = this.queue.find((q) => q.char === char);
    return e ? Math.max(0, e.t) : 0;
  }

  spawnPoint(team, index) {
    const list = this.spawns[team];
    // Prefer the spawn slot farthest from other living teammates to avoid stacking
    let best = list[index % list.length], bestD = -1;
    for (const p of list) {
      let dmin = Infinity;
      for (const c of this.game.characters) {
        if (c.alive && c.team === team) dmin = Math.min(dmin, c.motor.pos.distanceTo(p));
      }
      if (dmin > bestD) { bestD = dmin; best = p; }
    }
    return best;
  }

  spawn(char, protection = MATCH.spawnProtection, index = 0) {
    const p = this.spawnPoint(char.team, index);
    const yaw = char.team === 1 ? 0 : Math.PI; // face the enemy base
    char.spawnAt(p, yaw, protection);
    this.game.fx.respawn(p, char.team);
    this.game.audio.play('spawn', char.isPlayer ? null : p);
    if (char.isPlayer) this.game.onPlayerRespawn();
  }

  spawnAll() {
    this.clear();
    const perTeam = { 1: 0, 2: 0 };
    for (const c of this.game.characters) {
      const list = this.spawns[c.team];
      const p = list[perTeam[c.team]++ % list.length];
      c.spawnAt(p, c.team === 1 ? 0 : Math.PI, 0);
    }
  }

  update(dt) {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const e = this.queue[i];
      e.t -= dt;
      if (e.t <= 0) {
        this.queue.splice(i, 1);
        this.spawn(e.char);
      }
    }
  }
}
