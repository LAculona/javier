import { bus } from '../core/EventBus.js';
import { COLORS } from '../config.js';
import { splatSVG, WEAPON_ICONS } from './Icons.js';

// ─────────────────────────────────────────────────────────────
//  Menus · pantallas con forma de salpicadura
//  Principal (sobre la escena 3D), controles, opciones, pausa (con fondo
//  desenfocado) y resultados (barra con suspense, ganador con confeti,
//  tabla con MVP). Todo con tipografías Bungee + Rubik, bordes gruesos,
//  sombras duras e inclinación ligera; entradas con rebote.
// ─────────────────────────────────────────────────────────────

const PC = COLORS.team[0].css;
const BC = COLORS.team[1].css;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const btn = (act, label, color, i, extra = '') =>
  `<button class="btn ${color} ${extra}" data-act="${act}" style="--i:${i}"><span class="btn-drip"></span><span class="btn-label">${label}</span></button>`;

const CONTROLS = [
  [['W', 'A', 'S', 'D'], 'Moverse'],
  [['RATÓN'], 'Apuntar / mirar'],
  [['CLIC IZQ.'], 'Disparar · rodar (Roller)'],
  [['CLIC DCHO.'], 'Apuntar con precisión'],
  [['ESPACIO'], 'Saltar'],
  [['SHIFT'], 'Correr · SURF sobre tu pintura'],
  [['R'], 'Recargar'],
  [['1', '2', '3'], 'Cambiar de arma (o rueda)'],
  [['F'], 'Golpe cuerpo a cuerpo'],
  [['ESC'], 'Pausa'],
  [['F3'], 'Estadísticas de rendimiento']
];

export class Menus {
  constructor(root, game, gm) {
    this.game = game;
    this.gm = gm;
    this.root = el('div', 'menus');
    root.appendChild(this.root);
    this.screens = {};
    this.stack = [];
    this.current = null;
    this.resultT = -1;
    this.build();
  }

