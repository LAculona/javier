import { Weapon, buildWeaponModel } from './WeaponBase.js';
import { bevelBox, cylinder, torus, trs } from '../../world/GeometryKit.js';
import { COLORS, WEAPONS } from '../../config.js';

// SPLASHER · ráfaga caótica: mucha cadencia, poco daño, gran dispersión.
export class Splasher extends Weapon {
  constructor(team) {
    super(WEAPONS.splasher, team);
    this.muzzle.position.set(0, 0.095, 0.38);
    this.nozzle = 0;
  }

  buildModel(team) {
    const tc = COLORS.team[team];
    const body = 0xeee6f6;
    const dark = 0x3b3350;
    const X = Math.PI / 2;
    const parts = [
      [bevelBox(0.15, 0.15, 0.3, { bevel: 0.05 }), trs(0, 0.08, 0.1), body],
      [bevelBox(0.155, 0.04, 0.2, { bevel: 0.015 }), trs(0, 0.03, 0.12), tc.main],
      [bevelBox(0.07, 0.15, 0.085, { bevel: 0.025 }), trs(0, -0.035, -0.02, -0.2, 0, 0), dark],
      [bevelBox(0.09, 0.055, 0.11, { bevel: 0.02 }), trs(0, 0.0, 0.24), dark],
      [bevelBox(0.13, 0.05, 0.05, { bevel: 0.018 }), trs(0, 0.17, 0.2), dark]
    ];
    // tres toberas en triángulo
    for (const [x, y] of [
      [-0.036, 0.075],
      [0.036, 0.075],
      [0, 0.125]
    ]) {
      parts.push([cylinder(0.022, 0.026, 0.1, 10), trs(x, y, 0.3, X, 0, 0), dark]);
      parts.push([torus(0.026, 0.008, 6, 12), trs(x, y, 0.35), tc.accent]);
    }
    return buildWeaponModel(parts, { matrix: trs(0, 0.2, 0.06, 0, 0, 0, 0.62, 0.42, 0.62) }, team);
  }

  update(ws, dt, intent) {
    this.cooldown = Math.max(-0.05, this.cooldown - dt);
    if (!intent.fire || !ws.canFire()) return;
    if (this.cooldown > 0) return;
    if (ws.ink < this.cfg.inkPerShot) {
      ws.dry();
      return;
    }
    this.cooldown += 1 / this.cfg.fireRate;
    ws.consume(this.cfg.inkPerShot);
    this.nozzle = (this.nozzle + 1) % 3;
    ws.shoot(this, {
      speed: this.cfg.projectileSpeed * (0.85 + Math.random() * 0.3),
      gravity: this.cfg.projectileGravity,
      damage: this.cfg.damage,
      critMult: this.cfg.critMult,
      splat: this.cfg.splatRadius * (0.8 + Math.random() * 0.4),
      size: this.cfg.projectileSize,
      range: this.cfg.range * (0.85 + Math.random() * 0.25),
      trailEvery: this.cfg.trailSplatEvery,
      trailRadius: this.cfg.trailSplatRadius
    });
  }
}
