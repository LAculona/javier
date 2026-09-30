// Procedural character: "Rusher" — a gel-headed courier with a visor, an ink
// tank backpack and chunky sneakers. All animation is procedural.
import * as THREE from 'three';
import { TEAM_INFO } from '../core/config.js';

const lerp = THREE.MathUtils.lerp;
const _hand = new THREE.Vector3();
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...opts });
}

// Shared geometries (built once)
const G = {};
function geos() {
  if (G.ready) return G;
  G.torso = new THREE.CapsuleGeometry(0.27, 0.32, 6, 14);
  G.head = new THREE.SphereGeometry(0.31, 24, 18);
  G.visor = new THREE.CapsuleGeometry(0.1, 0.34, 4, 12);
  G.visor.rotateZ(Math.PI / 2);
  G.eye = new THREE.CapsuleGeometry(0.028, 0.07, 3, 6);
  G.fin = new THREE.ConeGeometry(0.09, 0.32, 10);
  G.limb = new THREE.CapsuleGeometry(0.085, 0.26, 4, 8);
  G.hand = new THREE.SphereGeometry(0.09, 10, 8);
  G.shoe = new THREE.BoxGeometry(0.2, 0.13, 0.34);
  G.sole = new THREE.BoxGeometry(0.21, 0.05, 0.36);
  G.tankGlass = new THREE.CylinderGeometry(0.15, 0.15, 0.46, 16, 1, true);
  G.tankInk = new THREE.CylinderGeometry(0.13, 0.13, 1, 14);
  G.tankInk.translate(0, 0.5, 0);
  G.tankCap = new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16);
  G.collar = new THREE.TorusGeometry(0.2, 0.05, 8, 18);
  G.belt = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16);
  G.shadow = new THREE.CircleGeometry(0.5, 20);
  G.shadow.rotateX(-Math.PI / 2);
  G.ready = true;
  return G;
}

function buildWeapons(mats) {
  const w = {};
  // BLASTER: chunky pistol with a canister on top
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.42), mats.gunBody);
    body.position.set(0, 0.02, 0.12);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.3, 10), mats.gunDark);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.04, 0.44);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.26, 10), mats.ink);
    can.rotation.x = Math.PI / 2; can.position.set(0, 0.14, 0.1);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.1), mats.gunDark);
    grip.position.set(0, -0.1, 0); grip.rotation.x = -0.25;
    g.add(body, barrel, can, grip);
    g.userData.muzzle = new THREE.Vector3(0, 0.04, 0.62);
    w.blaster = g;
  }
  // ROLLER: long handle with a wide paint drum
  {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), mats.gunDark);
    handle.rotation.x = Math.PI / 2; handle.position.set(0, 0, 0.5);
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), mats.gunBody);
    yoke.position.set(0, 0, 1.05);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.95, 16), mats.ink);
    drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.05, 1.18);
    const capL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16), mats.gunBody);
    capL.rotation.z = Math.PI / 2; capL.position.set(-0.49, -0.05, 1.18);
    const capR = capL.clone(); capR.position.x = 0.49;
    g.add(handle, yoke, drum, capL, capR);
    g.userData.muzzle = new THREE.Vector3(0, 0.1, 1.2);
    g.userData.drum = drum;
    w.roller = g;
  }
  // SPLASHER: compact SMG with a side drum
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.5), mats.gunBody);
    body.position.set(0, 0.02, 0.16);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), mats.gunDark);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, 0.52);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 14), mats.ink);
    drum.rotation.z = Math.PI / 2; drum.position.set(0.09, -0.04, 0.16);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.09), mats.gunDark);
    grip.position.set(0, -0.1, 0.0); grip.rotation.x = -0.2;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.18), mats.gunDark);
    stock.position.set(0, 0.0, -0.14);
    g.add(body, barrel, drum, grip, stock);
    g.userData.muzzle = new THREE.Vector3(0, 0.03, 0.7);
    w.splasher = g;
  }
  return w;
}

