import * as THREE from 'three';
import { CollisionWorld, Solid } from './Collision.js';
import { PaintAtlas } from '../paint/PaintAtlas.js';
import { StaticBatcher, InstancedProps } from './StaticBatcher.js';
import { bevelBox, lathe, cylinder, torus, sphere, plane, trs, prep } from './GeometryKit.js';
import { concreteBlock, ramp, railing, jersey, planter, walkway, fenceLine } from './props/Structures.js';
import { container, CONTAINER } from './props/Containers.js';
import { registerStreetProps, lamp, bench, bin, cone, barrel, crate, pallet, vending, hydrant } from './props/StreetProps.js';
import { building, kiosk, foodTruck, canopy, teamHQ, cityBlock } from './props/Buildings.js';
import { gantryCrane, containerStack, cargoShip, lighthouse } from './props/Harbor.js';
import { GroundDecor } from './props/GroundDecor.js';
import { rng } from '../render/TextureFactory.js';
import { COLORS, PAINT, PLAYER } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  MapBuilder · "PUERTO CROMA"
//  Arena portuaria de ~80×120 m, simétrica en espejo (z → -z):
//   · bases elevadas (2,4 m) con rampa frontal y rampas laterales
//   · carril central abierto con coberturas cada 6-10 m
//   · carril oeste: patio de contenedores (combate cercano, alturas)
//   · carril este: calle comercial con mercado cubierto y terraza
//   · plaza central elevada con el monumento "La Gota"
//   · agua alrededor del muelle (caer = eliminación)
// ─────────────────────────────────────────────────────────────

const PI = Math.PI;

export class MapBuilder {
  constructor({ materials, textures }) {
    this.materials = materials;
    this.textures = textures;
    this.signs = textures.signs;
    this.collision = new CollisionWorld(4);
    this.atlas = new PaintAtlas();
    this.batcher = new StaticBatcher(48);
    this.instanced = new InstancedProps();
    this.extraMaterials = [];
    this.pending = [];
    this.rand = rng(1337);
    this.decor = new GroundDecor(PAINT.bounds, 12, 91);
    this.spawns = [[], []];
    this.dynamic = [];
    this.meta = { lamps: [], dockEdges: [], baseCenters: [], plaza: { x: 0, z: 0 } };
    this._uv = { x: 0, y: 0 };
    this._fc = { u: 0, v: 0 };
    registerStreetProps(this);
  }

  // ── API de construcción ────────────────────────────────────

  solid(o) {
    const s = this.collision.add(new Solid(o));
    if (s.paintable && o.paintMask !== null) this.atlas.registerSolid(s, o.paintMask);
    return s;
  }

  later(fn) {
    this.pending.push(fn);
  }

  /** Función de UV de pintura para piezas en el espacio local del sólido. */
  pm(s) {
    if (!s || !s.faces) return null;
    const uv = this._uv;
    const fc = this._fc;
    return (face, lx, ly, lz) => {
      const f = s.faces[face];
      if (!f) return null;
      PaintAtlas.faceCoords(s, face, lx, ly, lz, fc);
      return PaintAtlas.toUV(f, fc.u, fc.v, uv);
    };
  }

  solidMatrix(s) {
    return trs(s.cx, s.cy, s.cz, 0, s.rot, 0);
  }

  add(matKey, geo, matrix, color) {
    this.batcher.add(matKey, geo, matrix, color);
  }

  inst(key, matrix, color) {
    this.instanced.place(key, matrix, color);
  }

  footprint(x, z, w, d, rot, strength) {
    this.decor.contactShadow(x, z, w, d, rot, strength);
  }

  markRamp(x, z, w, d, rot) {
    this.decor.rampStripes(x, z, w, d, rot);
  }

  // ── construcción completa ─────────────────────────────────

