// ─────────────────────────────────────────────────────────────
//  INKRUSH · valores de ajuste centralizados
//  Todo lo que afecta al "feel" del juego vive aquí.
// ─────────────────────────────────────────────────────────────

export const TEAM = { ORANGE: 0, BLUE: 1 };

export const COLORS = {
  team: [
    { main: 0xff6a13, accent: 0xffb347, name: 'NARANJA', css: '#FF6A13', cssAccent: '#FFB347' },
    { main: 0x1e6bff, accent: 0x3fe0ff, name: 'AZUL', css: '#1E6BFF', cssAccent: '#3FE0FF' }
  ],
  // Neutros cálidos del escenario (nunca compiten con la pintura)
  cream: 0xf3e6cf,
  creamDark: 0xd9c7a8,
  concrete: 0xc9c2b6,
  concreteDark: 0x9d968c,
  mint: 0x9fcfb8,
  mintDark: 0x6e9e8a,
  lilac: 0xc7b8e0,
  lilacDark: 0x9384b3,
  sand: 0xe6cfa6,
  charcoal: 0x3a3548,
  ink: 0x241b33, // "negro" tintado para contornos y sombras duras
  steel: 0x8d93a3,
  rust: 0xb0785a,
  pink: 0xf2a7c3,
  yellow: 0xf6d77a
};

export const PLAYER = {
  radius: 0.42,
  height: 1.5,
  eyeHeight: 1.32,
  stepHeight: 0.45,
  walkSpeed: 6.0,
  runSpeed: 7.7,
  aimSpeedMult: 0.58,
  reloadSpeedMult: 0.72,
  ownPaintMult: 1.3,
  enemyPaintMult: 0.6,
  surfSpeed: 12.8,
  surfAccel: 30,
  surfTurnRate: 3.4, // rad/s de giro máximo al surfear (carving)
  accelGround: 46,
  decelGround: 40,
  accelAir: 16,
  airControl: 0.45,
  jumpVelocity: 9.4,
  gravityUp: 26,
  gravityDown: 44,
  maxFallSpeed: 32,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  groundSnap: 0.35,
  maxHP: 100,
  regenDelay: 2.6,
  regenRate: 22,
  enemyPaintDPS: 7,
  enemyPaintMinHP: 20,
  tankCapacity: 100,
  refillOwnPaint: 14, // %/s de pie sobre pintura propia
  refillSurf: 40, // %/s surfeando
  refillIdle: 4.5, // %/s fuera de pintura, sin disparar
  refillIdleDelay: 0.9,
  reloadDuration: 1.35,
  meleeDamage: 34,
  meleeRange: 2.1,
  meleeCooldown: 0.65,
  meleeKnockback: 7,
  spawnProtection: 2.2,
  respawnTime: 5.0,
  waterLevel: -1.6,
  killY: -1.2
};

export const CAMERA = {
  distance: 3.15,
  aimDistance: 2.0,
  shoulder: 0.72,
  aimShoulder: 0.9,
  height: 1.55,
  aimHeight: 1.48,
  fov: 70,
  runFov: 75,
  surfFov: 86,
  aimFov: 50,
  minPitch: -1.1,
  maxPitch: 1.2,
  followStiffness: 26,
  rotationLag: 34,
  collisionRadius: 0.22,
  bobAmount: 0.018,
  sensitivity: 0.0022
};

