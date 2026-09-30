import { SCORE } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  Stats · estadísticas por jugador durante la partida
//  bajas, muertes, asistencias, m² pintados, rachas y puntuación.
// ─────────────────────────────────────────────────────────────

export class Stats {
  constructor() {
    this.rows = new Map();
  }

  register(ch) {
    this.rows.set(ch, { kills: 0, deaths: 0, assists: 0, painted: 0, streak: 0, bestStreak: 0 });
  }

  reset() {
    for (const r of this.rows.values()) {
      r.kills = 0;
      r.deaths = 0;
      r.assists = 0;
      r.painted = 0;
      r.streak = 0;
      r.bestStreak = 0;
    }
  }

  get(ch) {
    return this.rows.get(ch);
  }

  /** Devuelve la racha actual del asesino (para avisos de racha). */
  onKill(killer, victim, assisters) {
    const v = this.rows.get(victim);
    if (v) {
      v.deaths++;
      v.streak = 0;
    }
    let streak = 0;
    if (killer && killer !== victim) {
      const k = this.rows.get(killer);
      if (k) {
        k.kills++;
        k.streak++;
        k.bestStreak = Math.max(k.bestStreak, k.streak);
        streak = k.streak;
      }
    }
    for (const a of assisters || []) {
      const r = this.rows.get(a);
      if (r) r.assists++;
    }
    return streak;
  }

  addPaint(ch, m2) {
    const r = this.rows.get(ch);
    if (r) r.painted += m2;
  }

  score(ch) {
    const r = this.rows.get(ch);
    if (!r) return 0;
    return Math.round(r.kills * SCORE.kill + r.assists * SCORE.assist + r.painted * SCORE.perSquareMeter);
  }

  /** Tabla final ordenada por puntuación con el MVP marcado. */
  table(characters, winnerTeam) {
    const rows = characters.map((ch) => {
      const r = this.rows.get(ch);
      const s = this.score(ch) + (ch.team === winnerTeam ? SCORE.win : 0);
      return { ch, name: ch.name, team: ch.team, kills: r.kills, deaths: r.deaths, assists: r.assists, painted: Math.round(r.painted), score: s, mvp: false };
    });
    rows.sort((a, b) => b.score - a.score);
    if (rows.length) rows[0].mvp = true;
    return rows;
  }
}
