import { COLORS } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  BotPersonalities · carácter de cada bot
//  Los pesos multiplican la utilidad de cada estado de la IA; el resto de
//  parámetros ajusta distancias de combate, puntería y manías.
// ─────────────────────────────────────────────────────────────

export const PERSONALITIES = {
  agresivo: {
    id: 'agresivo',
    weights: { paint: 0.8, fight: 1.35, flank: 1.0, retreat: 0.7, regroup: 0.5 },
    reaction: 0.9, // multiplicador del tiempo de reacción
    aimSkill: 0.95, // < 1 = mejor puntería
    lead: 0.75, // cuánto anticipa el movimiento del objetivo
    chase: 1.4, // persistencia persiguiendo (s de memoria extra)
    jumpiness: 1.4,
    inkReserve: 22, // tinta que guarda para pelear mientras pinta
    forward: 0.45, // preferencia por pintar lejos de su base
    height: 0,
    useAim: 0.15, // probabilidad de apuntar (RMB) en combate a media distancia
    surfLove: 0.8
  },
  pintor: {
    id: 'pintor',
    weights: { paint: 1.45, fight: 0.85, flank: 0.55, retreat: 1.0, regroup: 0.8 },
    reaction: 1.1,
    aimSkill: 1.15,
    lead: 0.55,
    chase: 0.6,
    jumpiness: 0.8,
    inkReserve: 10,
    forward: 0.2,
    height: 0,
    useAim: 0.05,
    surfLove: 1.0
  },
  francotirador: {
    id: 'francotirador',
    weights: { paint: 0.9, fight: 1.1, flank: 0.7, retreat: 1.15, regroup: 0.9 },
    reaction: 1.0,
    aimSkill: 0.8,
    lead: 0.9,
    chase: 0.8,
    jumpiness: 0.6,
    inkReserve: 30,
    forward: 0.3,
    height: 1.0,
    useAim: 0.75,
    surfLove: 0.6
  }
};

/** Distancias de combate preferidas por arma [mín, máx]. */
export const WEAPON_RANGES = {
  blaster: [9, 17],
  splasher: [4.5, 10],
  roller: [0, 3.2]
};

// Nombres originales para las etiquetas sobre la cabeza
export const BOT_ROSTER = [
  {
    name: 'BROCHAZO',
    team: 0,
    personality: 'pintor',
    loadout: ['roller', 'splasher'],
    lane: 'west',
    look: { hoodie: 0xf3e6cf, pants: 0x5b5570, accessory: 'cap', accColor: COLORS.mint }
  },
  {
    name: 'PINTURÍN',
    team: 0,
    personality: 'francotirador',
    loadout: ['blaster', 'splasher'],
    lane: 'east',
    look: { hoodie: 0x9fcfb8, accessory: 'antenna', accColor: 0xf6d77a }
  },
  {
    name: 'CHURRETE',
    team: 1,
    personality: 'agresivo',
    loadout: ['splasher', 'roller'],
    lane: 'center',
    look: { hoodie: 0x3a3548, pants: 0x2f2b3d, accessory: 'scarf', accColor: 0xf2a7c3 }
  },
  {
    name: 'RODILLO REX',
    team: 1,
    personality: 'pintor',
    loadout: ['roller', 'blaster'],
    lane: 'east',
    look: { hoodie: 0xf2a7c3, accessory: 'crown', accColor: 0xffd35c }
  },
  {
    name: 'DOÑA GOTAS',
    team: 1,
    personality: 'francotirador',
    loadout: ['blaster', 'splasher'],
    lane: 'west',
    look: { hoodie: 0xc7b8e0, pants: 0x4a4458, accessory: 'headphones', accColor: 0x7fe3c8 }
  }
];
