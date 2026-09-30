import { PLAYER } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  NavGraph · grafo de waypoints diseñado a mano sobre Puerto Croma
//  Los nodos se colocan a mano (mitad sur, reflejados al norte, más la
//  plaza central). Los enlaces se generan entre nodos cercanos y se
//  validan con una "prueba de paseo": sin agujeros, sin paredes, subidas
//  por rampa o escalón; los desniveles grandes crean aristas de salto
//  (hacia arriba, ≤ 1,5 m) o de caída (hacia abajo). A* con heurística
//  euclídea sobre aristas dirigidas.
// ─────────────────────────────────────────────────────────────

// [nombre, x, z, y?]  (mitad sur; y se calcula si no se indica)
const HALF = [
  // base elevada y sus rampas
  ['b_spawn', 0, -56, 2.4],
  ['b_w', -10, -55.5, 2.4],
  ['b_e', 10, -55.5, 2.4],
  ['b_front', 0, -50, 2.4],
  ['b_fw', -12.5, -49, 2.4],
  ['b_fe', 12.5, -49, 2.4],
  ['b_wr', -15.4, -55.5, 2.4],
  ['wr_mid', -20.5, -55.5, 1.2],
  ['wr_foot', -25.2, -55.5],
  ['b_er', 15.4, -55.5, 2.4],
  ['er_mid', 20.5, -55.5, 1.2],
  ['er_foot', 25.2, -55.5],
  ['fr_top', 0, -47.3, 2.4],
  ['fr_mid', 0, -43.5, 1.2],
  ['fr_foot', 0, -39],
  // zona de carga oeste
  ['wl_a', -31, -59],
  ['wl_b', -26, -52.5],
  ['wl_c', -24, -46.5],
  ['wl_d', -35, -51.8],
  ['wl_e', -35, -45],
  // patio de contenedores (carril oeste)
  ['wy_a', -20, -44],
  ['wy_b', -30, -44.5],
  ['wy_c', -35.5, -41],
  ['wy_d', -19.8, -38],
  ['wy_e', -29.5, -36.5],
  ['wy_f', -36, -32.5],
  ['wy_g', -19.8, -32.5],
  ['wy_gap1', -15.5, -32.5],
  ['wy_h', -29, -31.5],
  ['wy_i', -20, -26],
  ['wy_j', -27, -24],
  ['wy_k', -36, -23.5],
  ['wy_gap2', -15.5, -22.8],
  ['wy_l', -20.2, -20],
  ['wy_m', -33, -19],
  ['wy_n', -20.5, -12.5],
  ['wy_o', -28, -14],
  ['wy_p', -32, -5],
  ['wy_q', -38.5, -6],
  ['cargo_w', -30.1, -27.4, 1.3],
  ['cargo_e', -23.1, -20, 1.3],
  ['y3_top', -34, -27, 2.6],
  ['y3_end', -31.5, -26.5, 2.6],
  ['y4_end', -28.8, -20.7, 2.6],
  ['y4_top', -26, -20, 2.6],
  ['cw_s', -24, -6.5],
  // carril central
  ['c_a', 0, -35],
  ['c_b', -9.5, -36],
  ['c_c', 9.5, -36],
  ['c_d', 0, -32],
  ['c_e', -4.5, -29],
  ['c_f', 4.5, -29],
  ['c_g', 0, -25.5],
  ['c_h', -4, -21],
  ['c_i', 4, -21],
  ['c_j', 0, -19],
  ['c_k', -8.8, -18.5],
  ['c_l', 9.2, -19],
  ['c_m', 0, -14.8],
  ['c_n', -11, -11.5],
  ['c_o', 11, -11.5],
  ['c_w1', -11, -32.5],
  ['c_w2', -13.2, -19.5],
  ['c_e1', 13, -32],
  ['c_e2', 13, -22.5],
  ['crate_c', -0.75, -28.4, 1.3],
  // calle comercial (carril este)
  ['e_a', 20.5, -46],
  ['e_b', 29, -47],
  ['e_c', 34.5, -47.5],
  ['e_d', 32, -51],
  ['e_e', 19, -39],
  ['e_f', 28, -40],
  ['e_g', 33.5, -37],
  ['e_gap1', 17.8, -32],
  ['e_h', 28, -34.2],
  ['e_i', 28, -29],
  ['e_j', 21, -28.5],
  ['e_k', 34.3, -29],
  ['e_l', 28, -23],
  ['e_m', 19.5, -22.5],
  ['e_n', 22, -16],
  ['e_o', 31, -20.6],
  ['e_rt', 31, -13.6, 1.2],
  ['e_t1', 27.5, -10, 1.2],
  ['e_t2', 35, -10, 1.2],
  ['e_p', 22, -8],
  ['e_q', 34.5, -5]
];

// nodos únicos del centro (z ≈ 0)
const CENTER = [
  ['p_s', 0, -8.2, 1.2],
  ['p_n', 0, 8.2, 1.2],
  ['p_w', -8.2, 0, 1.2],
  ['p_e', 8.2, 0, 1.2],
  ['p_sw', -3.3, -3.3, 1.2],
  ['p_se', 3.3, -3.3, 1.2],
  ['p_nw', -3.3, 3.3, 1.2],
  ['p_ne', 3.3, 3.3, 1.2],
  ['p_rw', -14.8, 0],
  ['p_re', 14.8, 0],
  ['cw_a', -28, 0],
  ['cw_b', -19, 0],
  ['cw_c', -34.5, 0],
  ['ce_w', 21, 0],
  ['ce_e', 31.5, 0]
];

const MAX_LINK = 13.5;

