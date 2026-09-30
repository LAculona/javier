import { Weapon, buildWeaponModel } from './WeaponBase.js';
import { bevelBox, cylinder, torus, trs } from '../../world/GeometryKit.js';
import { COLORS, WEAPONS } from '../../config.js';

// BLASTER · equilibrada: cadencia media, dispersión moderada, 22 m de alcance.
export class Blaster extends Weapon {
  constructor(team) {
    super(WEAPONS.blaster, team);
    this.muzzle.position.set(0, 0.08, 0.46);
  }

  buildModel(team) {
    const tc = COLORS.team[team];
    const body = 0xf6f0e6;
    const dark = 0x3b3350;
    const X = Math.PI / 2;
    return buildWeaponModel(
      [
        [bevelBox(0.11, 0.12, 0.34, { bevel: 0.035 }), trs(0, 0.07, 0.1), body],
        [bevelBox(0.115, 0.032, 0.22, { bevel: 0.012 }), trs(0, 0.055, 0.12), tc.main],
        [bevelBox(0.06, 0.03, 0.26, { bevel: 0.01 }), trs(0, 0.145, 0.08), dark],
        [cylinder(0.034, 0.04, 0.18, 14), trs(0, 0.08, 0.34, X, 0, 0), dark],
        [torus(0.043, 0.015, 8, 18), trs(0, 0.08, 0.43), tc.main],
        [bevelBox(0.07, 0.15, 0.085, { bevel: 0.025 }), trs(0, -0.035, -0.005, -0.25, 0, 0), dark],
        [torus(0.03, 0.008, 6, 12, Math.PI), trs(0, 0.005, 0.055, 0, Math.PI / 2, Math.PI), dark],
        [bevelBox(0.02, 0.07, 0.09, { bevel: 0.008 }), trs(0.062, 0.1, -0.05, 0, 0, 0.35), tc.accent],
        [bevelBox(0.02, 0.07, 0.09, { bevel: 0.008 }), trs(-0.062, 0.1, -0.05, 0, 0, -0.35), tc.accent],
        [cylinder(0.02, 0.02, 0.05, 8), trs(0, 0.16, 0.02), dark]
      ],
      { matrix: trs(0, 0.215, 0.02, 0, 0, 0, 0.36, 0.34, 0.36) },
      team
    );
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
    ws.shoot(this, {
      speed: this.cfg.projectileSpeed,
      gravity: this.cfg.projectileGravity,
      damage: this.cfg.damage,
      critMult: this.cfg.critMult,
      splat: this.cfg.splatRadius,
      size: this.cfg.projectileSize,
      range: this.cfg.range,
      trailEvery: this.cfg.trailSplatEvery,
      trailRadius: this.cfg.trailSplatRadius
    });
  }
}