  build() {
    this.layoutGround();
    this.layoutHalf(1);
    this.layoutHalf(-1);
    this.layoutCenter();
    this.layoutBoundary();
    this.layoutBackground();
    this.decorateGround();

    this.atlas.finalize();
    for (const fn of this.pending) fn();
    this.pending.length = 0;

    const group = new THREE.Group();
    group.name = 'puerto-croma';
    const shadowPolicy = (key) => !['glow', 'neon'].includes(key);
    group.add(this.batcher.build(this.materials, shadowPolicy));
    group.add(this.instanced.build());
    const decorTex = this.decor.build();
    return {
      group,
      collision: this.collision,
      atlas: this.atlas,
      overlay: decorTex.overlay,
      wet: decorTex.wet,
      spawns: this.spawns,
      meta: this.meta,
      dynamic: this.dynamic,
      shore: [
        { x: 2.5, z: 0, hx: 43.5, hz: 76 },
        { x: 130, z: 0, hx: 83.5, hz: 220 },
        { x: -180, z: 0, hx: 56, hz: 170 },
        { x: -90, z: -150, hx: 5, hz: 5 }
      ]
    };
  }

  // ── suelo del muelle y de la ciudad ────────────────────────

  layoutGround() {
    // losa principal (y superior = 0), 1,6 m sobre el agua
    const deck = this.solid({
      x: 2.5,
      y: -0.8,
      z: 0,
      w: 87,
      h: 1.6,
      d: 152,
      floor: true,
      paintable: false,
      tag: 'deck'
    });
    this.later(() => {
      const g = bevelBox(87, 1.6, 152, { bevel: 0.25, uvScale: 4 });
      this.add('ground', g, this.solidMatrix(deck), 0xffffff);
      // borde del muelle: viga de coronación y defensas
      for (const [x0, z0, x1, z1] of [
        [-41, -76, -41, 76],
        [-41, -76, 46, -76],
        [-41, 76, 46, 76]
      ]) {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const rot = Math.atan2(x1 - x0, z1 - z0);
        const cap = bevelBox(0.5, 0.22, len, { bevel: 0.06, uvScale: 4 });
        this.add('concrete', cap, trs((x0 + x1) / 2, 0.05, (z0 + z1) / 2, 0, rot, 0), COLORS.creamDark);
      }
    });
    // ciudad (este) — plataforma no jugable
    this.later(() => {
      const g = bevelBox(168, 1.6, 440, { bevel: 0.3, uvScale: 4 });
      this.add('concrete', g, trs(130, -0.8, 0), 0xd9d0c4);
    });
    // defensas de neumático y bolardos en el borde oeste
    for (let z = -72; z <= 72; z += 4.5) {
      this.inst('fender', trs(-41.45, -0.75, z, 0, 0, 0));
      if (Math.abs(Math.abs(z) - 27) < 5.5) this.inst('bollard', trs(-40.4, 0, z));
    }
    for (let x = -36; x <= 42; x += 6) {
      this.inst('fender', trs(x, -0.75, -76.45, 0, PI / 2, 0));
      this.inst('fender', trs(x, -0.75, 76.45, 0, PI / 2, 0));
    }
  }

  // ── mitad de equipo (m = 1 sur/naranja, m = -1 norte/azul) ─