export class NavGraph {
  constructor(collision) {
    this.collision = collision;
    this.nodes = [];
    this.byName = new Map();
    this.rejected = [];
    this.build();
  }

  addNode(name, x, z, y) {
    const c = this.collision;
    const h = y !== undefined ? c.groundHeight(x, z, 0.3, y + 0.3) : c.groundHeight(x, z, 0.3, 0.5);
    if (h < -50) {
      this.rejected.push(name);
      return;
    }
    // el nodo debe estar libre de paredes
    const p = { x, z };
    c.resolveCircle(p, 0.38, h, PLAYER.height, PLAYER.stepHeight);
    if (Math.hypot(p.x - x, p.z - z) > 0.6) {
      this.rejected.push(name);
      return;
    }
    const node = { id: this.nodes.length, name, x: p.x, y: h, z: p.z, links: [], team: z < -30 ? 0 : z > 30 ? 1 : -1 };
    this.nodes.push(node);
    this.byName.set(name, node);
  }

  build() {
    for (const [n, x, z, y] of HALF) this.addNode(n + '_s', x, z, y);
    for (const [n, x, z, y] of HALF) this.addNode(n + '_n', x, -z, y);
    for (const [n, x, z, y] of CENTER) this.addNode(n, x, z, y);
    const N = this.nodes.length;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const a = this.nodes[i];
        const b = this.nodes[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > MAX_LINK) continue;
        const r = this.walkTest(a, b);
        if (r) a.links.push({ to: j, cost: d * (r.jump ? 1.5 : 1) + (r.jump ? 1.5 : 0) + (r.drop ? 0.5 : 0), jump: r.jump, drop: r.drop, dist: d });
      }
    }
  }

  /** Prueba de paseo de a → b. Devuelve {jump, drop} o null. */
  walkTest(a, b) {
    const c = this.collision;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(2, Math.ceil(d / 0.35));
    let y = a.y;
    let jump = false;
    let drop = false;
    let jumps = 0;
    const p = { x: 0, z: 0 };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const g = c.groundHeight(x, z, 0.22, y + 1.55);
      if (g < -50) return null;
      const rise = g - y;
      if (rise > PLAYER.stepHeight) {
        if (rise > 1.5) return null;
        jump = true;
        jumps++;
        if (jumps > 1) return null;
      } else if (rise < -PLAYER.stepHeight) {
        drop = true;
      }
      // holgura lateral: el camino no debe rozar paredes
      p.x = x;
      p.z = z;
      c.resolveCircle(p, 0.34, g, PLAYER.height, PLAYER.stepHeight);
      if (Math.hypot(p.x - x, p.z - z) > 0.12) return null;
      y = g;
    }
    // el destino debe coincidir con la altura del nodo
    if (Math.abs(y - b.y) > 0.5) return null;
    return { jump, drop };
  }

  /** Nodo más cercano con línea de visión a la altura de la rodilla. */
  nearest(x, y, z, maxDist = 18) {
    let best = null;
    let bd = Infinity;
    for (const n of this.nodes) {
      const dy = Math.abs(n.y - y);
      const d = Math.hypot(n.x - x, n.z - z) + dy * 3;
      if (d >= bd || d > maxDist) continue;
      if (!this.collision.lineOfSight(x, y + 0.5, z, n.x, n.y + 0.5, n.z, walkBlock)) continue;
      bd = d;
      best = n;
    }
    if (!best) {
      // sin línea de visión: el más cercano a secas
      for (const n of this.nodes) {
        const d = Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 3;
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
    }
    return best;
  }

  /** A* entre dos nodos. Devuelve lista de nodos o null. costFn(link) extra opcional. */
  path(start, goal, costFn) {
    if (!start || !goal) return null;
    if (start === goal) return [start];
    const N = this.nodes.length;
    const g = this._g || (this._g = new Float32Array(N));
    const f = this._f || (this._f = new Float32Array(N));
    const from = this._from || (this._from = new Int32Array(N));
    const state = this._state || (this._state = new Uint8Array(N));
    g.fill(Infinity);
    f.fill(Infinity);
    from.fill(-1);
    state.fill(0);
    const open = [start.id];
    g[start.id] = 0;
    f[start.id] = this.h(start, goal);
    state[start.id] = 1;
    while (open.length) {
      // extraer el de menor f (conjuntos pequeños: búsqueda lineal)
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal.id) break;
      state[cur] = 2;
      const node = this.nodes[cur];
      for (const l of node.links) {
        if (state[l.to] === 2) continue;
        const extra = costFn ? costFn(node, this.nodes[l.to], l) : 0;
        const ng = g[cur] + l.cost + extra;
        if (ng < g[l.to]) {
          g[l.to] = ng;
          f[l.to] = ng + this.h(this.nodes[l.to], goal);
          from[l.to] = cur;
          if (state[l.to] !== 1) {
            state[l.to] = 1;
            open.push(l.to);
          }
        }
      }
    }
    if (from[goal.id] < 0) return null;
    const out = [];
    for (let n = goal.id; n >= 0; n = from[n]) {
      out.push(this.nodes[n]);
      if (n === start.id) break;
    }
    out.reverse();
    return out;
  }

  h(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  /** Nodo aleatorio cerca de (x,z) dentro de un radio. */
  randomNear(x, z, radius, rnd = Math.random) {
    const cands = this.nodes.filter((n) => Math.hypot(n.x - x, n.z - z) < radius);
    if (!cands.length) return this.nodes[(rnd() * this.nodes.length) | 0];
    return cands[(rnd() * cands.length) | 0];
  }

  linkCount() {
    let n = 0;
    for (const node of this.nodes) n += node.links.length;
    return n;
  }
}

function walkBlock(s) {
  return s.blocksMovement && s.blocksProjectiles;
}