  build() {
    this.screens.main = this.makeMain();
    this.screens.controls = this.makeControls();
    this.screens.options = this.makeOptions();
    this.screens.pause = this.makePause();
    this.screens.results = this.makeResults();
    for (const k in this.screens) this.root.appendChild(this.screens[k]);
    // sonidos de interfaz y acciones
    this.root.addEventListener('pointerover', (e) => {
      const b = e.target.closest('.btn, .seg button, .toggle');
      if (b && b !== this._hover) {
        this._hover = b;
        bus.emit('ui:hover');
      }
    });
    this.root.addEventListener('pointerout', (e) => {
      if (this._hover && !this._hover.contains(e.relatedTarget)) this._hover = null;
    });
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      bus.emit('ui:click');
      this.action(b.dataset.act, b);
    });
  }

  action(act) {
    const gm = this.gm;
    switch (act) {
      case 'play':
        gm.play();
        break;
      case 'controls':
        this.push('controls');
        break;
      case 'options':
        this.push('options');
        break;
      case 'back':
        this.pop();
        break;
      case 'resume':
        gm.resume();
        break;
      case 'restart':
        gm.restart();
        break;
      case 'menu':
        gm.toMenu();
        break;
      case 'again':
        gm.restart();
        break;
      default:
        break;
    }
  }

  // ── navegación ────────────────────────────────────────────

  show(name) {
    this.stack = name ? [name] : [];
    this.render();
  }

  push(name) {
    this.stack.push(name);
    this.render();
  }

  pop() {
    this.stack.pop();
    this.render();
  }

  render() {
    const top = this.stack[this.stack.length - 1] || null;
    this.current = top;
    for (const k in this.screens) {
      const s = this.screens[k];
      const on = k === top;
      if (on && !s.classList.contains('show')) {
        s.classList.remove('show');
        void s.offsetWidth;
        s.classList.add('show');
        if (k === 'options') this.syncOptions();
      } else if (!on) s.classList.remove('show');
    }
    this.root.classList.toggle('active', !!top);
    this.root.classList.toggle('dim', top !== null && top !== 'main' && top !== 'results');
    this.root.classList.toggle('blur', this.stack[0] === 'pause');
  }

  // ── pantallas ─────────────────────────────────────────────

  makeMain() {
    const s = el(
      'div',
      'screen main-menu',
      `<div class="main-col">
        <div class="logo-wrap">
          ${splatSVG(21, PC, 'logo-splat a')}${splatSVG(34, BC, 'logo-splat b')}
          <h1 class="logo"><span class="o">INK</span><span class="b">RUSH</span></h1>
        </div>
        <div class="tagline">PINTA · SURFEA · CONQUISTA EL PUERTO</div>
        <nav class="menu-buttons">
          ${btn('play', 'JUGAR', 'orange', 0, 'big')}
          ${btn('controls', 'CONTROLES', 'blue', 1)}
          ${btn('options', 'OPCIONES', 'cream', 2)}
        </nav>
        <div class="menu-foot"><span class="chip">3 VS 3</span><span class="chip">PUERTO CROMA</span><span class="chip">3:00</span></div>
      </div>
      <div class="dripper-card">
        <div class="dc-name">TÚ</div>
        <div class="dc-team"><i style="background:${PC}"></i>EQUIPO NARANJA</div>
        <div class="dc-weapons">${WEAPON_ICONS.blaster}${WEAPON_ICONS.roller}${WEAPON_ICONS.splasher}</div>
      </div>
      <div class="menu-hint">Al pulsar JUGAR el ratón queda capturado · <kbd>ESC</kbd> para pausar</div>
      <div class="gpu-warn">SIN ACELERACIÓN GRÁFICA · activa «Usar aceleración por hardware» en tu navegador</div>`
    );
    const gpu = this.game.gpu;
    if (gpu && gpu.software) s.classList.add('software');
    return s;
  }

  makeControls() {
    const rows = CONTROLS.map(
      ([keys, label], i) => `<div class="ctl-row" style="--i:${i}"><div class="keys">${keys.map((k) => `<kbd>${k}</kbd>`).join('')}</div><div class="ctl-label">${label}</div></div>`
    ).join('');
    return el(
      'div',
      'screen panel-screen',
      `<div class="panel tilt-l">
        ${splatSVG(44, BC, 'panel-splat')}
        <h2 class="panel-title">CONTROLES</h2>
        <div class="ctl-grid">${rows}</div>
        <div class="panel-tip">Tu pintura te acelera y recarga; la enemiga te frena y te hace daño.</div>
        <div class="panel-actions">${btn('back', 'VOLVER', 'cream', 0)}</div>
      </div>`
    );
  }

  makeOptions() {
    const slider = (key, label, min, max, step, fmt) =>
      `<label class="opt" data-key="${key}"><span class="opt-label">${label}</span><span class="opt-ctl"><input type="range" min="${min}" max="${max}" step="${step}" data-key="${key}" data-fmt="${fmt}"/><output></output></span></label>`;
    const s = el(
      'div',
      'screen panel-screen',
      `<div class="panel tilt-r">
        ${splatSVG(52, PC, 'panel-splat')}
        <h2 class="panel-title">OPCIONES</h2>
        <div class="opt-group">
          <div class="opt-head">SONIDO</div>
          ${slider('masterVolume', 'Volumen general', 0, 1, 0.01, 'pct')}
          ${slider('musicVolume', 'Música', 0, 1, 0.01, 'pct')}
          ${slider('sfxVolume', 'Efectos', 0, 1, 0.01, 'pct')}
        </div>
        <div class="opt-group">
          <div class="opt-head">CONTROL</div>
          ${slider('sensitivity', 'Sensibilidad', 0.3, 2.5, 0.05, 'x')}
          <div class="opt"><span class="opt-label">Invertir eje Y</span><span class="opt-ctl"><button class="toggle" data-toggle="invertY"><span>NO</span></button></span></div>
          ${slider('fov', 'Campo de visión', 60, 95, 1, 'deg')}
        </div>
        <div class="opt-group">
          <div class="opt-head">GRÁFICOS</div>
          <div class="opt"><span class="opt-label">Calidad</span><span class="opt-ctl seg" data-seg="graphics">
            <button data-v="minimal">MÍNIMA</button><button data-v="low">BAJA</button><button data-v="medium">MEDIA</button><button data-v="high">ALTA</button>
          </span></div>
          <div class="opt-gpu"></div>
        </div>
        <div class="panel-actions">${btn('back', 'VOLVER', 'cream', 0)}</div>
      </div>`
    );
    for (const input of s.querySelectorAll('input[type=range]')) {
      input.addEventListener('input', () => {
        const key = input.dataset.key;
        this.gm.setSetting(key, parseFloat(input.value));
        this.syncOptions();
      });
    }
    s.querySelector('[data-toggle=invertY]').addEventListener('click', () => {
      bus.emit('ui:click');
      this.gm.setSetting('invertY', !this.gm.settings.invertY);
      this.syncOptions();
    });
    for (const b of s.querySelectorAll('[data-seg=graphics] button')) {
      b.addEventListener('click', () => {
        bus.emit('ui:click');
        this.gm.setSetting('graphics', b.dataset.v);
        this.syncOptions();
      });
    }
    return s;
  }

  syncOptions() {
    const st = this.gm.settings;
    const s = this.screens.options;
    for (const input of s.querySelectorAll('input[type=range]')) {
      const key = input.dataset.key;
      const v = st[key];
      if (parseFloat(input.value) !== v) input.value = v;
      const fmt = input.dataset.fmt;
      const out = input.parentElement.querySelector('output');
      out.textContent = fmt === 'pct' ? `${Math.round(v * 100)}%` : fmt === 'deg' ? `${Math.round(v)}°` : `${v.toFixed(2)}×`;
      const k = (v - parseFloat(input.min)) / (parseFloat(input.max) - parseFloat(input.min));
      input.style.setProperty('--k', `${(k * 100).toFixed(1)}%`);
    }
    const t = s.querySelector('[data-toggle=invertY]');
    t.classList.toggle('on', !!st.invertY);
    t.querySelector('span').textContent = st.invertY ? 'SÍ' : 'NO';
    for (const b of s.querySelectorAll('[data-seg=graphics] button')) b.classList.toggle('on', b.dataset.v === st.graphics);
    const gpu = this.game.gpu;
    const info = s.querySelector('.opt-gpu');
    if (gpu && info) {
      info.textContent = gpu.software
        ? 'Tu navegador no está usando la tarjeta gráfica: activa la aceleración por hardware para jugar fluido.'
        : `Tarjeta gráfica: ${gpu.name || 'desconocida'}`;
      info.classList.toggle('warn', gpu.software);
    }
  }

  makePause() {
    return el(
      'div',
      'screen panel-screen pause',
      `<div class="panel narrow tilt-l">
        ${splatSVG(63, PC, 'panel-splat')}
        <h2 class="panel-title">PAUSA</h2>
        <nav class="menu-buttons">
          ${btn('resume', 'CONTINUAR', 'orange', 0)}
          ${btn('restart', 'REINICIAR', 'blue', 1)}
          ${btn('controls', 'CONTROLES', 'cream', 2)}
          ${btn('options', 'OPCIONES', 'cream', 3)}
          ${btn('menu', 'SALIR AL MENÚ', 'ink', 4)}
        </nav>
      </div>`
    );
  }

  makeResults() {
    const s = el(
      'div',
      'screen results',
      `<div class="res-top">
        <div class="res-kicker">RESULTADO · TERRITORIO</div>
        <div class="res-bar">
          <div class="res-fill o"><span class="res-pct">0.0%</span></div>
          <div class="res-fill b"><span class="res-pct">0.0%</span></div>
        </div>
        <div class="res-winner"><div class="res-win-title"></div><div class="res-win-sub"></div></div>
      </div>
      <div class="res-confetti"></div>
      <div class="res-panel panel">
        <table class="res-table">
          <thead><tr><th>JUGADOR</th><th>BAJAS</th><th>CAÍDAS</th><th>M² PINTADOS</th><th>PUNTOS</th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="panel-actions">${btn('again', 'JUGAR DE NUEVO', 'orange', 0)}${btn('menu', 'MENÚ', 'cream', 1)}</div>
      </div>`
    );
    this.resFillO = s.querySelector('.res-fill.o');
    this.resFillB = s.querySelector('.res-fill.b');
    this.resPctO = this.resFillO.querySelector('.res-pct');
    this.resPctB = this.resFillB.querySelector('.res-pct');
    this.resWinner = s.querySelector('.res-winner');
    this.resTitle = s.querySelector('.res-win-title');
    this.resSub = s.querySelector('.res-win-sub');
    this.resBody = s.querySelector('tbody');
    this.resConfetti = s.querySelector('.res-confetti');
    this.resFillO.style.background = PC;
    this.resFillB.style.background = BC;
    return s;
  }

  /** Arranca la secuencia de resultados (barra → ganador → tabla). */
  showResults(r) {
    this.result = r;
    this.resultT = 0;
    this.revealed = false;
    this.tableShown = false;
    const s = this.screens.results;
    s.classList.remove('revealed', 'table', 'win', 'lose', 'draw');
    this.resFillO.style.width = '0%';
    this.resFillB.style.width = '0%';
    this.resPctO.textContent = '0.0%';
    this.resPctB.textContent = '0.0%';
    this.resConfetti.innerHTML = '';
    this.resBody.innerHTML = r.rows
      .map((row, i) => {
        const c = COLORS.team[row.team].css;
        return `<tr class="${row.ch === this.game.player ? 'me' : ''}" style="--i:${i}">
          <td><span class="res-name" style="--c:${c}">${row.name}</span>${row.mvp ? '<span class="mvp">MVP</span>' : ''}</td>
          <td>${row.kills}</td><td>${row.deaths}</td><td>${row.painted}</td><td class="pts">${row.score}</td></tr>`;
      })
      .join('');
    this.show('results');
  }

  update(rdt) {
    if (this.current !== 'results' || this.resultT < 0) return;
    const r = this.result;
    this.resultT += rdt;
    const t = this.resultT;
    // suspense: ambas barras crecen juntas, se frenan y la ventaja aparece al final
    const fill = Math.min(1, t / 3.2);
    const e = 1 - Math.pow(1 - fill, 3);
    const common = Math.min(r.orange, r.blue);
    const phase1 = Math.min(1, e / 0.7);
    const phase2 = Math.max(0, (e - 0.7) / 0.3);
    const wob = t < 3.2 ? Math.sin(t * 9) * 0.004 * (1 - fill) : 0;
    const o = common * phase1 + (r.orange - common) * phase2 + wob;
    const b = common * phase1 + (r.blue - common) * phase2 - wob;
    this.resFillO.style.width = `${Math.max(0, o * 100).toFixed(2)}%`;
    this.resFillB.style.width = `${Math.max(0, b * 100).toFixed(2)}%`;
    this.resPctO.textContent = `${Math.max(0, o * 100).toFixed(1)}%`;
    this.resPctB.textContent = `${Math.max(0, b * 100).toFixed(1)}%`;
    if (!this.revealed && t > 3.5) {
      this.revealed = true;
      const s = this.screens.results;
      const pt = r.playerTeam;
      const cls = r.winner < 0 ? 'draw' : r.winner === pt ? 'win' : 'lose';
      this.resTitle.textContent = r.winner < 0 ? '¡EMPATE!' : r.winner === pt ? '¡VICTORIA!' : 'DERROTA';
      this.resSub.textContent = r.winner < 0 ? 'Nadie se lleva el puerto' : `GANA EL EQUIPO ${COLORS.team[r.winner].name}`;
      this.resWinner.style.setProperty('--c', r.winner < 0 ? '#fff3e0' : COLORS.team[r.winner].css);
      s.classList.add('revealed', cls);
      if (r.winner >= 0) this.confetti(COLORS.team[r.winner]);
      bus.emit('results:reveal', { win: r.winner === pt, draw: r.winner < 0 });
    }
    if (!this.tableShown && t > 4.6) {
      this.tableShown = true;
      this.screens.results.classList.add('table');
      bus.emit('results:table');
    }
  }

  confetti(team) {
    const cols = [team.css, team.cssAccent, '#fff3e0', '#f6d77a'];
    let html = '';
    for (let i = 0; i < 70; i++) {
      const c = cols[i % cols.length];
      const x = Math.random() * 100;
      const d = 1.8 + Math.random() * 2.2;
      const delay = Math.random() * 0.6;
      const s = 8 + Math.random() * 14;
      const r = Math.random() * 720 - 360;
      const drift = (Math.random() - 0.5) * 30;
      html += `<i style="left:${x.toFixed(1)}%;width:${s.toFixed(0)}px;height:${(s * (0.6 + Math.random() * 0.8)).toFixed(0)}px;background:${c};--d:${d.toFixed(2)}s;--delay:${delay.toFixed(2)}s;--r:${r.toFixed(0)}deg;--x:${drift.toFixed(0)}vw"></i>`;
    }
    this.resConfetti.innerHTML = html;
  }
}
