// UIManager: HUD, menus, countdown, death/end screens, name tags and minimap.
import * as THREE from 'three';
import { TEAM, TEAM_INFO, INK } from '../core/config.js';
import { ARENA } from '../world/MapBuilder.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function fmtTime(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class UIManager {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of ['hud', 'menu', 'controlsPanel', 'optionsPanel', 'pauseMenu', 'endScreen', 'endBanner', 'countdown', 'deathScreen',
      'timer', 'pctOrange', 'pctBlue', 'turfO', 'turfB', 'healthFill', 'healthText', 'inkFill', 'inkText', 'killsText', 'deathsText',
      'streakBox', 'streakText', 'weaponName', 'weaponDesc', 'crosshair', 'hitmarker', 'reloadRing', 'reloadArc', 'inkWarn', 'centerMsg',
      'damageVignette', 'dmgIndicators', 'killfeed', 'nameTags', 'deathKiller', 'deathTime', 'clickToPlay', 'minimap', 'minimapDots',
      'climbHint', 'surfaceTint', 'fps', 'loading']) this.el[id] = $(id);
    this.slots = [...document.querySelectorAll('.slot')];
    this.cache = {};
    this.panelReturn = null;
    this.tags = new Map();
    this.miniT = 0;
    this.inkWarnT = 0;

    // Button wiring
    document.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('mouseenter', () => game.audio.play('hover'));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        game.audio.unlock();
        game.audio.play('click');
        if (game.state === 'menu' && !game.audio.music && b.dataset.action !== 'play') game.audio.startMusic('menu');
        this.onAction(b.dataset.action, b);
      });
    });

    // Minimap setup
    const mm = this.el.minimap;
    this.miniCtx = mm.getContext('2d');
    this.miniImg = this.miniCtx.createImageData(mm.width, mm.height);
    this.dotsCtx = this.el.minimapDots.getContext('2d');
    const sx = mm.width / (ARENA.maxX - ARENA.minX + 4), sz = mm.height / (ARENA.maxZ - ARENA.minZ + 4);
    this.toMini = (x, z) => [Math.floor((x - ARENA.minX + 2) * sx), Math.floor((z - ARENA.minZ + 2) * sz)];
    game.paint.buildMinimapIndex(mm.width, mm.height, this.toMini);
  }

  onAction(action) {
    const g = this.game;
    switch (action) {
      case 'play': g.startMatch(); break;
      case 'controls': this.openPanel('controlsPanel'); break;
      case 'options': this.openPanel('optionsPanel'); break;
      case 'back': this.closePanel(); break;
      case 'resume': g.resume(); break;
      case 'restart': g.startMatch(); break;
      case 'quit': g.toMenu(); break;
      case 'again': g.startMatch(); break;
    }
  }

  openPanel(id) {
    const from = ['menu', 'pauseMenu'].find((k) => !this.el[k].classList.contains('hidden'));
    this.panelReturn = from || null;
    if (from) this.el[from].classList.add('hidden');
    this.el[id].classList.remove('hidden');
  }

  closePanel() {
    this.el.controlsPanel.classList.add('hidden');
    this.el.optionsPanel.classList.add('hidden');
    if (this.panelReturn) this.el[this.panelReturn].classList.remove('hidden');
    this.panelReturn = null;
  }

  hideAllScreens() {
    for (const k of ['menu', 'controlsPanel', 'optionsPanel', 'pauseMenu', 'endScreen', 'endBanner', 'deathScreen', 'clickToPlay']) this.el[k].classList.add('hidden');
    this.el.countdown.innerHTML = '';
  }

  showMenu() {
    this.hideAllScreens();
    this.el.hud.classList.add('hidden');
    this.el.menu.classList.remove('hidden');
  }

  showHUD() {
    this.hideAllScreens();
    this.el.hud.classList.remove('hidden');
    this.el.killfeed.innerHTML = '';
    this.el.centerMsg.innerHTML = '';
    this.el.dmgIndicators.innerHTML = '';
    this.cache = {};
  }

  showPause(v) {
    this.el.pauseMenu.classList.toggle('hidden', !v);
    if (!v) { this.el.controlsPanel.classList.add('hidden'); this.el.optionsPanel.classList.add('hidden'); this.panelReturn = null; }
  }

  isPanelOpen() {
    return !this.el.controlsPanel.classList.contains('hidden') || !this.el.optionsPanel.classList.contains('hidden');
  }

  setClickToPlay(v) { this.el.clickToPlay.classList.toggle('hidden', !v); }

  countdown(text, cls = '') {
    this.el.countdown.innerHTML = `<div class="cd ${cls}">${text}</div>`;
  }

  set(id, prop, value) {
    const key = id + prop;
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (prop === 'text') this.el[id].textContent = value;
    else if (prop === 'width') this.el[id].style.width = value;
    else if (prop === 'class') this.el[id].className = value;
  }

  // ---------------- per-frame HUD ----------------
  updateHUD(dt, player, match, pct) {
    this.set('timer', 'text', fmtTime(match.timeLeft));
    this.set('timer', 'class', match.timeLeft <= 10 && match.state === 'playing' ? 'urgent' : '');
    const po = pct[TEAM.ORANGE], pb = pct[TEAM.BLUE];
    this.set('pctOrange', 'text', `${po.toFixed(1)}%`);
    this.set('pctBlue', 'text', `${pb.toFixed(1)}%`);
    this.set('turfO', 'width', `${po.toFixed(1)}%`);
    this.set('turfB', 'width', `${pb.toFixed(1)}%`);

    const hp = Math.ceil(player.health.hp);
    this.set('healthFill', 'width', `${player.health.frac * 100}%`);
    this.set('healthText', 'text', String(hp));
    this.el.healthFill.parentElement.classList.toggle('low', hp < 35);
    const w = player.weapons;
    const ink = Math.floor(w.inkFrac * 100);
    this.set('inkFill', 'width', `${w.inkFrac * 100}%`);
    this.set('inkText', 'text', `${ink}%`);
    const inkBar = this.el.inkFill.parentElement;
    inkBar.classList.toggle('reloading', w.reloading);
    inkBar.classList.toggle('empty', w.ink < w.def.inkCost);
    this.set('killsText', 'text', String(player.stats.kills));
    this.set('deathsText', 'text', String(player.stats.deaths));
    this.set('streakText', 'text', String(player.stats.streak));
    this.el.streakBox.classList.toggle('hidden', player.stats.streak < 2);
    const def = w.def;
    this.set('weaponName', 'text', def.name);
    this.set('weaponDesc', 'text', def.desc);
    this.slots.forEach((s, i) => s.classList.toggle('active', i === w.index));

    // Reload ring
    this.el.crosshair.classList.toggle('hidden', !player.alive);
    this.el.reloadRing.classList.toggle('hidden', !w.reloading || !player.alive);
    if (w.reloading) this.el.reloadArc.style.strokeDashoffset = String(150.8 * (1 - w.reloadT / INK.reloadTime));

    this.inkWarnT -= dt;
    this.el.inkWarn.classList.toggle('hidden', !(this.inkWarnT > 0 && !w.reloading));

    // Crosshair
    const ctl = player.controller;
    this.el.crosshair.classList.toggle('enemy', !!(ctl && ctl.aimTarget));
    const spread = (player.intent.aiming ? def.aimSpread : def.spread) * 1.4 + player.model.recoil * 14;
    this.el.crosshair.style.setProperty('--spread', `${spread.toFixed(1)}px`);

    // Damage vignette fades
    const vig = this.el.damageVignette;
    const target = Math.max(0, (1 - player.health.frac) * 0.8 - 0.1) + (player.health.sinceDamage < 0.3 ? 0.4 : 0);
    vig.style.opacity = String(Math.min(1, target));

    this.el.climbHint.classList.toggle('hidden', !player.climbing);
    const surf = player.surface === player.team ? 'own' : player.surface === player.enemyTeam ? 'enemy' : '';
    this.set('surfaceTint', 'class', surf);

    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.4; this.updateMinimap(); }
    this.updateMinimapDots(player);
  }

  flashInkWarning() { this.inkWarnT = 1.2; }

  hitmarker(kill) {
    const h = this.el.hitmarker;
    h.classList.remove('show', 'kill');
    void h.offsetWidth;
    h.classList.add('show');
    if (kill) h.classList.add('kill');
  }

  damageFrom(angle) {
    const d = document.createElement('div');
    d.className = 'dmg-ind';
    d.style.transform = `rotate(${angle}rad)`;
    this.el.dmgIndicators.appendChild(d);
    setTimeout(() => d.remove(), 1000);
    while (this.el.dmgIndicators.children.length > 4) this.el.dmgIndicators.firstChild.remove();
  }

  centerMessage(text, color = '#fff') {
    this.el.centerMsg.innerHTML = `<div class="msg" style="color:${color}">${text}</div>`;
  }

  killfeed(killer, victim, involvesPlayer) {
    const cls = (c) => (c.team === TEAM.ORANGE ? 'o' : 'b');
    const d = document.createElement('div');
    d.className = 'kf' + (involvesPlayer ? ' me' : '');
    d.innerHTML = `<span class="${killer ? cls(killer) : ''}">${killer ? killer.name : '—'}</span><span>✹</span><span class="${cls(victim)}">${victim.name}</span>`;
    this.el.killfeed.prepend(d);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => d.remove(), 5000);
  }

  showDeath(killerName) {
    this.el.deathKiller.textContent = killerName || '—';
    this.el.deathScreen.classList.remove('hidden');
  }
  updateDeath(t) { this.set('deathTime', 'text', String(Math.max(1, Math.ceil(t)))); }
  hideDeath() { this.el.deathScreen.classList.add('hidden'); }

  // ---------------- name tags ----------------
  updateTags(chars, player, camera) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const c of chars) {
      if (c === player) continue;
      let tag = this.tags.get(c);
      if (!tag) {
        tag = document.createElement('div');
        tag.innerHTML = `<div class="nm"></div><div class="hp"><div></div></div>`;
        this.el.nameTags.appendChild(tag);
        this.tags.set(c, tag);
      }
      const ally = c.team === player.team;
      tag.className = 'tag ' + (ally ? 'ally' : 'enemy');
      let show = c.alive;
      if (show) {
        const dist = camera.position.distanceTo(c.motor.pos);
        _s.copy(c.motor.pos).setY(c.motor.pos.y + 2.25).project(camera);
        show = _s.z < 1 && Math.abs(_s.x) < 1.1 && Math.abs(_s.y) < 1.1 && dist < (ally ? 60 : 30);
        // Enemies only get tags when close or recently hit, and never through walls
        if (show && !ally) show = c.health.sinceDamage < 3 || dist < 14;
        if (show && !ally) show = this.game.world.lineOfSight(camera.position, _v.copy(c.motor.pos).setY(c.motor.pos.y + 1.2));
        if (show) {
          tag.style.left = `${((_s.x + 1) / 2) * w}px`;
          tag.style.top = `${((1 - _s.y) / 2) * h}px`;
          tag.firstChild.textContent = c.name;
          tag.lastChild.firstChild.style.width = `${c.health.frac * 100}%`;
          tag.style.opacity = String(Math.max(0.35, 1 - dist / 70));
        }
      }
      tag.style.display = show ? 'block' : 'none';
    }
  }

  clearTags() {
    for (const t of this.tags.values()) t.remove();
    this.tags.clear();
  }

  // ---------------- minimap ----------------
  updateMinimap() {
    this.game.paint.fillMinimap(this.miniImg.data);
    this.miniCtx.putImageData(this.miniImg, 0, 0);
  }

  updateMinimapDots(player) {
    const ctx = this.dotsCtx;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    for (const c of this.game.characters) {
      if (!c.alive || (c.team !== player.team)) continue;
      const [x, y] = this.toMini(c.motor.pos.x, c.motor.pos.z);
      if (c === player) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-c.facingYaw);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = TEAM_INFO[c.team].css;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
  }

  // ---------------- end screen ----------------
  showEndBanner() {
    this.el.endBanner.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.deathScreen.classList.add('hidden');
  }

  showResults(r) {
    this.el.endBanner.classList.add('hidden');
    this.el.endScreen.classList.remove('hidden');
    const title = $('resultTitle');
    const draw = r.winner === 0;
    title.textContent = draw ? '¡EMPATE!' : r.winner === r.playerTeam ? '¡VICTORIA!' : 'DERROTA';
    title.className = draw ? '' : r.winner === r.playerTeam ? 'win' : 'lose';
    $('resultSub').textContent = draw ? 'Nadie domina la ciudad… ¡por ahora!' : `El equipo ${TEAM_INFO[r.winner].name} controla la ciudad`;
    $('finalO').style.width = '0%';
    $('finalB').style.width = '0%';
    $('finalOText').textContent = `NARANJA ${r.pct[TEAM.ORANGE].toFixed(1)}%`;
    $('finalBText').textContent = `AZUL ${r.pct[TEAM.BLUE].toFixed(1)}%`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const max = Math.max(1, r.pct[1], r.pct[2]);
      $('finalO').style.width = `${(r.pct[1] / max) * 100}%`;
      $('finalB').style.width = `${(r.pct[2] / max) * 100}%`;
    }));
    $('resKills').textContent = r.player.kills;
    $('resDeaths').textContent = r.player.deaths;
    $('resPaint').textContent = `${Math.round(r.player.paint)} m²`;
    $('resScore').textContent = r.player.score;
    const tb = document.querySelector('#scoreboard tbody');
    tb.innerHTML = '';
    for (const row of r.rows) {
      const tr = document.createElement('tr');
      tr.className = (row.team === TEAM.ORANGE ? 'o' : 'b') + (row.isPlayer ? ' me' : '');
      tr.innerHTML = `<td>${row.name}</td><td>${row.kills}</td><td>${row.deaths}</td><td>${Math.round(row.paint)} m²</td><td>${row.score}</td>`;
      tb.appendChild(tr);
    }
  }

  setFps(v, show) {
    this.el.fps.classList.toggle('hidden', !show);
    if (show) this.el.fps.textContent = `${v} FPS`;
  }

  hideLoading() { this.el.loading.classList.add('hidden'); }
}
