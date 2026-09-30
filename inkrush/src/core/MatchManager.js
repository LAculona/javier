// MatchManager: countdown, match clock, final territory and results.
import { MATCH, TEAM } from './config.js';

const COUNTDOWN = [
  { at: 0, text: 'PREPARADOS', cls: 'small', sound: 'whistle' },
  { at: 1.5, text: '3', sound: 'countdown' },
  { at: 2.5, text: '2', sound: 'countdown' },
  { at: 3.5, text: '1', sound: 'countdown' },
  { at: 4.5, text: '¡A PINTAR!', cls: 'go', sound: 'go' },
];

export class MatchManager {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    this.duration = MATCH.duration;
    this.timeLeft = this.duration;
    this.t = 0;
    this.step = -1;
    this.lastTick = 99;
    this.results = null;
  }

  get progress() { return 1 - this.timeLeft / this.duration; }
  get playing() { return this.state === 'playing'; }

  start() {
    this.state = 'countdown';
    this.t = 0;
    this.step = -1;
    this.timeLeft = this.duration;
    this.lastTick = 99;
    this.results = null;
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'countdown') {
      this.t += dt;
      while (this.step + 1 < COUNTDOWN.length && this.t >= COUNTDOWN[this.step + 1].at) {
        this.step++;
        const s = COUNTDOWN[this.step];
        g.ui.countdown(s.text, s.cls || '');
        g.audio.play(s.sound);
        if (this.step === COUNTDOWN.length - 1) {
          this.state = 'playing';
          g.audio.startMusic('match');
        }
      }
    } else if (this.state === 'playing') {
      this.timeLeft -= dt;
      const sec = Math.ceil(this.timeLeft);
      if (sec <= 10 && sec < this.lastTick && sec > 0) {
        this.lastTick = sec;
        g.audio.play('tick');
      }
      if (this.timeLeft <= 30) g.audio.setMusicIntense(true);
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.end();
      }
    } else if (this.state === 'ended') {
      this.t += dt;
      if (!this.shown && this.t > 2.6) {
        this.shown = true;
        g.showResults(this.results);
      }
    }
  }

  end() {
    this.state = 'ended';
    this.t = 0;
    this.shown = false;
    this.results = this.computeResults();
    this.game.onMatchEnd(this.results);
  }

  static score(s) { return Math.round(s.paint * 8 + s.kills * 120); }

  computeResults() {
    const g = this.game;
    const pct = g.paint.percentages();
    const o = pct[TEAM.ORANGE], b = pct[TEAM.BLUE];
    const winner = Math.abs(o - b) < 0.05 ? 0 : o > b ? TEAM.ORANGE : TEAM.BLUE;
    const rows = g.characters.map((c) => ({
      name: c.name, team: c.team, isPlayer: c.isPlayer,
      kills: c.stats.kills, deaths: c.stats.deaths, paint: c.stats.paint,
      score: MatchManager.score(c.stats),
    })).sort((a, z) => z.score - a.score);
    const p = g.player.stats;
    return {
      pct, winner, rows,
      playerTeam: g.player.team,
      player: { kills: p.kills, deaths: p.deaths, paint: p.paint, score: MatchManager.score(p) },
    };
  }
}