export class CharacterModel {
  constructor(team, variant = 0) {
    const g = geos();
    this.team = team;
    const teamColor = new THREE.Color(TEAM_INFO[team].color);
    const jackets = [0x2b2f4a, 0xf1eee6, 0x3a3150, 0x23384a];
    const pants = [0x1b1d2e, 0x3b4058, 0x2c2440, 0x444a60];
    this.mats = {
      gel: std(teamColor, { roughness: 0.18, metalness: 0.0, emissive: teamColor.clone().multiplyScalar(0.12) }),
      jacket: std(jackets[variant % jackets.length], { roughness: 0.7 }),
      pants: std(pants[variant % pants.length], { roughness: 0.8 }),
      accent: std(teamColor, { roughness: 0.45 }),
      visor: std(0x10121c, { roughness: 0.08, metalness: 0.6 }),
      eye: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      shoe: std(0xf4f4f4, { roughness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false }),
      ink: std(teamColor, { roughness: 0.2, emissive: teamColor.clone().multiplyScalar(0.25) }),
      gunBody: std(0xe9e6f2, { roughness: 0.35, metalness: 0.2 }),
      gunDark: std(0x2a2d40, { roughness: 0.5, metalness: 0.4 }),
    };
    this.flashables = [this.mats.gel, this.mats.jacket, this.mats.pants, this.mats.accent];
    for (const m of this.flashables) m.userData.baseEmissive = m.emissive.clone();

    const root = new THREE.Group();
    this.root = root;
    this.body = new THREE.Group(); // yaw + squash container
    root.add(this.body);

    // Blob shadow (cheap, always visible)
    this.blobShadow = new THREE.Mesh(g.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    this.blobShadow.position.y = 0.02;
    this.blobShadow.renderOrder = 1;
    root.add(this.blobShadow);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.82;
    this.body.add(this.hips);

    const torso = new THREE.Mesh(g.torso, this.mats.jacket);
    torso.position.y = 0.3;
    this.torso = torso;
    this.hips.add(torso);
    const belt = new THREE.Mesh(g.belt, this.mats.accent);
    belt.position.y = 0.08;
    this.hips.add(belt);
    const collar = new THREE.Mesh(g.collar, this.mats.accent);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.62;
    this.hips.add(collar);

    // Head
    this.head = new THREE.Group();
    this.head.position.y = 0.92;
    this.hips.add(this.head);
    const skull = new THREE.Mesh(g.head, this.mats.gel);
    skull.scale.set(1, 1.05, 0.98);
    this.head.add(skull);
    const visor = new THREE.Mesh(g.visor, this.mats.visor);
    visor.position.set(0, 0.03, 0.22);
    visor.scale.set(1, 1, 0.9);
    this.head.add(visor);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(g.eye, this.mats.eye);
      eye.position.set(0.11 * s, 0.04, 0.315);
      eye.rotation.z = s * 0.35;
      this.head.add(eye);
      const fin = new THREE.Mesh(g.fin, this.mats.gel);
      fin.position.set(0.2 * s, 0.26, -0.06);
      fin.rotation.set(-0.5, 0, -s * 0.6);
      this.head.add(fin);
    }
    this.eyes = this.head.children.filter((c) => c.material === this.mats.eye);
    // Hairstyle variant: gel crest
    const crest = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), this.mats.gel);
    crest.scale.set(0.8, 1.3, 2.2);
    crest.position.set(0, 0.3, -0.05 - 0.04 * variant);
    this.head.add(crest);

    // Backpack ink tank (shows current ink level)
    this.tank = new THREE.Group();
    this.tank.position.set(0, 0.36, -0.27);
    this.hips.add(this.tank);
    const glass = new THREE.Mesh(g.tankGlass, this.mats.glass);
    const capT = new THREE.Mesh(g.tankCap, this.mats.gunDark);
    capT.position.y = 0.25;
    const capB = capT.clone(); capB.position.y = -0.25;
    this.tankInk = new THREE.Mesh(g.tankInk, this.mats.ink);
    this.tankInk.position.y = -0.23;
    this.tank.add(this.tankInk, glass, capT, capB);

    // Arms
    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.34 * side, 0.52, 0);
      this.hips.add(shoulder);
      const upper = new THREE.Mesh(g.limb, this.mats.jacket);
      upper.position.y = -0.17;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.34;
      shoulder.add(elbow);
      const fore = new THREE.Mesh(g.limb, this.mats.gel);
      fore.position.y = -0.14;
      fore.scale.set(0.9, 0.85, 0.9);
      elbow.add(fore);
      const hand = new THREE.Group();
      hand.position.y = -0.3;
      elbow.add(hand);
      hand.add(new THREE.Mesh(g.hand, this.mats.gunDark));
      return { shoulder, elbow, hand };
    };
    this.armR = makeArm(-1);
    this.armL = makeArm(1);

    // Legs
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0.14 * side, 0.02, 0);
      this.hips.add(hip);
      const thigh = new THREE.Mesh(g.limb, this.mats.pants);
      thigh.position.y = -0.18;
      thigh.scale.set(1.15, 1, 1.15);
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.38;
      hip.add(knee);
      const shin = new THREE.Mesh(g.limb, this.mats.pants);
      shin.position.y = -0.14;
      knee.add(shin);
      const shoe = new THREE.Mesh(g.shoe, this.mats.shoe);
      shoe.position.set(0, -0.36, 0.05);
      const sole = new THREE.Mesh(g.sole, this.mats.accent);
      sole.position.y = -0.07;
      shoe.add(sole);
      knee.add(shoe);
      return { hip, knee };
    };
    this.legR = makeLeg(-1);
    this.legL = makeLeg(1);

    // Weapons held in the right hand
    this.weaponMount = new THREE.Group();
    this.armR.hand.add(this.weaponMount);
    this.weapons = buildWeapons(this.mats);
    for (const k in this.weapons) {
      this.weapons[k].visible = false;
      this.weaponMount.add(this.weapons[k]);
    }
    this.currentWeapon = null;

    // Muzzle flash
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: TEAM_INFO[team].glow, transparent: true, opacity: 0.9, toneMapped: false }));
    this.flash.visible = false;
    this.weaponMount.add(this.flash);

    root.traverse((o) => { if (o.isMesh && o !== this.blobShadow && o.material !== this.mats.glass) o.castShadow = true; });

    // Animation state
    this.phase = 0;
    this.recoil = 0;
    this.hitFlash = 0;
    this.switchT = 0;
    this.flashT = 0;
    this.squash = 0;
    this.spawnT = 1;
    this.yaw = 0;
    this.pitch = 0;
    this.lean = 0;
    this.airBlend = 0;
    this.aimBlend = 0;
    this.rollBlend = 0;
    this.meleeT = 0;
    this.time = Math.random() * 10;
  }

  setWeapon(id) {
    if (this.currentWeapon) this.weapons[this.currentWeapon].visible = false;
    this.currentWeapon = id;
    const w = this.weapons[id];
    w.visible = true;
    this.flash.position.copy(w.userData.muzzle);
    this.switchT = 1;
  }

  muzzleWorld(out) {
    const w = this.weapons[this.currentWeapon];
    return w.localToWorld(out.copy(w.userData.muzzle));
  }

  onFire(strength) {
    this.recoil = Math.min(1.2, this.recoil + strength);
    this.flashT = 0.05;
  }

  onHit() { this.hitFlash = 1; }
  onMelee() { this.meleeT = 1; }

  onSpawn() {
    this.spawnT = 0;
    this.root.visible = true;
  }

  // state: {speed, runFactor, grounded, vy, aiming, firing, rolling, climbing, inkFrac, aimPitch}
  update(dt, s) {
    this.time += dt;
    const t = this.time;
    // Facing
    let dy = s.yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-14 * dt));
    this.body.rotation.y = this.yaw + Math.PI; // model faces +Z, game yaw 0 faces -Z

    const speedN = Math.min(1.4, s.speed / 6.2);
    this.airBlend = damp(this.airBlend, s.grounded ? 0 : 1, 12, dt);
    this.aimBlend = damp(this.aimBlend, s.aiming || s.firing ? 1 : 0, 14, dt);
    this.rollBlend = damp(this.rollBlend, s.rolling ? 1 : 0, 10, dt);
    this.recoil = damp(this.recoil, 0, 12, dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.switchT = Math.max(0, this.switchT - dt * 3.5);
    this.meleeT = Math.max(0, this.meleeT - dt * 3.2);
    this.spawnT = Math.min(1, this.spawnT + dt * 1.8);

    // Walk / run cycle
    this.phase += dt * (4 + speedN * 7.5) * (s.grounded ? 1 : 0.2);
    const stride = Math.min(1, speedN) * (1 - this.airBlend) * (s.climbing ? 0.3 : 1);
    const sw = Math.sin(this.phase);
    const bob = Math.abs(Math.cos(this.phase)) * 0.07 * stride;
    const breath = Math.sin(t * 2.2) * 0.012 * (1 - stride);

    this.lean = damp(this.lean, speedN * 0.18 * (1 - this.aimBlend * 0.6) + (s.climbing ? -0.3 : 0), 8, dt);
    this.hips.position.y = 0.82 + bob + breath - this.rollBlend * 0.08;
    this.hips.rotation.x = this.lean + this.rollBlend * 0.25 - this.recoil * 0.08;
    this.hips.rotation.z = sw * 0.04 * stride;

    // Legs: stride vs tucked (jump) vs spread (fall)
    const rising = s.vy > 0 ? 1 : 0;
    const legSwing = sw * 0.75 * stride;
    const tuck = this.airBlend * (rising ? 0.9 : 0.35);
    this.legR.hip.rotation.x = legSwing - tuck;
    this.legL.hip.rotation.x = -legSwing - tuck * (rising ? 0.4 : 1.4);
    this.legR.knee.rotation.x = Math.max(0, -Math.cos(this.phase)) * 0.9 * stride + tuck * 1.3;
    this.legL.knee.rotation.x = Math.max(0, Math.cos(this.phase)) * 0.9 * stride + tuck * 0.9;
    this.legR.hip.rotation.z = -this.airBlend * (1 - rising) * 0.25;
    this.legL.hip.rotation.z = this.airBlend * (1 - rising) * 0.25;

    // Arms
    const armSwing = -sw * 0.6 * stride;
    const aim = this.aimBlend;
    const pitch = s.aimPitch || 0;
    const switchDip = Math.sin(this.switchT * Math.PI) * 1.1;
    const melee = Math.sin(this.meleeT * Math.PI);
    let rX = lerp(armSwing * 0.8 + 0.1, -Math.PI / 2 - pitch + this.recoil * 0.5, aim);
    rX += switchDip - this.airBlend * 0.4 * (1 - aim);
    if (this.currentWeapon === 'roller') rX = lerp(-0.45 + armSwing * 0.2, -0.95, Math.max(this.rollBlend, aim * 0.5)) + switchDip;
    rX -= melee * 1.8;
    this.armR.shoulder.rotation.set(rX, 0, lerp(-0.12, 0.05, aim) - melee * 0.6);
    this.armR.elbow.rotation.x = lerp(-0.35, -0.1, aim) - this.recoil * 0.4;
    this.armL.shoulder.rotation.set(
      lerp(-armSwing + 0.1, -Math.PI / 2.2 - pitch * 0.8, aim * 0.8) - this.airBlend * 0.9 * (1 - aim),
      0, lerp(0.12, -0.45, aim * 0.8) + this.airBlend * 0.5 * (1 - aim));
    this.armL.elbow.rotation.x = lerp(-0.4, -0.6, aim);
    // Keep the weapon pointing forward regardless of arm pose
    let wA = lerp(0.55, -pitch, aim);
    if (this.currentWeapon === 'roller') {
      // Keep the drum resting on the ground in front of the character
      this.root.updateMatrixWorld(true);
      this.armR.hand.getWorldPosition(_hand);
      const handY = _hand.y - this.root.position.y;
      const rest = Math.asin(THREE.MathUtils.clamp((handY - 0.12) / (1.18 * 1.25), 0.05, 1));
      wA = rest - this.recoil * 1.2;
    }
    this.weaponMount.rotation.x = wA - this.armR.shoulder.rotation.x - this.armR.elbow.rotation.x;
    this.weaponMount.scale.setScalar(1.25 * (1 - Math.sin(this.switchT * Math.PI) * 0.5));
    this.weaponMount.rotation.y = this.switchT * Math.PI * 2;

    // Head looks where we aim and reacts to hits
    this.head.rotation.x = -pitch * 0.5 * aim + this.hitFlash * 0.3;
    this.head.rotation.z = Math.sin(t * 1.3) * 0.03 + this.hitFlash * 0.2 * Math.sin(t * 40);
    // Blink
    const blink = (t % 3.7) < 0.12 ? 0.1 : 1;
    for (const e of this.eyes) e.scale.y = blink;

    // Ink tank level
    this.tankInk.scale.y = Math.max(0.02, s.inkFrac * 0.46);

    // Roller drum spin
    if (this.currentWeapon === 'roller') this.weapons.roller.userData.drum.rotation.x += s.speed * dt * 3 * this.rollBlend;

    // Hit flash (emissive white)
    for (const m of this.flashables) {
      m.emissive.copy(m.userData.baseEmissive).lerp(new THREE.Color(0xffffff), this.hitFlash * 0.8);
    }

    // Muzzle flash
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    if (this.flash.visible) this.flash.scale.setScalar(0.8 + Math.random() * 0.8);

    // Spawn pop (elastic)
    const k = this.spawnT;
    const sc = k >= 1 ? 1 : 1 + Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.35 - (1 - k) * (1 - k) * 0.9;
    this.squash = damp(this.squash, s.landing ? 1 : 0, 20, dt);
    this.body.scale.set(sc * (1 + this.squash * 0.12), sc * (1 - this.squash * 0.15), sc * (1 + this.squash * 0.12));

    // Blob shadow stays on the ground
    this.blobShadow.position.y = (s.groundY ?? 0) - this.root.position.y + 0.03;
    const hAbove = Math.max(0, this.root.position.y - (s.groundY ?? 0));
    this.blobShadow.scale.setScalar(Math.max(0.3, 1 - hAbove * 0.15));
    this.blobShadow.material.opacity = 0.28 * Math.max(0.2, 1 - hAbove * 0.2);
  }
}
