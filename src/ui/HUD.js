import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { WEAPONS, COLORS } from '../config.js';
import { WEAPON_ICONS, DROP_ICON, SKULL_ICON, splatSVG } from './Icons.js';

// ─────────────────────────────────────────────────────────────
//  HUD · interfaz de partida
//  Temporizador + barra de territorio (arriba), vida (abajo izq.),
//  tarjeta de arma con depósito (abajo dcha.), retícula dinámica con
//  anillo de recarga, feed de eliminaciones, rachas, indicadores de daño
//  direccional, viñeta del color enemigo, etiquetas de nombre, números de
//  daño flotantes, pantalla de eliminado y estadísticas (F3).
//  Sólo se escribe en el DOM cuando un valor cambia.
// ─────────────────────────────────────────────────────────────

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3();
const STREAKS = { 2: '¡DOBLE!', 3: '¡TRIPLE!', 4: '¡IMPARABLE!', 5: '¡LEYENDA!' };
const TEAM_NAME = ['NARANJA', 'AZUL'];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export class HUD {
  constructor(root, game) {
    this.game = game;
    this.root = el('div', 'hud hidden');
    root.appendChild(this.root);
    this.cache = {};
    this.statsVisible = false;
    this.dmgFlash = 0;
    this.damageNumbers = [];
    this.tags = new Map();
    this.dirs = [];
    this.build();
    this.bind();
  }

  build() {
    const r = this.root;
    const pc = COLORS.team[0].css;
    const bc = COLORS.team[1].css;

    // viñeta del color enemigo (debajo de todo)
    this.vignette = el('div', 'hud-vignette');
    r.appendChild(this.vignette);

    // etiquetas de nombre y números de daño
    this.tagLayer = el('div', 'hud-tags');
    r.appendChild(this.tagLayer);
    this.numLayer = el('div', 'hud-numbers');
    r.appendChild(this.numLayer);
    for (let i = 0; i < 18; i++) {
      const n = el('div', 'dmg-num');
      this.numLayer.appendChild(n);
      this.damageNumbers.push({ el: n, t: 1, x: 0, y: 0, z: 0, dx: 0, on: false });
    }

    // arriba: temporizador y territorio
    this.top = el(
      'div',
      'hud-top',
      `<div class="terr">
        <span class="terr-pct o">0%</span>
        <div class="terr-bar"><div class="terr-fill o"></div><div class="terr-fill b"></div><div class="terr-mid"></div></div>
        <span class="terr-pct b">0%</span>
      </div>
      <div class="timer"><span class="timer-t">3:00</span></div>`
    );
    r.appendChild(this.top);
    this.timerEl = this.top.querySelector('.timer');
    this.timerT = this.top.querySelector('.timer-t');
    this.terrO = this.top.querySelector('.terr-fill.o');
    this.terrB = this.top.querySelector('.terr-fill.b');
    this.terrPO = this.top.querySelector('.terr-pct.o');
    this.terrPB = this.top.querySelector('.terr-pct.b');
    this.terrO.style.background = pc;
    this.terrB.style.background = bc;

    // vida
    this.hp = el(
      'div',
      'hud-hp',
      `<div class="hp-icon">${DROP_ICON}</div>
      <div class="hp-body"><div class="hp-label">VIDA</div><div class="hp-bar"><i></i><b></b></div></div>
      <div class="hp-num">100</div>`
    );
    r.appendChild(this.hp);
    this.hpFill = this.hp.querySelector('.hp-bar i');
    this.hpGhost = this.hp.querySelector('.hp-bar b');
    this.hpNum = this.hp.querySelector('.hp-num');

    // tarjeta de arma
    this.weapon = el(
      'div',
      'hud-weapon',
      `<div class="wc-bg">${splatSVG(17, pc, 'wc-splat')}</div>
      <div class="wc-main">
        <div class="wc-icon"></div>
        <div class="wc-info"><div class="wc-name">BLASTER</div><div class="wc-desc"></div></div>
      </div>
      <div class="wc-slots"></div>
      <div class="wc-ink">
        <div class="wc-tank"><div class="wc-liquid"><i></i></div><div class="wc-glass"></div></div>
        <div class="wc-ink-txt"><span class="wc-pct">100%</span><span class="wc-hint">PINTURA</span></div>
      </div>`
    );
    r.appendChild(this.weapon);
    this.wcIcon = this.weapon.querySelector('.wc-icon');
    this.wcName = this.weapon.querySelector('.wc-name');
    this.wcDesc = this.weapon.querySelector('.wc-desc');
    this.wcSlots = this.weapon.querySelector('.wc-slots');
    this.wcLiquid = this.weapon.querySelector('.wc-liquid');
    this.wcPct = this.weapon.querySelector('.wc-pct');
    this.wcHint = this.weapon.querySelector('.wc-hint');

    // retícula
    this.reticle = el(
      'div',
      'reticle',
      `<svg viewBox="-60 -60 120 120" width="120" height="120">
        <circle class="ret-ring-bg" r="27"/>
        <circle class="ret-ring" r="27" transform="rotate(-90)"/>
        <path class="ret-ink-bg" d="M 34 20 A 40 40 0 0 0 34 -20" pathLength="100"/>
        <path class="ret-ink" d="M 34 20 A 40 40 0 0 0 34 -20" pathLength="100"/>
        <g class="ret-ticks">
          <rect class="tk" x="-2.6" y="-8" width="5.2" height="12" rx="2.6"/>
          <rect class="tk" x="-2.6" y="-8" width="5.2" height="12" rx="2.6"/>
          <rect class="tk" x="-2.6" y="-8" width="5.2" height="12" rx="2.6"/>
          <rect class="tk" x="-2.6" y="-8" width="5.2" height="12" rx="2.6"/>
        </g>
        <circle class="ret-dot" r="3.2"/>
        <g class="ret-hit">
          <path d="M-14 -14 L-7 -7 M14 -14 L7 -7 M-14 14 L-7 7 M14 14 L7 7"/>
        </g>
      </svg>`
    );
    r.appendChild(this.reticle);
    this.ticks = [...this.reticle.querySelectorAll('.tk')];
    this.retRing = this.reticle.querySelector('.ret-ring');
    this.retRingBg = this.reticle.querySelector('.ret-ring-bg');
    this.retInk = this.reticle.querySelector('.ret-ink');
    this.retHit = this.reticle.querySelector('.ret-hit');
    this.ringLen = 2 * Math.PI * 27;
    this.retRing.style.strokeDasharray = `${this.ringLen}`;

    // indicadores de daño direccional
    this.dirLayer = el('div', 'hud-dirs');
    r.appendChild(this.dirLayer);
    for (let i = 0; i < 5; i++) {
      const d = el('div', 'dmg-dir', '<i></i>');
      this.dirLayer.appendChild(d);
      this.dirs.push({ el: d, t: 0, ax: 0, az: 0 });
    }

    // feed, avisos, racha
    this.feed = el('div', 'hud-feed');
    r.appendChild(this.feed);
    this.notice = el('div', 'hud-notice');
    r.appendChild(this.notice);
    this.streak = el('div', 'hud-streak');
    r.appendChild(this.streak);
    this.toast = el('div', 'hud-toast');
    r.appendChild(this.toast);

    // tarjeta de introducción
    this.intro = el(
      'div',
      'hud-intro',
      `<div class="intro-card">
        ${splatSVG(5, pc, 'intro-splat a')}${splatSVG(9, bc, 'intro-splat b')}
        <div class="intro-kicker">TERRITORIO · 3 VS 3</div>
        <div class="intro-title">PUERTO CROMA</div>
        <div class="intro-sub">Pinta más suelo que el equipo rival en 3 minutos</div>
      </div>`
    );
    r.appendChild(this.intro);

    // pantalla de eliminado
    this.death = el(
      'div',
      'hud-death',
      `<div class="death-card">
        <div class="death-skull">${SKULL_ICON}</div>
        <div class="death-title">HAS SIDO ELIMINADO</div>
        <div class="death-by"></div>
        <div class="death-count"><svg viewBox="0 0 60 60"><circle class="dc-bg" cx="30" cy="30" r="25"/><circle class="dc-ring" cx="30" cy="30" r="25" transform="rotate(-90 30 30)"/></svg><span>5</span></div>
        <div class="death-hint">Reapareces en tu base</div>
      </div>`
    );
    r.appendChild(this.death);
    this.deathBy = this.death.querySelector('.death-by');
    this.deathNum = this.death.querySelector('.death-count span');
    this.deathRing = this.death.querySelector('.dc-ring');
    this.deathRing.style.strokeDasharray = `${2 * Math.PI * 25}`;

    // aviso de ratón y estadísticas
    this.lockHint = el('div', 'hud-lock', '<span>HAZ CLIC PARA CAPTURAR EL RATÓN</span>');
    r.appendChild(this.lockHint);
    this.tip = el('div', 'hud-tip', '<kbd>SHIFT</kbd> sobre tu pintura para <b>SURFEAR</b> · <kbd>R</kbd> recarga · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> armas');
    r.appendChild(this.tip);
    this.stats = el('div', 'hud-stats');
    r.appendChild(this.stats);
  }

  bind() {
    const g = this.game;
    bus.on('damage', (e) => {
      if (e.attacker === g.player && e.victim !== g.player) {
        this.hitmarker(e.lethal ? 2 : e.crit ? 1 : 0);
        this.spawnNumber(e.x, e.y, e.z, e.amount, e.crit, e.lethal);
        this.tagHit(e.victim);
      }
      if (e.victim === g.player) {
        this.dmgFlash = Math.min(1, this.dmgFlash + 0.35 + e.amount / 90);
        if (e.attacker) this.damageDir(e.attacker.position.x, e.attacker.position.z);
        this.bump(this.hp);
      } else {
        this.tagHit(e.victim);
      }
    });
    bus.on('paintHurt', (e) => {
      if (e.victim === g.player) this.dmgFlash = Math.min(0.5, this.dmgFlash + 0.06);
    });
    bus.on('kill', (e) => {
      this.feedEntry(e);
      if (e.killer === g.player && e.victim !== g.player) this.showToast(`ELIMINASTE A <b>${e.victim.name}</b>`, COLORS.team[e.victim.team].css);
    });
    bus.on('streak', ({ character, streak }) => {
      if (character !== g.player || streak < 2) return;
      this.showStreak(STREAKS[Math.min(5, streak)]);
    });
    bus.on('weapon:switch', ({ character }) => {
      if (character === g.player) this.bump(this.weapon);
    });
    bus.on('weapon:dry', ({ character }) => {
      if (character === g.player) this.bump(this.weapon.querySelector('.wc-ink'), 'shake');
    });
    bus.on('match:countdown', ({ step, label }) => this.showNotice(label, step === 0 ? 'ready' : 'count'));
    bus.on('match:start', () => {
      this.showNotice('¡A PINTAR!', 'go');
      this.tip.classList.add('show');
      setTimeout(() => this.tip.classList.remove('show'), 6500);
    });
    bus.on('match:lastMinute', () => {
      this.showNotice('¡ÚLTIMO MINUTO!', 'warn');
      this.timerEl.classList.add('last');
    });
    bus.on('match:final', ({ seconds }) => {
      this.timerEl.classList.add('final');
      if (seconds <= 5) this.showNotice(String(seconds), 'final');
    });
    bus.on('match:end', () => {
      this.showNotice('¡FIN DE LA PARTIDA!', 'end');
      this.root.classList.add('ended');
    });
    bus.on('input:key', (code) => {
      if (code === 'F3') this.statsVisible = !this.statsVisible;
    });
  }

  /** Estado visual del HUD según la fase. */
  setMode(mode) {
    this.mode = mode;
    const r = this.root;
    r.classList.toggle('hidden', mode === 'hidden');
    r.classList.toggle('intro', mode === 'intro');
    r.classList.toggle('ended', mode === 'end');
    this.intro.classList.toggle('show', mode === 'intro');
  }

  /** Limpia el HUD para una partida nueva. */
  reset() {
    this.feed.innerHTML = '';
    this.timerEl.classList.remove('last', 'final');
    this.root.classList.remove('ended');
    this.dmgFlash = 0;
    this.cache = {};
    for (const n of this.damageNumbers) {
      n.on = false;
      n.el.style.opacity = '0';
    }
    for (const d of this.dirs) {
      d.t = 0;
      d.el.style.opacity = '0';
    }
    this.notice.className = 'hud-notice';
    this.streak.className = 'hud-streak';
    this.death.classList.remove('show');
    this.buildTags();
  }

  buildTags() {
    const g = this.game;
    this.tagLayer.innerHTML = '';
    this.tags.clear();
    for (const c of g.characters) {
      if (c === g.player) continue;
      const t = el('div', `tag t${c.team}`, `<span class="tag-name">${c.name}</span><i class="tag-hp"><b></b></i>`);
      t.style.display = 'none';
      this.tagLayer.appendChild(t);
      this.tags.set(c, { el: t, hp: t.querySelector('.tag-hp'), bar: t.querySelector('.tag-hp b'), hitT: 0, vis: false, losT: 0, los: true, lastHp: -1, op: -1 });
    }
  }

  // ── eventos puntuales ─────────────────────────────────────

  bump(node, cls = 'bump') {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  hitmarker(kind) {
    const h = this.retHit;
    h.classList.remove('k0', 'k1', 'k2');
    void h.getBoundingClientRect();
    h.classList.add('k' + kind);
    this.bump(h, 'on');
  }

  spawnNumber(x, y, z, amount, crit, lethal) {
    let n = this.damageNumbers.find((d) => !d.on);
    if (!n) n = this.damageNumbers.reduce((a, b) => (a.t > b.t ? a : b));
    n.on = true;
    n.t = 0;
    n.x = x;
    n.y = y + 0.4;
    n.z = z;
    n.dx = (Math.random() - 0.5) * 50;
    n.el.textContent = String(amount);
    n.el.className = 'dmg-num' + (lethal ? ' lethal' : crit ? ' crit' : '');
  }

  tagHit(ch) {
    const t = this.tags.get(ch);
    if (t) t.hitT = 3;
  }

  damageDir(ax, az) {
    let d = this.dirs.find((x) => x.t <= 0);
    if (!d) d = this.dirs.reduce((a, b) => (a.t < b.t ? a : b));
    d.t = 1.1;
    d.ax = ax;
    d.az = az;
  }

  feedEntry(e) {
    const g = this.game;
    const row = el('div', 'feed-row');
    const k = e.killer;
    const v = e.victim;
    const kc = k ? COLORS.team[k.team].css : '#fff3e0';
    const vc = COLORS.team[v.team].css;
    const icon = e.cause === 'water' ? WEAPON_ICONS.water : WEAPON_ICONS[e.weapon] || WEAPON_ICONS.blaster;
    const me = k === g.player || v === g.player;
    if (me) row.classList.add('me');
    row.innerHTML = `${k && k !== v ? `<span class="fn" style="--c:${kc}">${k.name}</span>` : ''}<span class="fi" style="color:${kc}">${icon}</span><span class="fn" style="--c:${vc}">${v.name}</span>`;
    this.feed.prepend(row);
    while (this.feed.children.length > 5) this.feed.lastChild.remove();
    setTimeout(() => row.classList.add('out'), 5200);
    setTimeout(() => row.remove(), 5700);
  }

  showNotice(text, kind) {
    const n = this.notice;
    n.textContent = text;
    n.className = 'hud-notice';
    void n.offsetWidth;
    n.className = `hud-notice show ${kind}`;
  }

  showStreak(text) {
    const s = this.streak;
    s.textContent = text;
    s.className = 'hud-streak';
    void s.offsetWidth;
    s.className = 'hud-streak show';
  }

  showToast(html, color) {
    const t = this.toast;
    t.innerHTML = html;
    t.style.setProperty('--c', color);
    t.className = 'hud-toast';
    void t.offsetWidth;
    t.className = 'hud-toast show';
  }

  setLockHint(v) {
    if (this.cache.lock === v) return;
    this.cache.lock = v;
    this.lockHint.classList.toggle('show', v);
  }

  // ── por fotograma ─────────────────────────────────────────

  update(rdt) {
    if (this.mode === 'hidden') return;
    const g = this.game;
    const c = this.cache;
    const p = g.player;
    const ws = p.weapons;
    const W = window.innerWidth;
    const H = window.innerHeight;

    // temporizador
    const secs = Math.ceil(g.match.remaining);
    if (c.secs !== secs) {
      c.secs = secs;
      this.timerT.textContent = fmtTime(g.match.remaining);
    }

    // territorio
    if (c.terrV !== g.territory.version) {
      c.terrV = g.territory.version;
      const o = g.territory.orange;
      const b = g.territory.blue;
      this.terrO.style.width = `${(o * 100).toFixed(1)}%`;
      this.terrB.style.width = `${(b * 100).toFixed(1)}%`;
      this.terrPO.textContent = `${Math.round(o * 100)}%`;
      this.terrPB.textContent = `${Math.round(b * 100)}%`;
      this.top.classList.toggle('lead-o', o > b + 0.005);
      this.top.classList.toggle('lead-b', b > o + 0.005);
    }

    // vida
    const hp = Math.round(p.hp);
    if (c.hp !== hp) {
      c.hp = hp;
      this.hpFill.style.transform = `scaleX(${clamp(hp / p.maxHp, 0, 1)})`;
      this.hpNum.textContent = String(hp);
      this.hp.classList.toggle('low', hp < 35 && hp > 0);
    }
    this.ghostHp = this.ghostHp === undefined ? hp : this.ghostHp + (hp - this.ghostHp) * (hp > this.ghostHp ? 1 : 1 - Math.exp(-rdt * 3));
    const gh = Math.round(this.ghostHp);
    if (c.gh !== gh) {
      c.gh = gh;
      this.hpGhost.style.transform = `scaleX(${clamp(gh / p.maxHp, 0, 1)})`;
    }

    // arma y depósito
    const wid = ws.weaponId;
    if (c.wid !== wid) {
      c.wid = wid;
      this.wcIcon.innerHTML = WEAPON_ICONS[wid];
      this.wcName.textContent = WEAPONS[wid].name;
      this.wcDesc.textContent = WEAPONS[wid].description;
      this.wcSlots.innerHTML = ws.weapons
        .map((w, i) => `<div class="slot${w.id === wid ? ' on' : ''}"><kbd>${i + 1}</kbd>${WEAPON_ICONS[w.id]}</div>`)
        .join('');
    }
    const ink = Math.round(ws.ink);
    if (c.ink !== ink) {
      c.ink = ink;
      this.wcLiquid.style.transform = `translateY(${(100 - ink).toFixed(0)}%)`;
      this.wcPct.textContent = `${ink}%`;
      this.weapon.classList.toggle('low', ink < 20);
    }
    const hint = ws.reloadT >= 0 ? 'RECARGANDO…' : p.motor.surfing ? '¡SURF! +RECARGA' : ink < 20 ? 'PULSA R' : 'PINTURA';
    if (c.hint !== hint) {
      c.hint = hint;
      this.wcHint.textContent = hint;
    }

    // retícula: separación según dispersión real y FOV
    const fovY = (g.camera.fov * Math.PI) / 180;
    const spreadPx = (Math.tan((ws.spreadNow * Math.PI) / 180) / Math.tan(fovY / 2)) * (H / 2);
    const gap = clamp(8 + spreadPx * 0.9, 8, 60);
    if (Math.abs((c.gap || 0) - gap) > 0.3) {
      c.gap = gap;
      const s = gap;
      this.ticks[0].setAttribute('transform', `translate(0 ${-s})`);
      this.ticks[1].setAttribute('transform', `translate(0 ${s}) rotate(180)`);
      this.ticks[2].setAttribute('transform', `translate(${-s} 0) rotate(-90)`);
      this.ticks[3].setAttribute('transform', `translate(${s} 0) rotate(90)`);
    }
    const onTarget = !!g.aimTarget;
    const retState = !p.alive ? 'dead' : p.motor.surfing ? 'surf' : onTarget ? 'target' : '';
    if (c.ret !== retState) {
      c.ret = retState;
      this.reticle.className = 'reticle ' + retState;
    }
    const reload = ws.reloadT >= 0 ? clamp(ws.reloadT, 0, 1) : -1;
    const rk = reload < 0 ? -1 : Math.round(reload * 60);
    if (c.reload !== rk) {
      c.reload = rk;
      this.reticle.classList.toggle('reloading', reload >= 0);
      this.retRing.style.strokeDashoffset = `${this.ringLen * (1 - Math.max(0, reload))}`;
    }
    const inkK = Math.round(ws.ink);
    if (c.retInk !== inkK) {
      c.retInk = inkK;
      // arco a la derecha de la retícula (pathLength = 100)
      this.retInk.style.strokeDashoffset = `${100 - inkK}`;
      this.reticle.classList.toggle('inklow', inkK < 20);
      this.reticle.classList.toggle('inkfull', inkK >= 100);
    }

    // viñeta de daño / pintura enemiga
    this.dmgFlash = Math.max(0, this.dmgFlash - rdt * 1.6);
    const onEnemy = p.alive && p.motor.paint === -1 ? 0.28 + Math.sin(performance.now() * 0.008) * 0.06 : 0;
    const lowHp = p.alive && p.hp < 35 ? 0.2 + Math.sin(performance.now() * 0.006) * 0.08 : 0;
    const vig = clamp(Math.max(this.dmgFlash, onEnemy, lowHp), 0, 1);
    const vk = Math.round(vig * 100);
    if (c.vig !== vk) {
      c.vig = vk;
      this.vignette.style.opacity = (vk / 100).toFixed(2);
    }
    if (c.vigTeam !== p.team) {
      c.vigTeam = p.team;
      this.vignette.style.setProperty('--c', COLORS.team[1 - p.team].css);
    }

    // eliminado
    const dead = !p.alive && g.match.playing;
    if (c.dead !== dead) {
      c.dead = dead;
      this.death.classList.toggle('show', dead);
      if (dead) {
        const k = p.lastAttacker && !p.lastAttacker.isPlayer ? p.lastAttacker : null;
        this.deathBy.innerHTML = k ? `por <b style="color:${COLORS.team[k.team].css}">${k.name}</b>` : p.isInWater() ? 'Te has caído al agua' : '';
      }
    }
    if (dead) {
      const left = g.respawn.timeLeft(p);
      const n = Math.max(0, Math.ceil(left));
      if (c.deathN !== n) {
        c.deathN = n;
        this.deathNum.textContent = n > 0 ? String(n) : '¡YA!';
      }
      this.deathRing.style.strokeDashoffset = `${2 * Math.PI * 25 * (1 - clamp(left / 5, 0, 1))}`;
    }

    this.updateNumbers(rdt, W, H);
    this.updateDirs(rdt);
    this.updateTags(rdt, W, H);
    this.updateStats(rdt);
  }

  project(x, y, z, W, H, out) {
    _v.set(x, y, z).project(this.game.camera);
    out.x = (_v.x * 0.5 + 0.5) * W;
    out.y = (-_v.y * 0.5 + 0.5) * H;
    out.behind = _v.z > 1;
    return out;
  }

  updateNumbers(rdt, W, H) {
    const o = this._p || (this._p = {});
    for (const n of this.damageNumbers) {
      if (!n.on) continue;
      n.t += rdt;
      const k = n.t / 0.9;
      if (k >= 1) {
        n.on = false;
        n.el.style.opacity = '0';
        continue;
      }
      this.project(n.x, n.y + k * 0.9, n.z, W, H, o);
      if (o.behind) {
        n.el.style.opacity = '0';
        continue;
      }
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.7 : 1.3 - Math.min(0.3, (k - 0.15) * 1.2);
      n.el.style.transform = `translate(${(o.x + n.dx * k).toFixed(1)}px, ${o.y.toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
      n.el.style.opacity = (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3).toFixed(2);
    }
  }

  updateDirs(rdt) {
    const g = this.game;
    const p = g.player.position;
    const yaw = g.cameraCtrl.yaw;
    for (const d of this.dirs) {
      if (d.t <= 0) continue;
      d.t -= rdt;
      const a = Math.atan2(d.ax - p.x, d.az - p.z) - yaw;
      d.el.style.transform = `rotate(${(-a * 180) / Math.PI}deg)`;
      d.el.style.opacity = clamp(d.t / 0.6, 0, 1).toFixed(2);
    }
  }

  updateTags(rdt, W, H) {
    const g = this.game;
    const cam = g.camera.position;
    const o = this._t || (this._t = {});
    for (const [ch, t] of this.tags) {
      let show = ch.alive && ch.visible && ch.active !== false && this.mode === 'play';
      let dist = 0;
      if (show) {
        const pp = ch.position;
        dist = Math.hypot(pp.x - cam.x, pp.y - cam.y, pp.z - cam.z);
        if (dist > 48) show = false;
      }
      if (show) {
        // línea de visión a 5 Hz (los rivales ocultos no muestran etiqueta)
        t.losT -= rdt;
        if (t.losT <= 0) {
          t.losT = 0.2;
          const pp = ch.position;
          t.los = g.collision.lineOfSight(cam.x, cam.y, cam.z, pp.x, pp.y + 1.5, pp.z);
        }
        if (!t.los && ch.team !== g.player.team) show = false;
      }
      if (show) {
        const pp = ch.position;
        this.project(pp.x, ch.object.position.y + 1.95, pp.z, W, H, o);
        if (o.behind) show = false;
      }
      if (t.vis !== show) {
        t.vis = show;
        t.el.style.display = show ? '' : 'none';
      }
      if (!show) continue;
      const s = clamp(1.25 - dist / 45, 0.55, 1);
      t.el.style.transform = `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(2)})`;
      const op = ch.team === g.player.team && !t.los ? 0.55 : 1;
      if (t.op !== op) {
        t.op = op;
        t.el.style.opacity = String(op);
      }
      t.hitT -= rdt;
      const hp = Math.round(ch.hp);
      const showHp = t.hitT > 0 || hp < ch.maxHp * 0.99;
      if (t.lastHp !== hp || t.showHp !== showHp) {
        t.lastHp = hp;
        t.showHp = showHp;
        t.hp.style.display = showHp ? '' : 'none';
        t.bar.style.transform = `scaleX(${clamp(hp / ch.maxHp, 0, 1)})`;
      }
    }
  }

  updateStats(rdt) {
    const g = this.game;
    if (this.cache.statsOn !== this.statsVisible) {
      this.cache.statsOn = this.statsVisible;
      this.stats.classList.toggle('show', this.statsVisible);
    }
    if (!this.statsVisible) return;
    this.statsT = (this.statsT || 0) - rdt;
    if (this.statsT > 0) return;
    this.statsT = 0.25;
    const info = g.renderer.renderer.info;
    const t = g.time;
    const bots = g.ai && g.ai.bots.length ? g.ai.bots.map((b) => `${b.c.name.padEnd(12)} ${b.state}`).join('\n') : '';
    this.stats.textContent =
      `FPS ${t.fps.toFixed(0)}  (${t.frameMs.toFixed(1)} ms)\n` +
      `llamadas ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n` +
      `gráficos ${g.settings.graphics.toUpperCase()}  escala ${g.renderer.renderScale.toFixed(2)}\n` +
      `GPU ${g.gpu ? g.gpu.name.slice(0, 48) : "?"}\n` +
      `territorio N ${(g.territory.orange * 100).toFixed(1)}%  A ${(g.territory.blue * 100).toFixed(1)}%\n` +
      (bots ? `\n${bots}` : '');
  }
}

export { TEAM_NAME, fmtTime };
