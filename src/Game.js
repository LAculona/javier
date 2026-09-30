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

    this.tug = tugboat(this.materials);
    this.tug.position.set(-47.5, PLAYER.waterLevel, -27);
    this.tug.rotation.y = 0.08;
    this.scene.add(this.tug);
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

  debugCamera(t) {
    const cam = this.params.get('cam');
    if (cam) {
      const v = cam.split(',').map(Number);
      this.camera.position.set(v[0], v[1], v[2]);
      this.camera.lookAt(v[3], v[4], v[5]);
      if (v[6]) {
        this.camera.fov = v[6];
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    const a = t * 0.05;
    this.camera.position.set(Math.sin(a) * 70, 38, Math.cos(a) * 70);
    this.camera.lookAt(0, 0, 0);
  }

  frame(now) {
    this.time.update(now);
    const t = this.time.elapsed;
    sharedUniforms.uInkTime.value = t;
    this.debugCamera(t);
    this.lighting.update(this.camera.position.clone().setY(0));
    this.sky.update(this.camera, t);
    this.water.update(t);
    this.tug.position.y = this.water.heightAt(-47.5, -27) + 0.1;
    this.tug.rotation.z = Math.sin(t * 0.9) * 0.03;
    this.postfx.render(this.time.realDelta);
    this.frameCount++;
  }
}
