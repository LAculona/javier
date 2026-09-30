import * as THREE from 'three';
import { createToonMaterial } from '../render/ToonMaterial.js';
import { cylinder, torus, bevelBox, lathe } from './GeometryKit.js';
import { COLORS, WEAPON_ORDER } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  MenuStage · escena viva del menú principal
//  El Dripper del jugador posa sobre una plataforma giratoria en su base,
//  llueve pintura de ambos equipos a su alrededor y la cámara se mece
//  despacio con el puerto y las grúas de fondo.
// ─────────────────────────────────────────────────────────────

const CENTER = new THREE.Vector3(0, 2.4, -51.2);
const TOP = 0.2; // altura de la plataforma

export class MenuStage {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.position.copy(CENTER);
    this.group.visible = false;
    this.t = 0;
    this.spin = Math.PI;
    this.poseT = 2;
    this.pose = 0;
    this.rainT = 0;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.build();
    game.scene.add(this.group);
  }

  build() {
    const base = createToonMaterial({ color: COLORS.lilacDark, roughness: 0.45, metalness: 0.25, rim: 0.35 });
    const top = createToonMaterial({ color: COLORS.cream, roughness: 0.5, rim: 0.2, variation: 0.08 });
    const orange = createToonMaterial({ color: COLORS.team[0].main, emissive: COLORS.team[0].main, emissiveIntensity: 1.3, roughness: 0.3 });
    const blue = createToonMaterial({ color: COLORS.team[1].main, emissive: COLORS.team[1].main, emissiveIntensity: 1.3, roughness: 0.3 });
    const dark = createToonMaterial({ color: COLORS.charcoal, roughness: 0.6, metalness: 0.2 });
    const add = (geo, mat, y = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    // pie escalonado con perfil redondeado
    add(
      lathe(
        [
          [0, 0],
          [1.72, 0],
          [1.76, 0.03],
          [1.76, 0.08],
          [1.66, 0.11],
          [1.58, 0.12],
          [1.56, 0.15],
          [0, 0.15]
        ],
        48
      ),
      base
    );
    this.disk = new THREE.Group();
    this.group.add(this.disk);
    const diskMesh = new THREE.Mesh(
      lathe(
        [
          [0, 0.15],
          [1.46, 0.15],
          [1.5, 0.17],
          [1.49, 0.195],
          [1.44, TOP],
          [0, TOP]
        ],
        48
      ),
      top
    );
    diskMesh.receiveShadow = true;
    diskMesh.castShadow = true;
    this.disk.add(diskMesh);
    // mitades naranja / azul en el canto + anillo interior
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const seg = new THREE.Mesh(bevelBox(0.5, 0.05, 0.08, { bevel: 0.015 }), i < 8 ? orange : blue);
      seg.position.set(Math.cos(a) * 1.515, 0.165, Math.sin(a) * 1.515);
      seg.rotation.y = -a + Math.PI / 2;
      this.disk.add(seg);
    }
    const ring = new THREE.Mesh(torus(1.05, 0.025, 6, 64), orange);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = TOP + 0.005;
    this.disk.add(ring);
    const ring2 = new THREE.Mesh(torus(1.05, 0.025, 6, 64, Math.PI), blue);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = TOP + 0.007;
    this.disk.add(ring2);
    // focos a ras de suelo
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const lamp = new THREE.Group();
      lamp.position.set(Math.cos(a) * 2.35, 0, Math.sin(a) * 2.35);
      lamp.rotation.y = -a - Math.PI / 2;
      const body = new THREE.Mesh(cylinder(0.16, 0.2, 0.22, 14), dark);
      body.position.y = 0.11;
      body.castShadow = true;
      lamp.add(body);
      const lens = new THREE.Mesh(cylinder(0.13, 0.13, 0.03, 14), i % 2 ? blue : orange);
      lens.position.y = 0.235;
      lamp.add(lens);
      this.group.add(lamp);
    }
  }

  enter() {
    const g = this.game;
    this.group.visible = true;
    this.t = 0;
    this.spin = Math.PI;
    this.poseT = 2.2;
    this.pose = 0;
    g.paint.clear();
    g.projectiles.clear();
    g.particles.clear();
    g.respawn.reset();
    for (const c of g.characters) {
      const bot = c !== g.player;
      c.active = !bot;
      c.setVisible(!bot);
      c.frozen = false;
    }
    const p = g.player;
    g.health.reset(p);
    p.weapons.reset();
    p.weapons.equip(0, true);
    p.spawnAt(CENTER.x, CENTER.y, CENTER.z, this.spin);
    p.visualOffsetY = TOP;
    p.animator.setEmotion(4, 2);
    // primeras manchas para que la escena nunca esté vacía
    for (let i = 0; i < 26; i++) this.drop(true);
  }

  exit() {
    const g = this.game;
    this.group.visible = false;
    g.player.visualOffsetY = 0;
    for (const c of g.characters) {
      c.active = true;
      c.setVisible(true);
    }
  }

  /** Una gota de pintura cae del cielo cerca de la plataforma. */
  drop(instant = false) {
    const g = this.game;
    const a = Math.random() * Math.PI * 2;
    const r = 2.2 + Math.random() * 7.5;
    const x = CENTER.x + Math.cos(a) * r;
    const z = CENTER.z + Math.sin(a) * r * 0.8 + 1.5;
    const team = Math.random() < 0.5 ? 0 : 1;
    if (instant) {
      g.paint.stampGround(x, CENTER.y, z, 0.35 + Math.random() * 0.8, team, { shape: Math.random() < 0.3 ? 'drop' : 'round', rot: Math.random() * 6.28 });
      return;
    }
    g.particles.rain(x, CENTER.y + 9 + Math.random() * 4, z, COLORS.team[team].main, team, 0.09 + Math.random() * 0.08);
  }

  update(dt, rdt) {
    const g = this.game;
    const p = g.player;
    this.t += rdt;
    this.spin += rdt * 0.42;
    this.disk.rotation.y = this.spin;

    // poses: quieto, apuntar, saltito, cambio de arma
    this.poseT -= rdt;
    const it = p.intent;
    it.moveX = 0;
    it.moveZ = 0;
    it.fire = false;
    it.firePressed = false;
    it.jump = false;
    it.jumpHeld = true;
    it.run = false;
    it.reload = false;
    it.melee = false;
    it.switchTo = -1;
    it.switchDelta = 0;
    if (this.poseT <= 0) {
      this.pose = (this.pose + 1) % 4;
      this.poseT = this.pose === 1 ? 2.6 : 3.2;
      if (this.pose === 2) it.jump = true;
      if (this.pose === 3) it.switchTo = (p.weapons.index + 1) % WEAPON_ORDER.length;
      if (this.pose === 0) p.animator.setEmotion(4, 1.5);
    }
    it.aim = this.pose === 1;
    it.lookYaw = this.spin;
    it.lookPitch = this.pose === 1 ? 0.08 : 0;
    p.bodyYaw = this.spin;
    // la física sigue en su sitio (la plataforma no es sólida)
    p.motor.pos.x = CENTER.x;
    p.motor.pos.z = CENTER.z;

    // lluvia de pintura
    this.rainT -= rdt;
    if (this.rainT <= 0) {
      this.rainT = 0.1 + Math.random() * 0.14;
      this.drop();
    }

    // cámara: se mece por delante del personaje con el mapa al fondo
    const a = Math.PI + Math.sin(this.t * 0.11) * 0.5;
    const R = 4.4 + Math.sin(this.t * 0.07) * 0.3;
    const pos = this._pos.set(CENTER.x + Math.sin(a) * R, CENTER.y + 1.5 + Math.sin(this.t * 0.13) * 0.2, CENTER.z + Math.cos(a) * R);
    // mirar a un punto a la izquierda del personaje: queda a la derecha del encuadre
    const fx = CENTER.x - pos.x;
    const fz = CENTER.z - pos.z;
    const fl = Math.hypot(fx, fz) || 1;
    const rx = -fz / fl;
    const rz = fx / fl;
    const off = g.camera.aspect > 1.2 ? 1.05 : 0;
    const look = this._look.set(CENTER.x - rx * off, CENTER.y + 1.02, CENTER.z - rz * off);
    g.cameraCtrl.setFree(pos, look, 46);
  }
}