  layoutHalf(m) {
    const Z = (z) => z * m;
    const R = (r) => (m === 1 ? r : PI - r);
    const team = m === 1 ? 0 : 1;
    const tc = COLORS.team[team];
    const b = this;

    // BASE elevada
    concreteBlock(b, { x: 0, y0: 0, z: Z(-54.5), w: 34, h: 2.4, d: 15, color: COLORS.cream, trim: COLORS.lilac, plinth: COLORS.concreteDark, floor: true, tag: 'base' });
    ramp(b, { x: 0, z: Z(-43.5), w: 8, d: 7, yLow: 0, yHigh: 2.4, rot: R(PI) });
    ramp(b, { x: -20.5, z: Z(-55.5), w: 5, d: 7, yLow: 0, yHigh: 2.4, rot: R(PI / 2) });
    ramp(b, { x: 20.5, z: Z(-55.5), w: 5, d: 7, yLow: 0, yHigh: 2.4, rot: R(-PI / 2) });
    railing(b, -17, Z(-47), -4.2, Z(-47), 2.4);
    railing(b, 4.2, Z(-47), 17, Z(-47), 2.4);
    railing(b, -17, Z(-62), -17, Z(-58.1), 2.4);
    railing(b, -17, Z(-52.9), -17, Z(-47), 2.4);
    railing(b, 17, Z(-62), 17, Z(-58.1), 2.4);
    railing(b, 17, Z(-52.9), 17, Z(-47), 2.4);
    // coberturas en la base
    concreteBlock(b, { x: -9, y0: 2.4, z: Z(-50.5), w: 3.2, h: 1.05, d: 0.7, color: COLORS.creamDark, floor: false, tag: 'cover' });
    concreteBlock(b, { x: 9, y0: 2.4, z: Z(-50.5), w: 3.2, h: 1.05, d: 0.7, color: COLORS.creamDark, floor: false, tag: 'cover' });
    // plataforma de reaparición
    this.spawnPad(0, 2.4, Z(-56), team);
    for (const dx of [-2.2, 0, 2.2]) this.spawns[team].push({ x: dx, y: 2.4, z: Z(-56), yaw: m === 1 ? 0 : PI });
    this.meta.baseCenters[team] = { x: 0, y: 2.4, z: Z(-54.5) };
    teamHQ(b, { team, x: 0, z: Z(-66), w: 48, d: 8, h: 11, front: m === 1 ? '+z' : '-z' });
    // mástil del dron de reaparición
    this.later(() => {
      const M = trs(0, 2.4, Z(-60.6));
      this.add('metal', bevelBox(1.4, 0.4, 1.4, { bevel: 0.08 }), M.clone().multiply(trs(0, 0.2, 0)), COLORS.lilacDark);
      this.add('darkMetal', cylinder(0.22, 0.3, 6.2, 10), M.clone().multiply(trs(0, 3.5, 0)), COLORS.charcoal);
      this.add('metal', cylinder(1.5, 1.4, 0.25, 20), M.clone().multiply(trs(0, 6.7, 0)), COLORS.cream);
      this.add('glow', torus(1.45, 0.05, 6, 32), M.clone().multiply(trs(0, 6.84, 0, PI / 2, 0, 0)), tc.accent);
      this.add('glow', sphere(0.14, 8, 6), M.clone().multiply(trs(0, 6.9, 1.3)), tc.main);
    });
    this.solid({ x: 0, y: 2.4 + 3.1, z: Z(-60.6), w: 0.8, h: 6.2, d: 0.8, floor: false, walkable: false, paintable: false, tag: 'mast' });
    // banderolas de equipo en la barandilla
    this.later(() => {
      for (const x of [-12, -7, 7, 12]) {
        const F = trs(x, 2.4, Z(-47.08), 0, m === 1 ? 0 : PI, 0);
        this.add('plastic', bevelBox(2.4, 0.7, 0.04, { bevel: 0.015 }), F.clone().multiply(trs(0, 0.62, 0.02)), tc.main);
        this.add('plastic', bevelBox(2.4, 0.12, 0.05, { bevel: 0.015 }), F.clone().multiply(trs(0, 0.95, 0.02)), tc.accent);
      }
    });

    // zona de carga oeste junto a la base
    container(b, { x: -33, z: Z(-55), rot: R(PI / 2) });
    container(b, { x: -33, z: Z(-55), rot: R(PI / 2), y0: CONTAINER.H });
    container(b, { x: -34.5, z: Z(-48.5), rot: R(PI / 2) });
    crate(b, -27.5, Z(-50.5), 0.3);
    crate(b, -26.3, Z(-49.2), 0.9);
    crate(b, -27.2, Z(-50.1), 0.1, 1.0);
    pallet(b, -24, Z(-44.5), 0.2);
    barrel(b, -38, Z(-44));
    barrel(b, -37.2, Z(-45.1));
    // zona de carga este
    container(b, { x: 29.5, z: Z(-56), rot: R(PI / 2) });
    crate(b, 25.2, Z(-50), 0.4);
    pallet(b, 26.8, Z(-47.5), 1.2);
    cone(b, 22.5, Z(-46));
    cone(b, 23.4, Z(-45.2));

    // CARRIL CENTRAL
    jersey(b, -5.5, Z(-35), R(PI / 2), COLORS.cream);
    jersey(b, 5.5, Z(-35), R(PI / 2), COLORS.cream);
    this.cargoBox(0, Z(-29), 2.3, 1.3, 2.3, 0, COLORS.lilac);
    this.cargoBox(0.3, Z(-29.2), 1.25, 1.0, 1.25, 1.3, COLORS.mint, 0.3);
    container(b, { x: -9, z: Z(-23), rot: R(PI / 2), color: COLORS.mint });
    container(b, { x: 9, z: Z(-23), rot: R(-PI / 2), color: COLORS.lilac });
    planter(b, { x: -4.2, z: Z(-17), w: 3.2, d: 1.4, h: 0.9 });
    planter(b, { x: 4.2, z: Z(-17), w: 3.2, d: 1.4, h: 0.9 });
    for (const zz of [-40, -27, -15]) {
      lamp(b, -12.8, Z(zz), 0);
      lamp(b, 12.8, Z(zz), PI);
      this.meta.lamps.push([-12.8, Z(zz)], [12.8, Z(zz)]);
    }
    bin(b, -6.8, Z(-16.2));
    bench(b, 7.2, Z(-17.6), R(0));
    cone(b, -2.6, Z(-36.2));
    cone(b, 2.4, Z(-36.6));
    hydrant(b, -11.8, Z(-31));

    // CARRIL OESTE: patio de contenedores
    container(b, { x: -15.5, z: Z(-38), rot: R(0) });
    container(b, { x: -15.5, z: Z(-27), rot: R(0) });
    container(b, { x: -15.5, z: Z(-27), rot: R(0), y0: CONTAINER.H });
    container(b, { x: -15.5, z: Z(-18.5), rot: R(PI) });
    container(b, { x: -30, z: Z(-41), rot: R(PI / 2) });
    container(b, { x: -24, z: Z(-33), rot: R(0) });
    container(b, { x: -24, z: Z(-33), rot: R(0), y0: CONTAINER.H });
    container(b, { x: -34, z: Z(-27), rot: R(PI / 2), floor: true });
    container(b, { x: -27, z: Z(-20), rot: R(PI / 2), floor: true });
    container(b, { x: -35.5, z: Z(-12.5), rot: R(0), doorsOpen: true });
    this.cargoBox(-30.1, Z(-27.4), 1.6, 1.3, 1.6, 0, COLORS.sand, 0.1);
    this.cargoBox(-23.1, Z(-20), 1.6, 1.3, 1.6, 0, COLORS.sand, -0.15);
    walkway(b, -31.2, Z(-25.8), -28.6, Z(-21.2), CONTAINER.H);
    crate(b, -26.8, Z(-39.2), 0.2);
    crate(b, -27.9, Z(-38.3), 0.7);
    barrel(b, -38.2, Z(-36.5));
    barrel(b, -37.4, Z(-37.4));
    barrel(b, -38.4, Z(-38.3));
    barrel(b, -20.8, Z(-44.3));
    pallet(b, -36.8, Z(-19.8), 0.4);
    pallet(b, -36.8, Z(-19.8), 0.5, 0.28);
    pallet(b, -20.2, Z(-12.2), 1.4);
    cone(b, -21.2, Z(-27.8));
    cone(b, -21.6, Z(-26.2));
    crate(b, -31.2, Z(-9.8), 0.4);
    // muelle abierto (peligro: agua)
    this.meta.dockEdges.push({ x: -41, z0: Math.min(Z(-32), Z(-22)), z1: Math.max(Z(-32), Z(-22)) });

    // CARRIL ESTE: calle comercial
    concreteBlock(b, { x: 15.5, y0: 0, z: Z(-37.5), w: 0.7, h: 1.1, d: 7, color: COLORS.creamDark, trim: COLORS.mint, floor: false, tag: 'wall' });
    concreteBlock(b, { x: 15.5, y0: 0, z: Z(-27), w: 0.7, h: 1.1, d: 6, color: COLORS.creamDark, trim: COLORS.mint, floor: false, tag: 'wall' });
    kiosk(b, { x: 16, z: Z(-19.5), color: m === 1 ? COLORS.mint : COLORS.lilac, sign: m === 1 ? 'noodles' : 'fizz' });
    building(b, { x: 42, z: Z(-55), w: 8, d: 14, h: 9, mat: 'buildingB', color: 0xf4f0ea, front: '-x', shop: { sign: 'cromamart', awning: 'awningA', width: 9 } });
    building(b, { x: 42, z: Z(-40.5), w: 8, d: 15, h: 9, mat: 'buildingA', color: 0xffffff, front: '-x', shop: { sign: m === 1 ? 'sodavolt' : 'noodles', neon: false, awning: 'awningC', width: 10 } });
    building(b, { x: 42, z: Z(-26), w: 8, d: 14, h: 7.5, mat: 'buildingC', color: 0xffffff, front: '-x', shop: { sign: 'dripwave', awning: 'awningB', width: 8 } });
    building(b, { x: 42, z: Z(-12.5), w: 8, d: 13, h: 10.5, mat: 'buildingB', color: 0xf1eef6, front: '-x', shop: { sign: 'neokai', neon: true, awning: null, width: 8 } });
    canopy(b, { x: 28, z: Z(-29), w: 9, d: 9, pillar: m === 1 ? COLORS.lilac : COLORS.mint });
    foodTruck(b, { x: 23.5, z: Z(-40), rot: R(0), color: m === 1 ? COLORS.pink : COLORS.mint, sign: m === 1 ? 'noodles' : 'sodavolt' });
    concreteBlock(b, { x: 31, y0: 0, z: Z(-11.5), w: 10, h: 1.2, d: 7, color: COLORS.cream, trim: COLORS.lilac, floor: true, tag: 'terrace' });
    ramp(b, { x: 31, z: Z(-17), w: 4, d: 4, yLow: 0, yHigh: 1.2, rot: R(0) });
    railing(b, 26, Z(-15), 29, Z(-15), 1.2);
    railing(b, 33, Z(-15), 36, Z(-15), 1.2);
    bench(b, 29, Z(-10), R(PI / 2), 1.2);
    bench(b, 33.5, Z(-10), R(-PI / 2), 1.2);
    planter(b, { x: 20.5, z: Z(-33.5), w: 1.6, d: 3.2, h: 0.85 });
    vending(b, 37.3, Z(-35.5), -PI / 2, COLORS.mint);
    vending(b, 37.3, Z(-34.3), -PI / 2, COLORS.pink);
    vending(b, 37.3, Z(-21.5), -PI / 2, COLORS.lilac);
    for (const zz of [-44, -31, -18]) {
      lamp(b, 35.8, Z(zz), PI);
      this.meta.lamps.push([35.8, Z(zz)]);
    }
    bin(b, 36.8, Z(-29), COLORS.lilac);
    bin(b, 18.5, Z(-42), COLORS.mint);
    bench(b, 36.7, Z(-39.5), R(-PI / 2));
    hydrant(b, 20.2, Z(-24));
    crate(b, 24.8, Z(-35.5), 0.2);
    barrel(b, 22.2, Z(-36.4), COLORS.pink);
    cone(b, 19.2, Z(-47.5));
  }

