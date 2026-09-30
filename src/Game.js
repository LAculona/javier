import * as THREE from 'three';
import { Time } from './core/Time.js';
import { AssetLoader, loadFonts } from './core/AssetLoader.js';
import { bus } from './core/EventBus.js';
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
import { createDripper } from './player/CharacterRig.js';
import { Input } from './core/Input.js';
import { Character } from './player/Character.js';
import { PlayerInput } from './player/PlayerController.js';
import { CameraController } from './player/CameraController.js';
import { ScreenShake } from './fx/ScreenShake.js';
import { CAMERA } from './config.js';
import { GRAPHICS_PRESETS, DEFAULT_SETTINGS, PAINT, PLAYER } from './config.js';

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
  }

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
      .add('Creando a los Drippers', 2, () => this.initCharacters())
      .add('Compilando shaders', 3, () => this.compileShaders());
    await loader.run();
    this.loadTimings = loader.timings;
    this.start();
  }

  initRenderer() {
    this.renderer = new Renderer(this.container);
    const preset = GRAPHICS_PRESETS[this.settings.graphics];
    this.renderer.applyPreset(preset);
    this.lighting = new Lighting(this.scene);
    this.lighting.configureShadow(preset.shadowExtent, preset.shadowMapSize, preset.shadowRadius);
    this.postfx = new PostFX(this.renderer.renderer, this.scene, this.camera);
    this.postfx.applyPreset(preset);
    // parámetros de depuración para ajustar el look desde la URL
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
    // lienzos de pintura vacíos hasta que el PaintSystem cree sus render targets
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    blank.needsUpdate = true;
    sharedUniforms.uPaintGround.value = blank;
    sharedUniforms.uPaintAtlas.value = blank;
    const b = PAINT.bounds;
    sharedUniforms.uPaintBounds.value.set(b.minX, b.minZ, 1 / (b.maxX - b.minX), 1 / (b.maxZ - b.minZ));
  }

  initWorld() {
    this.sky = new Sky({ sunDir: this.lighting.sunDir, noise: this.noise });
    this.scene.add(this.sky.mesh);
    this.scene.environment = this.sky.makeEnvironment(this.renderer.renderer);
    this.scene.environmentIntensity = 1;
    this.scene.fog = new THREE.Fog(this.sky.horizonColor.clone(), 70, 520);

    const builder = new MapBuilder({ materials: this.materials, textures: this.worldTextures });
    this.map = builder.build();
    this.scene.add(this.map.group);
    this.collision = this.map.collision;
    sharedUniforms.uOverlayTex.value = this.map.overlay;
    sharedUniforms.uWetTex.value = this.map.wet;
    sharedUniforms.uAtlasMeters.value = this.map.atlas.size;

    this.water = new Water({ level: PLAYER.waterLevel });
    this.water.setShore(this.map.shore);
    this.scene.add(this.water.mesh);

    if (this.params.has('rig')) {
      // escena de depuración: tres Drippers en reposo sobre la plaza
      const looks = [
        { team: 0, hoodie: 0xc7b8e0, accessory: 'headphones', accColor: 0xf2a7c3 },
        { team: 1, hoodie: 0x9fcfb8, accessory: 'cap', accColor: 0xf6d77a },
        { team: 0, hoodie: 0x3a3548, pants: 0x5b5570, accessory: 'antenna' }
      ];
      looks.forEach((lk, i) => {
        const d = createDripper(lk);
        d.mesh.position.set(-1.4 + i * 1.4, 1.2, -6.5);
        d.mesh.rotation.y = Math.PI + (i - 1) * 0.5;
        this.scene.add(d.mesh);
      });
    }
    this.tug = tugboat(this.materials);
    this.tug.position.set(-47.5, PLAYER.waterLevel, -27);
    this.tug.rotation.y = 0.08;
    this.scene.add(this.tug);
  }

  initCharacters() {
    this.input = new Input(this.renderer.canvas);
    this.shake = new ScreenShake();
    this.cameraCtrl = new CameraController(this.camera, this.collision);
    this.playerInput = new PlayerInput(this.input, this.settings);
    this.characters = [];
    const player = new Character({
      name: 'TÚ',
      team: 0,
      isPlayer: true,
      look: { hoodie: 0xc7b8e0, accessory: 'headphones', accColor: 0xf2a7c3 },
      collision: this.collision
    });
    this.player = player;
    this.characters.push(player);
    this.scene.add(player.object);
    const sp = this.map.spawns[0][1];
    player.spawnAt(sp.x, sp.y, sp.z, sp.yaw);
    this.playerInput.setView(sp.yaw, -0.12);
    this.cameraCtrl.snap(player.position, sp.yaw, -0.12);
    // entorno de movimiento (la pintura se conecta en la fase de pintura)
    this.moveEnv = { paintAt: () => -1 };
    // ?intent=moveZ:1,run:1 fuerza una intención del jugador (capturas automáticas)
    this.debugIntent = null;
    if (this.params.has('intent')) {
      this.debugIntent = {};
      for (const kv of this.params.get('intent').split(',')) {
        const [k, v] = kv.split(':');
        this.debugIntent[k] = v === 'true' ? true : v === 'false' ? false : +v;
      }
    }
    this.setupDebugDemo();
  }

  /** Escenas de demostración para capturas automáticas (?demo=...). */
  setupDebugDemo() {
    const demo = this.params.get('demo');
    this.demoActors = [];
    if (demo !== 'anim') return;
    const looks = [
      { team: 1, hoodie: 0x9fcfb8, accessory: 'cap', accColor: 0xf6d77a },
      { team: 0, hoodie: 0x3a3548, pants: 0x5b5570, accessory: 'antenna' },
      { team: 1, hoodie: 0xf3e6cf, accessory: 'scarf', accColor: 0xf2a7c3 },
      { team: 0, hoodie: 0xf2a7c3, accessory: 'crown' }
    ];
    const modes = (this.params.get('modes') || 'walk,run,jump,aim').split(',');
    looks.forEach((lk, i) => {
      const c = new Character({ name: 'demo' + i, team: lk.team, look: lk, collision: this.collision });
      const x = 3.9 - i * 2.6;
      c.spawnAt(x, 0, -20, Math.PI);
      this.scene.add(c.object);
      this.characters.push(c);
      this.demoActors.push({ c, mode: modes[i] || 'idle', ax: x, az: -20 });
    });
  }

  /** Mantiene a los actores de la demo en su sitio (cinta de correr). */
  demoPost() {
    for (const a of this.demoActors) {
      if (a.mode === 'walk' || a.mode === 'run' || a.mode === 'surf' || a.mode === 'strafe') {
        a.c.motor.pos.x = a.ax;
        a.c.motor.pos.z = a.az;
        a.c.object.position.x = a.ax;
        a.c.object.position.z = a.az;
      }
    }
  }

  updateDemo(t) {
    for (const a of this.demoActors) {
      const it = a.c.intent;
      it.lookYaw = 0;
      it.lookPitch = 0;
      it.moveX = 0;
      it.moveZ = 0;
      it.jump = false;
      it.jumpHeld = true;
      it.run = false;
      it.aim = false;
      if (a.mode === 'walk' || a.mode === 'run') {
        it.moveZ = -1;
        it.run = a.mode === 'run';
      } else if (a.mode === 'strafe') {
        it.moveX = Math.sin(t * 1.5) > 0 ? 1 : -1;
        it.aim = true;
        it.lookYaw = Math.PI;
      } else if (a.mode === 'surf') {
        it.moveZ = -1;
        it.moveX = Math.sin(t * 2) * 0.8;
        it.run = true;
        a.c.motor.surfing = true;
        a.c.motor.surfGrace = 1;
      } else if (a.mode === 'jump') {
        it.jump = Math.floor(t * 0.8) !== Math.floor((t - 0.02) * 0.8);
      } else if (a.mode === 'aim') {
        it.aim = true;
        it.lookYaw = Math.PI + Math.sin(t) * 0.6;
        it.lookPitch = Math.sin(t * 0.7) * 0.4;
        a.c.firing = Math.sin(t * 3) > 0;
        if (a.c.firing && Math.random() < 0.3) a.c.animator.onShoot(1);
      }
    }
  }

  async compileShaders() {
    this.camera.position.set(0, 30, -80);
    this.camera.lookAt(0, 0, 0);
    // compilación asíncrona (KHR_parallel_shader_compile) para no congelar la barra
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

  frame(now) {
    this.time.update(now);
    // ?sim=N: N pasos de simulación de 1/60 s por fotograma (capturas deterministas)
    const simSteps = this.params.has('sim') ? +this.params.get('sim') : 0;
    if (simSteps > 0) {
      for (let i = 0; i < simSteps; i++) this.update(1 / 60);
    } else {
      this.update(this.time.delta);
    }
    this.render();
    this.frameCount++;
  }

  update(dt) {
    this.simTime = (this.simTime || 0) + dt;
    const t = this.simTime;
    sharedUniforms.uInkTime.value = t;
    if (this.demoActors.length) this.updateDemo(t);
    // jugador
    const intent = this.player.intent;
    this.playerInput.sample(intent, CAMERA, true);
    if (this.debugIntent) Object.assign(intent, this.debugIntent);
    for (const c of this.characters) c.update(dt, this.moveEnv);
    if (this.demoActors.length) this.demoPost();
    this.shake.update(dt);
    const pm = this.player.motor;
    this.cameraCtrl.baseFov = this.settings.fov;
    this.cameraCtrl.update(
      dt,
      { pos: pm.pos, speed: Math.hypot(pm.vel.x, pm.vel.z), surfing: pm.surfing, running: intent.run, aiming: intent.aim, grounded: pm.grounded },
      intent.lookYaw,
      intent.lookPitch,
      this.shake
    );
    this.input.endFrame();
    if (this.params.has('cam')) this.debugCamera();
    this.lighting.update(this.player.position);
    this.sky.update(this.camera, t);
    this.water.update(t);
    this.tug.position.y = this.water.heightAt(-47.5, -27) + 0.1;
    this.tug.rotation.z = Math.sin(t * 0.9) * 0.03;
  }

  render() {
    this.sky.update(this.camera, this.simTime || 0);
    this.postfx.render(this.time.realDelta);
  }
}
