import * as THREE from 'three';
import { Time } from './core/Time.js';
import { AssetLoader, loadFonts } from './core/AssetLoader.js';
import { bus } from './core/EventBus.js';
import { Input } from './core/Input.js';
import { Renderer } from './render/Renderer.js';
import { PostFX } from './render/PostFX.js';
import { Lighting } from './render/Lighting.js';
import { Sky } from './render/Sky.js';
import { Water } from './render/Water.js';
import { sharedUniforms } from './render/ToonMaterial.js';
import { makeNoiseTexture } from './render/TextureFactory.js';
import { createWorldTextures, createWorldMaterials } from './world/Materials.js';
import { MapBuilder } from './world/MapBuilder.js';
import { tugboat } from './world/props/Harbor.js';
import { PaintSystem } from './paint/PaintSystem.js';
import { TerritoryTracker } from './paint/TerritoryTracker.js';
import { Particles } from './fx/Particles.js';
import { ScreenShake } from './fx/ScreenShake.js';
import { HitStop } from './fx/HitStop.js';
import { ProjectileSystem } from './combat/Projectile.js';
import { WeaponSystem } from './combat/WeaponSystem.js';
import { HealthSystem } from './combat/HealthSystem.js';
import { RespawnSystem } from './combat/RespawnSystem.js';
import { Stats } from './match/Stats.js';
import { Character } from './player/Character.js';
import { PlayerInput } from './player/PlayerController.js';
import { CameraController } from './player/CameraController.js';
import { EnemyAI } from './ai/EnemyAI.js';
import { BOT_ROSTER } from './ai/BotPersonalities.js';
import { GameManager } from './match/GameManager.js';
import { GRAPHICS_PRESETS, DEFAULT_SETTINGS, PLAYER, CAMERA, COLORS, WEAPON_ORDER } from './config.js';

const _v = new THREE.Vector3();
const _hit = {};

