// ─────────────────────────────────────────────────────────────
//  Icons · iconos SVG originales de la interfaz (armas, vida, gota)
//  Trazo grueso del color de tinta y relleno con currentColor para que
//  el color de equipo se herede del CSS.
// ─────────────────────────────────────────────────────────────

const S = 'stroke="#241b33" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';

export const WEAPON_ICONS = {
  blaster: `<svg viewBox="0 0 72 40" aria-hidden="true"><g ${S}>
    <path d="M8 15 Q8 11 12 11 H44 Q50 11 50 17 V19 H62 Q66 19 66 22.5 Q66 26 62 26 H50 Q48 27 46 27 H33 L30 36 H20 L23 27 H12 Q8 27 8 23 Z" fill="currentColor"/>
    <circle cx="25" cy="10.5" r="7.5" fill="#fff3e0"/>
    <path d="M19.5 11.5 Q25 16 30.5 11.5 V13 Q25 18 19.5 13 Z" fill="currentColor" stroke-width="0"/>
    <path d="M52 19 V26" stroke-width="2.5"/>
    <path d="M13 16 H22" stroke="#fff3e0" stroke-width="2.5"/>
  </g></svg>`,
  roller: `<svg viewBox="0 0 72 40" aria-hidden="true"><g ${S}>
    <path d="M6 32 L30 18" stroke-width="5"/>
    <path d="M6 32 L30 18" stroke="#c7b8e0" stroke-width="2"/>
    <path d="M28 19 L38 13" stroke-width="3"/>
    <rect x="36" y="4" width="30" height="16" rx="7" fill="currentColor"/>
    <path d="M42 7 V17 M49 7 V17 M56 7 V17" stroke-width="2" opacity="0.55"/>
    <circle cx="18" cy="25" r="6" fill="#fff3e0"/>
    <path d="M36 26 Q40 34 44 26" fill="currentColor"/>
  </g></svg>`,
  splasher: `<svg viewBox="0 0 72 40" aria-hidden="true"><g ${S}>
    <path d="M10 14 Q10 10 14 10 H40 L52 6 Q56 5 57 8 L60 20 Q61 24 57 24 L46 22 H38 L35 34 H25 L27 24 H14 Q10 24 10 20 Z" fill="currentColor"/>
    <ellipse cx="22" cy="9" rx="9" ry="6" fill="#fff3e0"/>
    <path d="M62 10 L68 7 M63 15 L69 15 M62 20 L68 23" stroke-width="2.5"/>
  </g></svg>`,
  melee: `<svg viewBox="0 0 72 40" aria-hidden="true"><g ${S}>
    <path d="M22 10 Q22 6 26 6 H44 Q50 6 50 12 V26 Q50 32 44 32 H28 Q22 32 22 26 Z" fill="currentColor"/>
    <path d="M30 6 V16 M37 6 V16 M44 7 V16" stroke-width="2.5"/>
    <path d="M10 14 L4 12 M10 20 L3 20 M10 26 L4 28" stroke-width="2.5"/>
  </g></svg>`,
  water: `<svg viewBox="0 0 72 40" aria-hidden="true"><g ${S}>
    <path d="M6 22 Q14 14 22 22 T38 22 T54 22 T70 22" fill="none" stroke="#3fe0ff" stroke-width="4"/>
    <path d="M6 30 Q14 22 22 30 T38 30 T54 30 T70 30" fill="none" stroke="#fff3e0" stroke-width="3"/>
  </g></svg>`
};

export const DROP_ICON = `<svg viewBox="0 0 40 48" aria-hidden="true"><path d="M20 3 C27 15 36 22 36 31 A16 16 0 0 1 4 31 C4 22 13 15 20 3 Z" fill="currentColor" stroke="#241b33" stroke-width="3.5" stroke-linejoin="round"/><path d="M20 22 V36 M13 29 H27" stroke="#fff3e0" stroke-width="4" stroke-linecap="round"/></svg>`;

export const SKULL_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 Q34 4 34 17 Q34 24 29 27 V33 Q29 35 27 35 H13 Q11 35 11 33 V27 Q6 24 6 17 Q6 4 20 4 Z" fill="#fff3e0" stroke="#241b33" stroke-width="3" stroke-linejoin="round"/><circle cx="14.5" cy="18" r="4" fill="#241b33"/><circle cx="25.5" cy="18" r="4" fill="#241b33"/><path d="M17 29 V34 M23 29 V34" stroke="#241b33" stroke-width="2.5"/></svg>`;

/** Mancha orgánica procedural (path SVG) para fondos de paneles. */
export function blobPath(seed, cx = 50, cy = 50, r = 40, spikes = 11, jitter = 0.18) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const rr = r * (1 - jitter + rnd() * jitter * 2);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  // curva suave cerrada (Catmull-Rom → Bézier)
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

/** SVG de salpicadura: mancha principal + gotas satélite. */
export function splatSVG(seed, color, extra = '') {
  let s = (seed * 7919) >>> 0 || 3;
  const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  let drops = '';
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 44 + rnd() * 10;
    const rr = 2 + rnd() * 4.5;
    drops += `<circle cx="${(50 + Math.cos(a) * d).toFixed(1)}" cy="${(50 + Math.sin(a) * d).toFixed(1)}" r="${rr.toFixed(1)}"/>`;
  }
  return `<svg class="splat ${extra}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="${color}"><path d="${blobPath(seed, 50, 50, 40, 12, 0.2)}"/>${drops}</g></svg>`;
}