  layoutCenter() {
    const b = this;
    // plaza elevada (punto de control)
    concreteBlock(b, { x: 0, y0: 0, z: 0, w: 20, h: 1.2, d: 20, color: COLORS.cream, trim: COLORS.mint, plinth: COLORS.concreteDark, floor: true, tag: 'plaza' });
    ramp(b, { x: 0, z: -12, w: 6, d: 4, yLow: 0, yHigh: 1.2, rot: 0 });
    ramp(b, { x: 0, z: 12, w: 6, d: 4, yLow: 0, yHigh: 1.2, rot: PI });
    ramp(b, { x: 12, z: 0, w: 6, d: 4, yLow: 0, yHigh: 1.2, rot: -PI / 2 });
    ramp(b, { x: -12, z: 0, w: 6, d: 4, yLow: 0, yHigh: 1.2, rot: PI / 2 });
    // monumento "La Gota"
    concreteBlock(b, { x: 0, y0: 1.2, z: 0, w: 3.4, h: 1.1, d: 3.4, color: COLORS.lilac, trim: COLORS.cream, floor: false, tag: 'pedestal' });
    this.solid({ x: 0, y: 2.3 + 1.7, z: 0, w: 1.9, h: 3.4, d: 1.9, floor: false, walkable: false, paintable: false, tag: 'monument' });
    this.later(() => {
      const prof = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const y = t * 3.9;
        // perfil de gota: bulbo abajo, punta arriba
        const r = Math.sin(Math.min(1, t * 1.15) * PI) * 1.25 * Math.pow(1 - t, 0.55) + 0.001;
        prof.push([r, y]);
      }
      const drop = lathe(prof, 32);
      this.add('glass', drop, trs(0, 2.32, 0), 0xe9e2f5);
      this.add('metal', cylinder(1.4, 1.5, 0.18, 32), trs(0, 2.35, 0), COLORS.cream);
      // placa
      this.add('metal', bevelBox(1.6, 0.5, 0.06, { bevel: 0.02 }), trs(0, 1.8, 1.73), 0xd8c9a0);
    });
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ]) {
      planter(b, { x: sx * 6.6, y0: 1.2, z: sz * 6.6, w: 2.2, d: 2.2, h: 0.7, tree: true, treeScale: 1.05, color: COLORS.creamDark });
      lamp(b, sx * 9.2, sz * 9.2, Math.atan2(sz, -sx), 1.2);
    }
    bench(b, 0, -4.4, 0, 1.2);
    bench(b, 0, 4.4, PI, 1.2);
    bench(b, -4.4, 0, PI / 2, 1.2);
    bench(b, 4.4, 0, -PI / 2, 1.2);
    // edificio central del lateral este + cartel de la plaza
    building(b, { x: 42, z: 0, w: 8, d: 12, h: 8, mat: 'buildingA', color: 0xf7efe6, front: '-x', shop: { sign: 'muelle', awning: 'awningA', width: 7, signWidth: 2 } });
    this.later(() => {
      const r = this.signs.rects.puerto;
      const g = prep(new THREE.PlaneGeometry(9, 9 / r.aspect));
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
      this.add('neon', g, trs(37.6, 11.2, 0, 0, -PI / 2, 0), 0xffffff);
      this.add('darkMetal', bevelBox(0.3, 0.3, 9.4, { bevel: 0.05 }), trs(37.9, 8.9, 0), COLORS.charcoal);
      for (const zz of [-3.8, 3.8]) this.add('darkMetal', cylinder(0.06, 0.06, 2.2, 6), trs(38, 9.9, zz), COLORS.charcoal);
    });
    // carril oeste: hueco central entre contenedores
    container(b, { x: -24, z: 0, rot: 0, color: COLORS.pink });
    this.cargoBox(-31.5, -3.2, 1.6, 1.3, 1.6, 0, COLORS.sand, 0.2);
    this.cargoBox(-32, 3.4, 1.6, 1.3, 1.6, 0, COLORS.sand, -0.3);
    barrel(b, -37.5, 0.6);
    barrel(b, -38.2, -0.4);
    // carril este: parterre central
    planter(b, { x: 26, z: 0, w: 2.2, d: 5.5, h: 0.8, tree: true, treeScale: 1.1 });
    bench(b, 23.8, 0, PI / 2);
    bench(b, 28.2, 0, -PI / 2);
    lamp(b, 35.8, 0, PI);
  }

  // ── perímetro: vallas + muros invisibles ───────────────────

  layoutBoundary() {
    const b = this;
    // oeste con dos huecos de muelle abierto
    fenceLine(b, -40.6, -62, -40.6, -32);
    fenceLine(b, -40.6, -22, -40.6, 22);
    fenceLine(b, -40.6, 32, -40.6, 62);
    // sur / norte a ambos lados de las sedes
    fenceLine(b, -40.6, -62, -24.2, -62);
    fenceLine(b, 24.2, -62, 38, -62);
    fenceLine(b, -40.6, 62, -24.2, 62);
    fenceLine(b, 24.2, 62, 38, 62);
    // seguridad absoluta (fuera del muelle abierto sólo hay agua)
    const wall = (x, z, w, d) =>
      this.solid({ x, y: 5, z, w, h: 10, d, floor: false, walkable: false, paintable: false, blocksCamera: false, tag: 'boundary' });
    wall(0, -63.8, 100, 1.5);
    wall(0, 63.8, 100, 1.5);
    wall(38.8, 0, 1.5, 140);
    wall(-44.5, 0, 1.5, 160);
  }

  // ── decorado lejano ────────────────────────────────────────

  layoutBackground() {
    const b = this;
    // terminal de contenedores al oeste
    this.later(() => {
      const g = bevelBox(112, 3, 340, { bevel: 0.4, uvScale: 4 });
      this.add('concrete', g, trs(-180, -1.5, 0), 0xcfc6ba);
    });
    for (const z of [-70, -20, 32, 84]) gantryCrane(b, -133, z, PI, 1, z % 2 ? COLORS.cream : COLORS.lilac);
    containerStack(b, -170, -120, 5, 4, 3, 0);
    containerStack(b, -175, -20, 6, 3, 4, 0);
    containerStack(b, -168, 60, 5, 4, 3, 0);
    containerStack(b, -190, 120, 4, 3, 2, 0);
    cargoShip(b, -112, 6, 0);
    lighthouse(b, -90, -150);
    this.later(() => {
      this.add('concrete', bevelBox(10, 2, 70, { bevel: 0.3, uvScale: 4 }), trs(-90, -0.8, -112), COLORS.concreteDark);
    });
    // ciudad al este
    const mats = ['buildingA', 'buildingB', 'buildingC'];
    const cols = [0xffffff, 0xf2eee8, 0xeee8f6, 0xe9f2ee];
    for (let i = 0; i < 26; i++) {
      const x = 58 + (i % 4) * 22 + this.rand() * 6;
      const z = -120 + Math.floor(i / 4) * 40 + this.rand() * 10;
      const h = 12 + this.rand() * 18 + (i % 4) * 7;
      cityBlock(b, x, z, 14 + this.rand() * 6, 16 + this.rand() * 8, h, mats[i % 3], cols[i % 4]);
    }
    // detrás de las fachadas, bloques bajos que cierran la vista
    for (const z of [-50, -20, 10, 40]) cityBlock(b, 52, z, 6, 24, 14 + this.rand() * 6, 'buildingC', 0xf4f0f8);
    // boyas
    for (const [x, z] of [
      [-60, -40],
      [-62, 20],
      [-75, 70],
      [-70, -95],
      [20, -95],
      [10, 95]
    ]) {
      this.inst('buoy', trs(x, PLAYER.waterLevel, z));
    }
  }

  // ── marcas viales, manchas y charcos ───────────────────────

  decorateGround() {
    const d = this.decor;
    const cream = 'rgba(248,240,222,0.88)';
    const yellow = 'rgba(238,214,150,0.62)';
    for (const m of [1, -1]) {
      const Z = (z) => z * m;
      const rot = m === 1 ? 0 : PI;
      // líneas del carril central
      d.line(-13.5, Z(-44), -13.5, Z(-14), 0.16, cream, [2, 1.4]);
      d.line(13.5, Z(-44), 13.5, Z(-14), 0.16, cream, [2, 1.4]);
      // zona sombreada al pie de la rampa de base
      d.hatch(0, Z(-38.9), 8, 1.6, 0, yellow, 0.7, 0.18);
      d.hatch(-26, Z(-55.5), 3, 5, 0, yellow, 0.7, 0.18);
      d.hatch(26, Z(-55.5), 3, 5, 0, yellow, 0.7, 0.18);
      // flechas hacia el centro
      d.arrow(0, Z(-33), rot, 4.2, cream);
      d.arrow(-24, Z(-47.5), rot, 3.2, cream);
      d.arrow(27, Z(-47.5), rot, 3.2, cream);
      // texto en el suelo
      d.text(m === 1 ? 'ZONA NARANJA' : 'ZONA AZUL', 0, Z(-51.6), rot, 1.05, cream);
      // bahías de carga en el carril oeste
      for (let i = 0; i < 4; i++) {
        const z0 = Z(-46 + i * 9);
        d.line(-39, z0, -31, z0, 0.14, cream);
      }
      // paso de cebra en el carril este
      for (let i = 0; i < 7; i++) d.line(18 + i * 1.2, Z(-24.5), 18 + i * 1.2, Z(-21), 0.6, cream);
      // alcantarillas y registros
      d.manhole(-8, Z(-30));
      d.manhole(24, Z(-22));
      d.manhole(-30, Z(-16));
      d.drain(-13.2, Z(-20), PI / 2);
      d.drain(13.2, Z(-34), PI / 2);
      d.drain(19, Z(-44), 0);
      // charcos y manchas
      d.puddle(-6.5, Z(-26), 1.6);
      d.puddle(22, Z(-30), 1.2);
      d.puddle(-29, Z(-31), 1.8);
      d.puddle(30.5, Z(-46), 1.3);
      for (let i = 0; i < 16; i++) {
        d.stain(-38 + this.rand() * 74, Z(-60 + this.rand() * 55), 0.6 + this.rand() * 1.4);
      }
      for (let i = 0; i < 18; i++) d.crack(-38 + this.rand() * 74, Z(-60 + this.rand() * 55), 1.5 + this.rand() * 3);
      d.tireMarks(-27, Z(-36), 0.4, 9);
      d.tireMarks(24, Z(-44), -0.3, 7);
    }
    // plaza: rosa de los vientos
    d.local(0, 0, 0, (g) => {
      g.strokeStyle = 'rgba(147,132,179,0.55)';
      g.lineWidth = 0.18;
      g.beginPath();
      g.arc(0, 0, 3.9, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 5.6, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(147,132,179,0.35)';
      for (let i = 0; i < 8; i++) {
        g.save();
        g.rotate((i / 8) * Math.PI * 2);
        g.beginPath();
        g.moveTo(0, -6.8);
        g.lineTo(0.5, -4.1);
        g.lineTo(-0.5, -4.1);
        g.closePath();
        g.fill();
        g.restore();
      }
    });
    d.text('PUERTO CROMA', 0, -21.6, 0, 1.25, 'rgba(248,240,222,0.8)');
    d.text('PUERTO CROMA', 0, 21.6, PI, 1.25, 'rgba(248,240,222,0.8)');
    d.puddle(-3.5, 0.8, 0.8);
    // carril este central
    d.line(20, -6, 20, 6, 0.16, cream, [2, 1.4]);
    // borde del muelle abierto: franja de peligro
    for (const zc of [-27, 27]) d.hatch(-39.6, zc, 1.6, 10, 0, 'rgba(240,206,120,0.8)', 0.6, 0.22);
  }

  // ── piezas compuestas propias del mapa ─────────────────────

  /** Caja de carga grande (cobertura con techo transitable). */
  cargoBox(x, z, w, h, d, y0, color, rot = 0) {
    const s = this.solid({ x, y: y0 + h / 2, z, w, h, d, rot, floor: true, paintable: true, tag: 'cargo' });
    this.later(() => {
      const pm = this.pm(s);
      const M = this.solidMatrix(s);
      this.add('plastic', bevelBox(w, h, d, { bevel: 0.08, uvScale: 1.5, paintMap: pm }), M, color);
      // marco de refuerzo
      for (const sy of [-1, 1]) {
        const fr = bevelBox(w + 0.06, 0.1, d + 0.06, { bevel: 0.03, paintMap: (f, lx, ly, lz) => pm && pm(f, lx, ly + sy * (h / 2 - 0.08), lz) });
        this.add('metal', fr, M.clone().multiply(trs(0, sy * (h / 2 - 0.08), 0)), COLORS.charcoal);
      }
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const post = bevelBox(0.1, h, 0.1, { bevel: 0.03 });
          this.add('metal', post, M.clone().multiply(trs(sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02))), COLORS.charcoal);
        }
      }
    });
    if (y0 < 0.1) this.footprint(x, z, w + 0.5, d + 0.5, rot, 0.5);
    return s;
  }

  /** Plataforma de reaparición con anillo luminoso del equipo. */
  spawnPad(x, y, z, team) {
    const tc = COLORS.team[team];
    this.later(() => {
      this.add('metal', cylinder(2.9, 3.1, 0.14, 40), trs(x, y + 0.07, z), COLORS.cream);
      this.add('glow', torus(2.75, 0.07, 8, 48), trs(x, y + 0.15, z, PI / 2, 0, 0), tc.main);
      this.add('glow', torus(1.6, 0.04, 6, 40), trs(x, y + 0.15, z, PI / 2, 0, 0), tc.accent);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        this.add('glow', bevelBox(0.5, 0.05, 0.12, { bevel: 0.01 }), trs(x + Math.cos(a) * 2.2, y + 0.16, z + Math.sin(a) * 2.2, 0, -a, 0), tc.accent);
      }
    });
    this.dynamic.push({ type: 'spawnPad', team, x, y, z });
  }
}
