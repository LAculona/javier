import { bus } from '../core/EventBus.js';

// ─────────────────────────────────────────────────────────────
//  HitStop · congelación breve del juego para dar peso a los golpes
//  40 ms en críticos o golpes letales del jugador; nunca se encadenan
//  más de 3 seguidos en medio segundo para no entorpecer el control.
// ─────────────────────────────────────────────────────────────

export class HitStop {
  constructor(time, getPlayer, ms = 40) {
    this.time = time;
    this.getPlayer = getPlayer;
    this.ms = ms;
    this.recent = 0;
    this.lastAt = -1;
    bus.on('damage', (e) => {
      if (e.attacker !== this.getPlayer() || !(e.crit || e.lethal)) return;
      const now = performance.now();
      if (now - this.lastAt > 500) this.recent = 0;
      if (this.recent >= 3) return;
      this.recent++;
      this.lastAt = now;
      this.time.hitStop(this.ms);
    });
  }
}
