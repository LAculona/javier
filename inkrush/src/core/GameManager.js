// GameManager: owns the renderer, scene and every system; runs the main loop
// and the high-level state machine (menu → match → pause/end).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { TEAM, TEAM_INFO, QUALITY, BOT_NAMES, MATCH } from './config.js';
import { Input } from './Input.js';
import { MatchManager } from './MatchManager.js';
import { MapBuilder } from '../world/MapBuilder.js';
import { Environment, createDetailTexture } from '../world/Environment.js';
import { PaintSystem } from '../paint/PaintSystem.js';
import { ProjectileSystem } from '../combat/ProjectileSystem.js';
import { EffectsSystem } from '../fx/EffectsSystem.js';
import { AudioManager } from '../audio/AudioManager.js';
import { CameraController } from '../player/CameraController.js';
import { PlayerController } from '../player/PlayerController.js';
import { Character } from '../player/Character.js';
import { NavGraph } from '../ai/NavGraph.js';
import { BotAI } from '../ai/EnemyAI.js';
import { RespawnSystem } from '../systems/RespawnSystem.js';
import { UIManager } from '../ui/UIManager.js';

const OPTIONS_KEY = 'inkrush-options-v1';
const DEFAULT_OPTIONS = { volume: 0.8, music: 0.5, sensitivity: 1, quality: 'medium', difficulty: 'normal', invertY: false, showFps: false };