export class Game {
  constructor() {
    this.container = document.getElementById('app');
    this.params = new URLSearchParams(location.search);
    this.time = new Time();
    this.settings = { ...DEFAULT_SETTINGS };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.15, 1400);
    this.ready = false;
    this.frameCount = 0;
    this.simTime = 0;
    this.characters = [];
    this.demoActors = [];
    this.playerAim = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3() };
    // qué partes de la simulación están activas (lo decide el GameManager)
    this.flow = { look: true, control: true, ai: true, combat: true, camera: 'player', territory: true };
    this.bots = [];
    this.autoplay = this.params.has('autoplay');
    this.gm = new GameManager(this);
  }

  // ── arranque ──────────────────────────────────────────────

  async boot() {
    const status = document.getElementById('bootStatus');
    const pct = document.getElementById('bootPct');
    const level = document.getElementById('dropLevel');
    const loader = new AssetLoader((p, label) => {
      if (status && label) status.textContent = label + '…';
      if (pct) pct.textContent = Math.round(p * 100) + '%';
      if (level) level.setAttribute('transform', `translate(0,${(160 - p * 150).toFixed(1)})`);
    });
    loader
      .add('Cargando tipografías', 1, () => loadFonts(['400 32px Bungee', '400 16px Rubik', '700 16px Rubik', '800 16px Rubik', '900 16px Rubik']))
      .add('Preparando el renderizador', 1, () => this.initRenderer())
      .add('Generando texturas', 3, () => this.initTextures())
      .add('Construyendo Puerto Croma', 5, () => this.initWorld())
      .add('Mezclando la pintura', 2, () => this.initPaint())
      .add('Creando a los Drippers', 2, () => this.initCharacters())
      .add('Despertando a los bots', 1, () => this.initBots())
      .add('Compilando shaders', 3, () => this.compileShaders());
    await loader.run();
    this.loadTimings = loader.timings;
    this.gm.init();
    this.start();
  }

  initRenderer() {
    this.renderer = new Renderer(this.container);
    this.preset = GRAPHICS_PRESETS[this.settings.graphics] || GRAPHICS_PRESETS.medium;
    this.renderer.applyPreset(this.preset);
    this.lighting = new Lighting(this.scene);
    this.lighting.configureShadow(this.preset.shadowExtent, this.preset.shadowMapSize, this.preset.shadowRadius);
    this.postfx = new PostFX(this.renderer.renderer, this.scene, this.camera);
    this.postfx.applyPreset(this.preset);
    if (this.params.has('tm')) this.postfx.toneMapping.mode = +this.params.get('tm');
    if (this.params.has('sun')) this.lighting.sun.intensity = +this.params.get('sun');
    if (this.params.has('hemi')) this.lighting.hemi.intensity = +this.params.get('hemi');
    this.renderer.onResize((w, h) => {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.postfx.setSize(w, h);
    });
    this.renderer.resize();
  }

  initTextures() {
    this.noise = makeNoiseTexture(256);
    sharedUniforms.uNoiseTex.value = this.noise;
    this.worldTextures = createWorldTextures();
    this.materials = createWorldMaterials(this.worldTextures);
  }

  initWorld() {
    this.sky = new Sky({ sunDir: this.lighting.sunDir, noise: this.noise });
    this.scene.add(this.sky.mesh);
    this.scene.environment = this.sky.makeEnvironment(this.renderer.renderer);
    this.scene.fog = new THREE.Fog(this.sky.horizonColor.clone(), 70, 520);

    const builder = new MapBuilder({ materials: this.materials, textures: this.worldTextures });
    this.map = builder.build();
    this.scene.add(this.map.group);
    this.collision = this.map.collision;
    sharedUniforms.uOverlayTex.value = this.map.overlay;
    sharedUniforms.uWetTex.value = this.map.wet;

    this.water = new Water({ level: PLAYER.waterLevel });
    this.water.setShore(this.map.shore);
    this.scene.add(this.water.mesh);

    this.tug = tugboat(this.materials);
    this.tug.position.set(-47.5, PLAYER.waterLevel, -27);
    this.tug.rotation.y = 0.08;
    this.scene.add(this.tug);
  }

  initPaint() {
    const r = this.renderer.renderer;
    this.paint = new PaintSystem(r, this.collision, this.map.atlas);
    this.paint.setQuality(this.preset.paintQuality);
    this.territory = new TerritoryTracker(r, this.paint, { minX: -40.6, maxX: 38, minZ: -62, maxZ: 62 });
    this.particles = new Particles(this.scene, this.paint);
    this.particles.heightAt = (x, z) => this.paint.cellHeight(x, z);
    this.projectiles = new ProjectileSystem(this.scene, this.collision, this.paint, this.particles);
    this.health = new HealthSystem();
    this.moveEnv = { paintAt: (x, z) => this.paint.paintAt(x, z) };
    this.combatCtx = {
      projectiles: this.projectiles,
      paint: this.paint,
      particles: this.particles,
      characters: this.characters,
      damage: (att, vic, dmg, crit, weapon, x, y, z) => this.health.damage(att, vic, dmg, crit, weapon, x, y, z, this.simTime)
    };
    this.projectiles.characters = this.characters;
    this.projectiles.onHit = (p, ch, crit, dmg, x, y, z) => this.health.damage(p.owner, ch, dmg, crit, p.weapon, x, y, z, this.simTime);
    this.stats = new Stats();
    this.paint.onStamp = (team, area, owner) => {
      if (owner && owner.team === team) this.stats.addPaint(owner, area);
    };
    this.respawn = new RespawnSystem(this.scene, {
      paint: this.paint,
      particles: this.particles,
      health: this.health,
      spawns: this.map.spawns,
      docks: [0, 1].map((t) => ({ x: 0, y: 2.4 + 7.6, z: t === 0 ? -60.6 : 60.6 })),
      heightAt: (x, z) => this.paint.cellHeight(x, z)
    });
    this.deathCam = { active: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), killer: null, t: 0 };
    this.bindCombatEvents();
  }

  /** Reacciones de juego a daño y eliminaciones. */
  bindCombatEvents() {
    this.hitStop = new HitStop(this.time, () => this.player);
    bus.on('damage', (e) => {
      if (e.victim === this.player) {
        this.postfx.hit(Math.min(1, e.amount / 40));
        this.shake.add(Math.min(0.5, e.amount / 70));
      }
    });
    bus.on('paintHurt', (e) => {
      if (e.victim === this.player) this.postfx.hit(0.15);
    });
    bus.on('kill', (e) => {
      this.respawn.onDeath(e.victim, e.killer, e.cause);
      const streak = this.stats.onKill(e.killer, e.victim, e.assisters);
      if (e.killer) bus.emit('streak', { character: e.killer, streak });
      if (e.victim === this.player) {
        this.time.slowMotion(0.25, 0.4);
        const dc = this.deathCam;
        dc.active = true;
        dc.t = 0;
        dc.killer = e.killer && e.killer !== this.player ? e.killer : null;
        dc.pos.copy(this.camera.position);
        dc.look.copy(this.player.position).setY(this.player.position.y + 1);
        this.shake.add(0.6);
      }
      if (e.killer === this.player) this.shake.add(0.25);
      if (e.killer && e.killer !== e.victim) e.killer.animator.setEmotion(4, 1.6);
    });
    bus.on('respawn:drop', ({ character }) => {
      if (character !== this.player) return;
      this.deathCam.active = false;
      const sp = this.map.spawns[character.team][0];
      this.playerInput.setView(sp.yaw, -0.12);
      this.cameraCtrl.snap(character.position, sp.yaw, -0.12);
    });
  }

  /** Cámara de muerte: se retira desde el punto de muerte y enfoca a quien te eliminó. */
  updateDeathCam(dt) {
    const dc = this.deathCam;
    dc.t += dt;
    const p = this.player.position;
    const k = dc.killer && dc.killer.alive ? dc.killer : null;
    const target = _v;
    if (k) target.set(k.position.x, k.position.y + 1.0, k.position.z);
    else target.set(p.x, p.y + 0.8, p.z);
    let bx;
    let bz;
    if (k) {
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      bx = -dx / len;
      bz = -dz / len;
    } else {
      const orbit = dc.t * 0.35;
      bx = Math.sin(orbit);
      bz = Math.cos(orbit);
    }
    // detrás y por encima del punto de muerte, sin atravesar paredes
    const ox = p.x;
    const oy = p.y + 1.8;
    const oz = p.z;
    let wx = bx * 3.4;
    let wy = 0.9;
    let wz = bz * 3.4;
    const wl = Math.hypot(wx, wy, wz);
    const hit = this.collision.raycast(ox, oy, oz, wx / wl, wy / wl, wz / wl, wl, cameraBlock, _hit);
    const f = hit ? Math.max(0.15, (hit.t - 0.35) / wl) : 1;
    const want = this._dcWant || (this._dcWant = new THREE.Vector3());
    want.set(ox + wx * f, oy + wy * f, oz + wz * f);
    dc.pos.lerp(want, 1 - Math.exp(-dt * 4));
    dc.look.lerp(target, 1 - Math.exp(-dt * 6));
    const dist = dc.pos.distanceTo(target);
    const fov = k ? Math.max(32, Math.min(60, 64 - dist * 1.1)) : 60;
    this.cameraCtrl.setFree(dc.pos, dc.look, fov);
  }

  initCharacters() {
    this.input = new Input(this.renderer.canvas);
    this.shake = new ScreenShake();
    this.cameraCtrl = new CameraController(this.camera, this.collision);
    this.playerInput = new PlayerInput(this.input, this.settings);
    const player = this.addCharacter({
      name: 'TÚ',
      team: 0,
      isPlayer: true,
      look: { hoodie: 0xc7b8e0, accessory: 'headphones', accColor: 0xf2a7c3 },
      loadout: WEAPON_ORDER
    });
    this.player = player;
    const sp = { ...this.map.spawns[0][1] };
    // ?at=x,y,z,yaw coloca al jugador (capturas de depuración)
    if (this.params.has('at')) {
      const a = this.params.get('at').split(',').map(Number);
      Object.assign(sp, { x: a[0], y: a[1], z: a[2], yaw: a[3] || 0 });
    }
    player.spawnAt(sp.x, sp.y, sp.z, sp.yaw);
    this.playerInput.setView(sp.yaw, -0.12);
    this.cameraCtrl.snap(player.position, sp.yaw, -0.12);
    bus.on('weapon:shot', ({ character, weapon, strength }) => {
      if (character !== this.player) return;
      this.cameraCtrl.kick(weapon.cfg.recoil * 40 * strength);
      this.shake.add(weapon.cfg.shake * strength);
    });
    this.parseDebugIntent();
    this.setupDebugDemo();
  }

  addCharacter({ name, team, isPlayer = false, look, loadout }) {
    const c = new Character({ name, team, look, isPlayer, collision: this.collision });
    c.weapons = new WeaponSystem(c, loadout, this.combatCtx);
    this.health.register(c);
    this.respawn.register(c);
    this.stats.register(c);
    this.characters.push(c);
    this.scene.add(c.object);
    return c;
  }

  /** 2 aliados + 3 rivales con su personalidad, arma y carril. */
  initBots() {
    this.ai = new EnemyAI({ collision: this.collision, paint: this.paint, characters: this.characters });
    this.bots = [];
    const wantBots = !this.params.has('demo') && this.params.get('bots') !== '0';
    if (!wantBots) return;
    // ?autoplay: el jugador también lo maneja la IA (pruebas de partida completa)
    if (this.autoplay) this.ai.add(this.player, 'agresivo', 'center');
    const slots = [0, 0];
    this.respawn.entries.get(this.player).slot = 1;
    for (const r of BOT_ROSTER) {
      const c = this.addCharacter({ name: r.name, team: r.team, look: r.look, loadout: r.loadout });
      this.ai.add(c, r.personality, r.lane);
      this.bots.push(c);
      let slot = slots[r.team]++;
      if (r.team === 0 && slot >= 1) slot++; // el jugador ocupa el hueco central
      this.respawn.placeAtSpawn(c, slot);
    }
  }

  async compileShaders() {
    this.camera.position.set(0, 30, -80);
    this.camera.lookAt(0, 0, 0);
    const r = this.renderer.renderer;
    if (r.extensions.has('KHR_parallel_shader_compile')) await r.compileAsync(this.scene, this.camera);
    else r.compile(this.scene, this.camera);
  }

  start() {
    this.ready = true;
    const boot = document.getElementById('boot');
    if (boot) boot.classList.add('hidden');
    bus.emit('game:ready');
    // ?frames=N detiene el bucle tras N fotogramas (capturas de depuración)
    const maxFrames = this.params.has('frames') ? +this.params.get('frames') : Infinity;
    this.renderer.renderer.info.autoReset = false;
    const loop = (now) => {
      this.renderer.renderer.info.reset();
      this.frame(now);
      if (this.frameCount < maxFrames) requestAnimationFrame(loop);
      else this.stopped = true;
    };
    requestAnimationFrame(loop);
  }

  // ── bucle ─────────────────────────────────────────────────

  frame(now) {
    this.time.update(now);
    // ?sim=N: N pasos de simulación de 1/60 s por fotograma (capturas deterministas)
    const simSteps = this.params.has('sim') ? +this.params.get('sim') : 0;
    if (simSteps > 0) {
      for (let i = 0; i < simSteps; i++) this.gm.update(1 / 60, 1 / 60);
    } else {
      this.gm.update(this.time.delta, this.time.realDelta);
    }
    this.render();
    this.frameCount++;
  }

  update(dt) {
    this.simTime += dt;
    const t = this.simTime;
    sharedUniforms.uInkTime.value = t;
    this.paint.update(dt);
    if (this.demoActors.length || this.demoPaint) this.updateDemo(t);

    // jugador: entrada → intención → apuntado desde la cámara
    const f = this.flow;
    const intent = this.player.intent;
    if (this.autoplay || (!f.look && !f.control)) {
      this.input.consumeMouse();
      this.input.consumeWheel();
    } else {
      this.playerInput.sample(intent, CAMERA, f.control, f.look);
    }
    if (this.debugIntent) Object.assign(intent, this.debugIntent);
    if (this.demoAutoAim) this.autoAimPlayer(intent);

    if (this.ai.bots.length) {
      this.ai.enabled = this.flow.ai;
      this.ai.update(dt, t);
    }
    for (const c of this.characters) if (c.active) c.update(dt, this.moveEnv);
    if (this.audio) {
      for (const c of this.characters) {
        if (!c.active || !c.alive) continue;
        if (c.motor.justJumped) this.audio.jump(c);
        if (c.motor.justLanded > 2.5) this.audio.land(c, c.motor.justLanded / 12);
      }
    }
    if (this.demoActors.length) this.demoPost();
    this.computePlayerAim();
    for (const c of this.characters) {
      if (!c.active) continue;
      const aim = c === this.player && !this.autoplay ? this.playerAim : c.botAim || this.fallbackAim(c);
      c.weapons.update(dt, c.intent, aim);
    }
    if (f.combat) this.health.update(dt, t, this.paint);
    this.respawn.update(dt);
    this.projectiles.update(dt);
    this.particles.update(dt);
    this.footEffects(dt);
    this.paint.flush();
    if (f.territory) this.territory.update(dt);

    this.shake.update(dt);
    this.cameraCtrl.baseFov = this.settings.fov;
    if (f.camera === 'player') {
      if (this.deathCam.active) this.updateDeathCam(dt);
      else this.updatePlayerCamera(dt);
    }
    this.input.endFrame();
    if (this.params.has('cam')) this.debugCamera();
    this.lighting.update(this.player.position);
    this.water.update(t);
    this.tug.position.y = this.water.heightAt(-47.5, -27) + 0.1;
    this.tug.rotation.z = Math.sin(t * 0.9) * 0.03;
  }

  /** Cámara al hombro del jugador (o de ?follow=NOMBRE). */
  updatePlayerCamera(dt) {
    const focus = this.params.has('follow') ? this.characters.find((c) => c.name === this.params.get('follow')) || this.player : this.player;
    const pm = focus.motor;
    const fi = focus.intent;
    this.cameraCtrl.update(
      dt,
      { pos: pm.pos, speed: Math.hypot(pm.vel.x, pm.vel.z), surfing: pm.surfing, running: fi.run, aiming: fi.aim, grounded: pm.grounded },
      fi.lookYaw,
      fi.lookPitch,
      this.shake
    );
  }

  render() {
    this.sky.update(this.camera, this.simTime);
    this.postfx.render(this.time.realDelta);
  }

  /** Punto de mira del jugador: rayo desde la cámara contra mundo y enemigos. */
  computePlayerAim() {
    const aim = this.playerAim;
    const cam = this.cameraCtrl;
    aim.origin.copy(this.camera.position);
    aim.dir.copy(cam.dir);
    // empezar el rayo a la altura del jugador para no apuntar a lo que hay entre cámara y personaje
    const skip = Math.max(0, _v.subVectors(this.player.position, aim.origin).dot(aim.dir) - 0.2);
    const ox = aim.origin.x + aim.dir.x * skip;
    const oy = aim.origin.y + aim.dir.y * skip;
    const oz = aim.origin.z + aim.dir.z * skip;
    let best = 90;
    const w = this.collision.raycast(ox, oy, oz, aim.dir.x, aim.dir.y, aim.dir.z, best, projectileBlock, _hit);
    if (w) best = w.t;
    this.aimTarget = null;
    for (const c of this.characters) {
      if (!c.alive || c.team === this.player.team) continue;
      const cp = c.position;
      for (let k = 0; k < 2; k++) {
        const hy = k === 0 ? 0.62 : 1.2;
        const r = k === 0 ? 0.5 : 0.36;
        const lx = ox - cp.x;
        const ly = oy - (cp.y + hy);
        const lz = oz - cp.z;
        const b = lx * aim.dir.x + ly * aim.dir.y + lz * aim.dir.z;
        const cc = lx * lx + ly * ly + lz * lz - r * r;
        const disc = b * b - cc;
        if (disc < 0) continue;
        const tt = -b - Math.sqrt(disc);
        if (tt > 0 && tt < best) {
          best = tt;
          this.aimTarget = c;
        }
      }
    }
    aim.point.set(ox + aim.dir.x * best, oy + aim.dir.y * best, oz + aim.dir.z * best);
    aim.distance = best + skip;
  }

  fallbackAim(c) {
    if (!c._aim) c._aim = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), point: new THREE.Vector3() };
    const a = c._aim;
    c.headPosition(a.origin);
    const cp = Math.cos(c.aimPitch);
    a.dir.set(Math.sin(c.aimYaw) * cp, Math.sin(c.aimPitch), Math.cos(c.aimYaw) * cp);
    a.point.copy(a.origin).addScaledVector(a.dir, 30);
    return a;
  }

  /** Estela brillante, chispas de surf y partículas pegajosas según la pintura. */
  footEffects(dt) {
    for (const c of this.characters) {
      if (!c.alive || !c.visible) continue;
      const m = c.motor;
      const tc = COLORS.team[c.team];
      c.fxTimer = (c.fxTimer || 0) - dt;
      if (c.fxTimer > 0) continue;
      const speed = Math.hypot(m.vel.x, m.vel.z);
      if (m.surfing) {
        c.fxTimer = 0.03;
        this.particles.sparks(m.pos.x, m.pos.y, m.pos.z, m.vel.x, m.vel.z, tc.accent, 2);
      } else if (m.paint === 1 && speed > 2) {
        c.fxTimer = 0.09;
        this.particles.sparks(m.pos.x, m.pos.y, m.pos.z, m.vel.x * 0.4, m.vel.z * 0.4, tc.accent, 1);
      } else if (m.paint === -1) {
        c.fxTimer = 0.12;
        this.particles.goo(m.pos.x, m.pos.y, m.pos.z, COLORS.team[1 - c.team].main);
      }
    }
  }

  // ── depuración ───────────────────────────────────────────

  /** ?cam=px,py,pz,tx,ty,tz[,fov]: cámara fija para capturas de depuración. */
  debugCamera() {
    const v = this.params.get('cam').split(',').map(Number);
    this.camera.position.set(v[0], v[1], v[2]);
    this.camera.lookAt(v[3], v[4], v[5]);
    if (v[6]) {
      this.camera.fov = v[6];
      this.camera.updateProjectionMatrix();
    }
  }

  /** ?intent=moveZ:1,run:1 fuerza una intención del jugador (capturas automáticas). */
  parseDebugIntent() {
    this.debugIntent = null;
    if (!this.params.has('intent')) return;
    this.debugIntent = {};
    for (const kv of this.params.get('intent').split(',')) {
      const [k, v] = kv.split(':');
      this.debugIntent[k] = v === 'true' ? true : v === 'false' ? false : +v;
    }
  }

  /** Escenas de demostración para capturas automáticas (?demo=anim|paint). */
  setupDebugDemo() {
    if (this.params.get('demo') === 'paint') {
      this.demoPaint = true;
      return;
    }
    if (this.params.get('demo') === 'combat') {
      // dos maniquíes enemigos; el jugador apunta solo al más cercano
      const looks = [
        { team: 1, hoodie: 0x9fcfb8, accessory: 'cap', accColor: 0xf6d77a },
        { team: 1, hoodie: 0xf3e6cf, accessory: 'scarf', accColor: 0xf2a7c3 }
      ];
      looks.forEach((lk, i) => {
        const c = this.addCharacter({ name: 'maniquí' + i, team: 1, look: lk, loadout: ['blaster'] });
        c.spawnAt(-1.5 + i * 3.5, 0, -31 + i * 1.5, Math.PI);
        this.respawn.entries.get(c).slot = i;
        this.demoActors.push({ c, mode: 'idle', ax: c.position.x, az: c.position.z });
      });
      this.demoAutoAim = true;
      return;
    }
    if (this.params.get('demo') !== 'anim') return;
    const looks = [
      { team: 1, hoodie: 0x9fcfb8, accessory: 'cap', accColor: 0xf6d77a },
      { team: 0, hoodie: 0x3a3548, pants: 0x5b5570, accessory: 'antenna' },
      { team: 1, hoodie: 0xf3e6cf, accessory: 'scarf', accColor: 0xf2a7c3 },
      { team: 0, hoodie: 0xf2a7c3, accessory: 'crown' }
    ];
    const modes = (this.params.get('modes') || 'walk,run,jump,aim').split(',');
    const weapons = (this.params.get('weapons') || 'blaster,roller,splasher,blaster').split(',');
    looks.forEach((lk, i) => {
      const c = this.addCharacter({ name: 'demo' + i, team: lk.team, look: lk, loadout: [weapons[i] || 'blaster'] });
      const x = 3.9 - i * 2.6;
      c.spawnAt(x, 0, -20, Math.PI);
      this.demoActors.push({ c, mode: modes[i] || 'idle', ax: x, az: -20 });
    });
  }

  /** Siembra manchas de ambos equipos en suelo y paredes (una sola vez). */
  paintDemo() {
    this.demoPaint = false;
    const P = this.paint;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const team = i % 3 === 0 ? 1 : 0;
      const x = -12 + rnd() * 24;
      const z = -40 + rnd() * 16 + (team ? 6 : 0);
      P.stampGround(x, 0, z, 0.9 + rnd() * 0.9, team, { shape: rnd() < 0.3 ? 'streak' : 'round', rot: rnd() * 6.28 });
    }
    for (let i = 0; i < 6; i++) P.stampGround(-6 + i * 1.3, 0, -27.5, 1.37, 1, { shape: 'roller', rot: Math.PI / 2, stretch: 0.34 });
    // franja propia larga para probar el surf
    for (let z = -46; z < -12; z += 0.6) P.stampGround(-11 + Math.sin(z * 0.2) * 0.6, 0, z, 1.6, 0, { shape: 'roller', rot: Math.PI / 2, stretch: 0.34 });
    // paredes: contenedores del carril central y barreras
    for (const s of this.collision.solids) {
      if (!s.faces || Math.abs(s.cz + 23) > 1 || Math.abs(Math.abs(s.cx) - 9) > 0.5) continue;
      for (let f = 0; f < 4; f++) {
        if (!s.faces[f]) continue;
        for (let k = 0; k < 6; k++) {
          const face = s.faces[f];
          const u = rnd();
          // punto sobre la cara en coordenadas del mundo
          const lx = f === 0 ? s.hx : f === 1 ? -s.hx : (u - 0.5) * 2 * s.hx;
          const lz = f === 2 ? s.hz : f === 3 ? -s.hz : (u - 0.5) * 2 * s.hz;
          const wx = s.cx + lx * s.cos + lz * s.sin;
          const wz = s.cz - lx * s.sin + lz * s.cos;
          P.stampWall(s, f, wx, s.bottom + 0.4 + rnd() * 1.8, wz, 0.8 + rnd() * 0.6, k % 2, { rot: -Math.PI / 2, shape: 'streak', stretch: 1.1 });
          void face;
        }
      }
    }
  }

  updateDemo(t) {
    if (this.demoPaint) this.paintDemo();
    for (const a of this.demoActors) {
      const it = a.c.intent;
      it.lookYaw = Math.PI;
      it.lookPitch = 0;
      it.moveX = 0;
      it.moveZ = 0;
      it.jump = false;
      it.jumpHeld = true;
      it.run = false;
      it.aim = false;
      it.fire = false;
      it.firePressed = false;
      if (a.mode === 'walk' || a.mode === 'run') {
        it.moveZ = -1;
        it.run = a.mode === 'run';
      } else if (a.mode === 'roll') {
        it.moveZ = -1;
        it.fire = true;
      } else if (a.mode === 'strafe') {
        it.moveX = Math.sin(t * 1.5) > 0 ? 1 : -1;
        it.aim = true;
      } else if (a.mode === 'surf') {
        it.moveZ = -1;
        it.moveX = Math.sin(t * 2) * 0.8;
        it.run = true;
        a.c.motor.surfGrace = 1;
      } else if (a.mode === 'jump') {
        it.jump = Math.floor(t * 0.8) !== Math.floor((t - 0.02) * 0.8);
      } else if (a.mode === 'aim' || a.mode === 'shoot') {
        it.aim = a.mode === 'aim';
        it.fire = true;
        it.lookYaw = Math.PI + Math.sin(t) * 0.5;
        it.lookPitch = -0.25 + Math.sin(t * 0.7) * 0.15;
      }
    }
  }

  /** Demo de combate: el jugador mira al enemigo vivo más cercano y dispara. */
  autoAimPlayer(intent) {
    let best = null;
    let bd = Infinity;
    for (const c of this.characters) {
      if (!c.alive || c.team === this.player.team) continue;
      const d = c.position.distanceTo(this.player.position);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    intent.fire = !!best;
    if (!best) return;
    const cam = this.camera.position;
    const tx = best.position.x - cam.x;
    const ty = best.position.y + 0.8 - cam.y;
    const tz = best.position.z - cam.z;
    intent.lookYaw = Math.atan2(tx, tz);
    intent.lookPitch = Math.atan2(ty, Math.hypot(tx, tz));
    this.playerInput.setView(intent.lookYaw, intent.lookPitch);
  }

  /** Mantiene a los actores de la demo en su sitio (cinta de correr). */
  demoPost() {
    for (const a of this.demoActors) {
      if (a.mode === 'walk' || a.mode === 'run' || a.mode === 'surf' || a.mode === 'strafe' || a.mode === 'roll') {
        a.c.motor.pos.x = a.ax;
        a.c.motor.pos.z = a.az;
        a.c.object.position.x = a.ax;
        a.c.object.position.z = a.az;
      }
    }
  }
}

function projectileBlock(s) {
  return s.blocksProjectiles;
}

function cameraBlock(s) {
  return s.blocksCamera;
}
