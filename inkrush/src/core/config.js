// Global tuning values for INKRUSH. Everything gameplay-related lives here so
// balancing does not require digging through systems.

export const TEAM = { NONE: 0, ORANGE: 1, BLUE: 2 };

export const TEAM_INFO = {
  1: { name: 'NARANJA', color: 0xff6a13, css: '#ff6a13', glow: 0xffa060 },
  2: { name: 'AZUL', color: 0x1f7dff, css: '#1f7dff', glow: 0x6fb4ff },
};

export const otherTeam = (t) => (t === TEAM.ORANGE ? TEAM.BLUE : TEAM.ORANGE);

export const MATCH = {
  duration: 180,
  respawnTime: 4,
  spawnProtection: 2.2,
};

export const CHARACTER = {
  radius: 0.42,
  height: 1.75,
  eyeHeight: 1.45,
  stepHeight: 0.55,
  walkSpeed: 6.2,
  runSpeed: 8.8,
  aimSpeedMul: 0.7,
  ownInkMul: 1.3,
  enemyInkMul: 0.5,
  groundAccel: 55,
  airAccel: 16,
  jumpSpeed: 9.1,
  gravity: 25,
  climbSpeed: 5.5,
  maxHealth: 100,
  regenDelay: 3.0,
  regenRate: 30,
};

export const INK = {
  max: 100,
  passiveRefill: 5,
  ownInkRefill: 34,
  refillDelay: 0.35,
  reloadTime: 1.15,
};

export const MELEE = { damage: 38, range: 2.3, cooldown: 0.75, arc: 0.55 };

export const PAINT = {
  atlasSize: 2048,
  cellSize: 0.5,
};

export const BOT_NAMES = {
  1: ['Pixa', 'Tuerca', 'Nimbo'],
  2: ['Voltra', 'Kobalt', 'Zafi', 'Rizo'],
};

export const QUALITY = {
  low: { pixelRatio: 0.75, shadows: false, shadowSize: 512, bloom: false, particles: 0.5 },
  medium: { pixelRatio: 1, shadows: true, shadowSize: 1024, bloom: false, particles: 0.8 },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, bloom: true, particles: 1 },
};