export class GameManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'menu';
    this.time = 0;
    this.options = this.loadOptions();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 600);

    // World
    const builder = new MapBuilder().build();
    this.world = builder.world;
    this.spawns = builder.spawns;
    this.env = new Environment(this.scene, this.renderer);
    this.paint = new PaintSystem(this.renderer, builder.faces, this.world);
    this.arenaMaterial = this.paint.createWorldMaterial(createDetailTexture());
    this.arena = builder.buildMesh(this.paint, this.arenaMaterial);
    this.scene.add(this.arena);
    this.nav = new NavGraph(this.world);

    // Systems
    this.audio = new AudioManager();
    this.input = new Input(canvas);
    this.cameraController = new CameraController(this.camera, this.world);
    this.fx = new EffectsSystem(this.scene);
    this.projectiles = new ProjectileSystem(this.scene, this);
    this.match = new MatchManager(this);
    this.respawn = new RespawnSystem(this, this.spawns);
    this.createCharacters();
    this.ui = new UIManager(this);

    this.input.onEscape = () => this.handleEscape();
    this.input.onLockChange = (locked) => this.handleLockChange(locked);
    window.addEventListener('resize', () => this.resize());
    this.bindOptions();
    this.applyOptions();
    this.resize();

    this.last = performance.now();
    this.fpsFrames = 0;
    this.fpsT = 0;
    this.attractT = 0;
    this.enterMenu(true);
    this.ui.hideLoading();
    this.renderer.setAnimationLoop(() => this.loop());
  }

  // ---------------------------------------------------------------- setup
  createCharacters() {
    this.characters = [];
    this.player = new Character(this, { team: TEAM.ORANGE, name: 'TÚ', isPlayer: true, variant: 1, weapon: 0 });
    this.playerController = new PlayerController(this, this.player);
    this.player.demoAI = new BotAI(this, this.player, 'normal');
    this.characters.push(this.player);
    this.bots = [];
    const loadouts = { [TEAM.ORANGE]: [2, 1, 0], [TEAM.BLUE]: [0, 1, 2, 0] };
    for (const team of [TEAM.ORANGE, TEAM.BLUE]) {
      BOT_NAMES[team].forEach((name, i) => {
        const c = new Character(this, { team, name, variant: i + (team === TEAM.BLUE ? 2 : 0), weapon: loadouts[team][i] });
        c.controller = new BotAI(this, c, this.options.difficulty);
        this.characters.push(c);
        this.bots.push(c);
      });
    }
  }

  loadOptions() {
    try {
      const raw = localStorage.getItem(OPTIONS_KEY);
      if (raw) return { ...DEFAULT_OPTIONS, ...JSON.parse(raw) };
    } catch { /* storage unavailable */ }
    return { ...DEFAULT_OPTIONS };
  }

  saveOptions() {
    try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(this.options)); } catch { /* ignore */ }
  }

  bindOptions() {
    const o = this.options;
    const $ = (id) => document.getElementById(id);
    const vol = $('optVolume'), mus = $('optMusic'), sens = $('optSens'), inv = $('optInvert'), fps = $('optFps');
    vol.value = Math.round(o.volume * 100);
    mus.value = Math.round(o.music * 100);
    sens.value = Math.round(o.sensitivity * 100);
    inv.checked = o.invertY;
    fps.checked = o.showFps;
    const refresh = () => {
      $('volVal').textContent = vol.value;
      $('musVal').textContent = mus.value;
      $('sensVal').textContent = (sens.value / 100).toFixed(2);
    };
    refresh();
    vol.addEventListener('input', () => { o.volume = vol.value / 100; refresh(); this.applyOptions(); });
    mus.addEventListener('input', () => { o.music = mus.value / 100; refresh(); this.applyOptions(); });
    sens.addEventListener('input', () => { o.sensitivity = sens.value / 100; refresh(); this.applyOptions(); });
    inv.addEventListener('change', () => { o.invertY = inv.checked; this.applyOptions(); });
    fps.addEventListener('change', () => { o.showFps = fps.checked; this.applyOptions(); });
    const seg = (id, key) => {
      const root = $(id);
      const sync = () => root.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === o[key]));
      root.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        o[key] = b.dataset.v;
        sync();
        this.audio.unlock();
        this.audio.play('click');
        this.applyOptions();
      }));
      sync();
    };
    seg('optQuality', 'quality');
    seg('optDifficulty', 'difficulty');
  }

  applyOptions() {
    const o = this.options;
    this.audio.setVolume(o.volume);
    this.audio.setMusicVolume(o.music);
    this.cameraController.sensitivity = o.sensitivity;
    this.cameraController.invertY = o.invertY;
    for (const b of this.bots) b.controller.setDifficulty(o.difficulty);
    const q = QUALITY[o.quality] || QUALITY.medium;
    if (this.appliedQuality !== o.quality) {
      this.appliedQuality = o.quality;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
      const shadowsChanged = this.renderer.shadowMap.enabled !== q.shadows;
      this.renderer.shadowMap.enabled = q.shadows;
      this.env.setShadows(q.shadows, q.shadowSize);
      if (shadowsChanged) this.scene.traverse((obj) => { if (obj.material) [].concat(obj.material).forEach((m) => { m.needsUpdate = true; }); });
      this.fx.scale = q.particles;
      this.useBloom = q.bloom;
      if (q.bloom && !this.composer) this.setupComposer();
      this.resize();
    }
    this.saveOptions();
  }

  setupComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.45, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  // ---------------------------------------------------------------- states
  resetArena() {
    this.paint.clear();
    this.projectiles.clear();
    this.fx.clear();
    this.respawn.clear();
    for (const c of this.characters) c.resetStats();
  }

  enterMenu(first = false) {
    this.state = 'menu';
    this.input.enabled = false;
    this.input.unlock();
    this.input.reset();
    this.resetArena();
    this.player.controller = this.player.demoAI;
    this.respawn.spawnAll();
    this.match.state = 'idle';
    this.ui.clearTags();
    this.ui.showMenu();
    this.ui.hideDeath();
    this.audio.stopMusic();
    if (!first) this.audio.startMusic('menu');
  }

  toMenu() {
    if (this.state !== 'menu') this.playerWeapon = this.player.weapons.index;
    this.enterMenu();
  }

  startMatch() {
    this.audio.unlock();
    this.audio.stopMusic();
    this.resetArena();
    this.player.controller = this.playerController;
    this.player.weapons.select(this.playerWeapon ?? 0);
    this.player.weapons.switchT = 0;
    this.respawn.spawnAll();
    this.cameraController.snapBehind(this.player.motor.pos, 0);
    this.cameraController.dist = 4.3;
    this.match.start();
    this.ui.showHUD();
    this.ui.hideDeath();
    this.state = 'playing';
    this.input.reset();
    this.input.enabled = true;
    this.input.lock();
    this.pauseGuard = performance.now();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pauseGuard = performance.now();
    this.input.reset();
    this.ui.showPause(true);
    this.ui.setClickToPlay(false);
    this.input.unlock();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.showPause(false);
    this.input.reset();
    this.input.lock();
    this.pauseGuard = performance.now();
    this.last = performance.now();
  }

  handleEscape() {
    const now = performance.now();
    if (this.state === 'playing') { if (now - (this.pauseGuard || 0) > 250) this.pause(); }
    else if (this.state === 'paused') {
      if (this.ui.isPanelOpen()) this.ui.closePanel();
      else if (now - this.pauseGuard > 250) this.resume();
    } else if (this.state === 'menu' && this.ui.isPanelOpen()) this.ui.closePanel();
  }

  handleLockChange(locked) {
    if (this.state !== 'playing') return;
    if (!locked && this.match.state !== 'ended') {
      // Browser released the pointer (ESC / focus loss): pause the game
      if (performance.now() - (this.pauseGuard || 0) > 400) this.pause();
      else this.ui.setClickToPlay(true);
    } else this.ui.setClickToPlay(false);
  }

  onMatchEnd(results) {
    this.ui.showEndBanner();
    this.audio.stopMusic();
    this.audio.play('whistle');
    const win = results.winner === this.player.team;
    setTimeout(() => this.audio.play(win ? 'victory' : 'defeat'), 1300);
    this.input.unlock();
    this.input.enabled = false;
  }

  showResults(results) {
    this.playerWeapon = this.player.weapons.index;
    this.state = 'ended';
    this.ui.showResults(results);
  }

  // ---------------------------------------------------------------- combat events
  damageCharacter(target, amount, attacker, dir) {
    const live = this.state === 'menu' || this.match.playing;
    if (!live || !target.alive) return;
    const wasAlive = target.alive;
    const applied = target.health.damage(amount, attacker, dir);
    if (!applied) return;
    const inMatch = this.state !== 'menu';
    if (inMatch && attacker && attacker.isPlayer) {
      this.ui.hitmarker(wasAlive && !target.alive);
      this.audio.play('hitmarker');
    }
    if (inMatch && target.isPlayer) {
      this.audio.play('hurt');
      this.cameraController.shake(0.12);
      if (attacker) {
        const dx = attacker.motor.pos.x - target.motor.pos.x, dz = attacker.motor.pos.z - target.motor.pos.z;
        const ang = Math.atan2(-dx, -dz) - this.cameraController.yaw;
        this.ui.damageFrom(-ang);
      }
    } else {
      this.audio.play('hit', target.motor.pos, 0.6);
    }
  }

  onCharacterDeath(victim, killer) {
    victim.stats.deaths++;
    victim.stats.streak = 0;
    const pos = victim.motor.pos.clone();
    const killerTeam = killer ? killer.team : victim.enemyTeam;
    this.fx.death(pos, victim.team, killerTeam);
    const m2 = this.paint.splat(pos.clone().setY(pos.y + 0.3), 2.6, killerTeam);
    if (killer) {
      killer.stats.kills++;
      killer.stats.streak++;
      killer.stats.bestStreak = Math.max(killer.stats.bestStreak, killer.stats.streak);
      killer.stats.paint += m2;
    }
    victim.kill();
    this.audio.play('death', victim.isPlayer ? null : pos);
    this.respawn.schedule(victim, MATCH.respawnTime);
    if (this.state === 'menu') return;

    this.ui.killfeed(killer, victim, victim.isPlayer || (killer && killer.isPlayer));
    if (killer && killer.isPlayer) {
      this.audio.play('kill');
      const s = killer.stats.streak;
      const streakTxt = s >= 5 ? '¡IMPARABLE!' : s === 4 ? '¡RACHA x4!' : s === 3 ? '¡RACHA x3!' : s === 2 ? '¡DOBLE!' : '';
      this.ui.centerMessage(`ELIMINASTE A <span style="color:${TEAM_INFO[victim.team].css}">${victim.name}</span>${streakTxt ? '<br><small>' + streakTxt + '</small>' : ''}`);
    }
    if (victim.isPlayer) {
      this.deathCamKiller = killer;
      this.ui.showDeath(killer ? killer.name : null);
    }
  }

  onPlayerRespawn() {
    if (this.state === 'menu') return;
    this.ui.hideDeath();
    this.cameraController.snapBehind(this.player.motor.pos, this.player.facingYaw);
    this.deathCamKiller = null;
  }

  // ---------------------------------------------------------------- loop
  separate() {
    const cs = this.characters;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        if (!b.alive) continue;
        const dx = b.motor.pos.x - a.motor.pos.x, dz = b.motor.pos.z - a.motor.pos.z;
        if (Math.abs(b.motor.pos.y - a.motor.pos.y) > 1.5) continue;
        const d2 = dx * dx + dz * dz, min = 0.85;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          a.motor.pos.x -= (dx / d) * push; a.motor.pos.z -= (dz / d) * push;
          b.motor.pos.x += (dx / d) * push; b.motor.pos.z += (dz / d) * push;
        }
      }
    }
  }

  loop() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    this.time += dt;

    this.fpsFrames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.ui.setFps(Math.round(this.fpsFrames / this.fpsT), this.options.showFps);
      this.fpsFrames = 0; this.fpsT = 0;
    }

    if (this.state === 'paused') {
      this.render();
      this.input.endFrame();
      return;
    }

    if (this.state === 'menu') this.updateMenu(dt);
    else this.updateMatch(dt);

    this.env.update(this.time);
    this.paint.flush();
    this.render();
    this.input.endFrame();
  }

  updateMenu(dt) {
    for (const c of this.characters) c.update(dt, true);
    this.separate();
    this.projectiles.update(dt);
    this.respawn.update(dt);
    this.fx.update(dt);
    this.cameraController.orbit(dt, new THREE.Vector3(0, 0, 0), 52, 24, 0.07);
    const cam = this.camera.position;
    this.audio.setListener(cam.x, cam.y, cam.z, Math.atan2(-cam.x, -cam.z) + Math.PI);
    // Keep the attract mode colorful: refresh the arena every ~70 s
    this.attractT += dt;
    if (this.attractT > 70) { this.attractT = 0; this.paint.clear(); }
  }

  updateMatch(dt) {
    this.match.update(dt);
    const active = this.match.state === 'playing';
    for (const c of this.characters) c.update(dt, active);
    this.separate();
    this.projectiles.update(dt);
    if (active) this.respawn.update(dt);
    this.fx.update(dt);

    const p = this.player;
    if (p.alive) {
      this.cameraController.follow(dt, p.motor.pos, p.intent.aiming && active);
    } else {
      const k = this.deathCamKiller;
      this.cameraController.deathView(dt, p.motor.pos, k && k.alive ? k.motor.pos.clone().setY(k.motor.pos.y + 1) : null);
      this.ui.updateDeath(this.respawn.timeLeft(p));
    }
    this.audio.setListener(p.motor.pos.x, p.motor.pos.y, p.motor.pos.z, this.cameraController.yaw);
    if (this.match.state !== 'ended') {
      this.ui.updateHUD(dt, p, this.match, this.paint.percentages());
      this.ui.updateTags(this.characters, p, this.camera);
      this.ui.setClickToPlay(this.state === 'playing' && !this.input.locked && active && !this.ui.isPanelOpen());
    }
  }

  render() {
    if (this.useBloom && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