// Tabla de armas (ver documento de diseño)
export const WEAPONS = {
  blaster: {
    id: 'blaster',
    name: 'BLASTER',
    slot: 0,
    damage: 28,
    critMult: 1.5,
    fireRate: 6,
    range: 22,
    inkPerShot: 1.5,
    projectileSpeed: 46,
    projectileGravity: 9,
    spread: 2.2, // grados
    aimSpread: 0.9,
    moveSpreadAdd: 1.6,
    splatRadius: 1.65,
    trailSplatEvery: 3.0,
    trailSplatRadius: 0.66,
    projectileSize: 0.16,
    recoil: 0.018,
    shake: 0.10,
    reticleKick: 7,
    description: 'Equilibrada. Dispersión moderada.'
  },
  roller: {
    id: 'roller',
    name: 'ROLLER',
    slot: 1,
    damage: 90,
    critMult: 1,
    fireRate: 1.4,
    range: 4,
    inkPerSecondRolling: 0.8,
    inkPerFlick: 7,
    rollDamage: 70,
    rollDamageCooldown: 0.7,
    rollWidth: 1.7,
    rollMinSpeed: 1.2,
    flickProjectiles: 7,
    flickSpread: 38, // grados en abanico vertical/horizontal
    projectileSpeed: 17,
    projectileGravity: 16,
    splatRadius: 1.2,
    projectileSize: 0.2,
    recoil: 0.05,
    shake: 0.28,
    reticleKick: 14,
    description: 'Rodar pinta una franja ancha. Clic: barrido vertical.'
  },
  splasher: {
    id: 'splasher',
    name: 'SPLASHER',
    slot: 2,
    damage: 9,
    critMult: 1.5,
    fireRate: 14,
    range: 16,
    inkPerShot: 1.2,
    projectileSpeed: 34,
    projectileGravity: 13,
    spread: 9.5,
    aimSpread: 6,
    moveSpreadAdd: 2.5,
    splatRadius: 1.06,
    trailSplatEvery: 4.0,
    trailSplatRadius: 0.5,
    projectileSize: 0.12,
    recoil: 0.008,
    shake: 0.05,
    reticleKick: 3,
    description: 'Ráfaga caótica con mucha dispersión.'
  }
};

export const WEAPON_ORDER = ['blaster', 'roller', 'splasher'];

export const PAINT = {
  // Región del mapa cubierta por el splat map del suelo (XZ)
  bounds: { minX: -44, maxX: 44, minZ: -64, maxZ: 64 },
  dryTime: 3.6,
  heightTolerance: 0.95,
  territoryInterval: 0.5,
  territoryGrid: 128, // celdas en el eje largo
  maxStampsPerFrame: 256,
  wallDensity: { low: 6, medium: 9, high: 12 }, // texels por metro en paredes
  groundDensity: { low: 8, medium: 12, high: 16 } // texels por metro en suelo
};

export const AI = {
  thinkRate: 10, // Hz
  reactionMin: 0.25,
  reactionMax: 0.45,
  aimErrorFar: 4.2, // grados a 22 m
  aimErrorNear: 0.9, // grados a 3 m
  aimTrackSpeed: 7.5,
  strafeChangeMin: 0.45,
  strafeChangeMax: 1.3,
  jumpChance: 0.18,
  viewDistance: 34,
  fovDeg: 150,
  lowInk: 18,
  lowHP: 38,
  arriveDistance: 1.6,
  separationRadius: 2.2,
  repathInterval: 1.2
};

export const MATCH = {
  duration: 180,
  finalCountdown: 10,
  lastMinute: 60,
  introDuration: 3.0,
  countdownStep: 0.85,
  endSlowmo: 1.6,
  resultsDelay: 6.5
};

export const GRAPHICS_PRESETS = {
  low: {
    label: 'BAJO',
    renderScale: 0.72,
    maxPixelRatio: 1,
    shadowMapSize: 1024,
    shadowRadius: 2,
    shadowExtent: 34,
    ao: false,
    aoHalfRes: true,
    bloom: true,
    bloomResolution: 240,
    outlines: true,
    smaa: 'LOW',
    paintQuality: 'low'
  },
  medium: {
    label: 'MEDIO',
    renderScale: 1,
    maxPixelRatio: 1,
    shadowMapSize: 2048,
    shadowRadius: 3,
    shadowExtent: 40,
    ao: true,
    aoHalfRes: true,
    bloom: true,
    bloomResolution: 360,
    outlines: true,
    smaa: 'MEDIUM',
    paintQuality: 'medium'
  },
  high: {
    label: 'ALTO',
    renderScale: 1,
    maxPixelRatio: 1.5,
    shadowMapSize: 4096,
    shadowRadius: 3,
    shadowExtent: 46,
    ao: true,
    aoHalfRes: false,
    bloom: true,
    bloomResolution: 480,
    outlines: true,
    smaa: 'HIGH',
    paintQuality: 'high'
  }
};

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.85,
  sensitivity: 1.0,
  invertY: false,
  graphics: 'medium',
  fov: 70
};

export const SCORE = {
  kill: 100,
  assist: 50,
  perSquareMeter: 1,
  win: 300
};
