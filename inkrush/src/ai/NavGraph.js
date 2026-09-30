// Auto-generated waypoint graph over every walkable surface of the arena.
import * as THREE from 'three';
import { ARENA } from '../world/MapBuilder.js';

const STEP = 3;

export class NavGraph {
  constructor(world) {
    this.world = world;
    this.nodes = [];
    this.buckets = new Map();
    this.build();
  }

  key(ix, iz) { return ix * 1000 + iz; }

  build() {
    const w = this.world;
    const list = [];
    for (let x = ARENA.minX + 1.5, ix = 0; x <= ARENA.maxX - 1.5; x += STEP, ix++) {
      for (let z = ARENA.minZ + 1.5, iz = 0; z <= ARENA.maxZ - 1.5; z += STEP, iz++) {
        const heights = [];
        for (const c of w.query(x, z, x, z, list)) {
          const h = c.topAt(x, z, 0);
          if (!isFinite(h)) continue;
          if (heights.some((y) => Math.abs(y - h) < 0.3)) continue;
          if (w.groundHeight(x, z, h + 0.01, 0) > h + 0.01) continue;
          if (!w.fits(x, h, z, 0.45, 1.7)) continue;
          heights.push(h);
        }
        for (const h of heights) {
          const node = { id: this.nodes.length, pos: new THREE.Vector3(x, h, z), ix, iz, edges: [] };
          this.nodes.push(node);
          const k = this.key(ix, iz);
          if (!this.buckets.has(k)) this.buckets.set(k, []);
          this.buckets.get(k).push(node);
        }
      }
    }
    for (const a of this.nodes) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          const bucket = this.buckets.get(this.key(a.ix + dx, a.iz + dz));
          if (!bucket) continue;
          for (const b of bucket) {
            const dist = a.pos.distanceTo(b.pos);
            if (this.canWalk(a.pos, b.pos, 0.55)) a.edges.push({ to: b, cost: dist, jump: false });
            else if (b.pos.y - a.pos.y > 0.4 && this.canWalk(a.pos, b.pos, 1.55)) a.edges.push({ to: b, cost: dist + 3, jump: true });
          }
        }
      }
    }
    // Drop isolated nodes from goal selection
    this.goalNodes = this.nodes.filter((n) => n.edges.length >= 2);
  }

  canWalk(a, b, maxStep) {
    const w = this.world;
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(dist / 0.35);
    let y = a.y;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const h = w.groundHeight(x, z, y + maxStep, 0.3);
      if (!isFinite(h)) return false;
      if (!w.fits(x, h, z, 0.4, 1.7)) return false;
      y = h;
    }
    return Math.abs(y - b.y) < 0.3;
  }

  nearest(pos, maxDy = 1.6) {
    const ix = Math.round((pos.x - (ARENA.minX + 1.5)) / STEP);
    const iz = Math.round((pos.z - (ARENA.minZ + 1.5)) / STEP);
    let best = null, bestD = Infinity;
    for (let r = 0; r <= 3 && !best; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const bucket = this.buckets.get(this.key(ix + dx, iz + dz));
          if (!bucket) continue;
          for (const n of bucket) {
            const dy = Math.abs(n.pos.y - pos.y);
            if (dy > maxDy) continue;
            const d = (n.pos.x - pos.x) ** 2 + (n.pos.z - pos.z) ** 2 + dy * dy * 4;
            if (d < bestD) { bestD = d; best = n; }
          }
        }
      }
    }
    return best;
  }

  // A* returning an array of {node, jump}
  path(start, goal) {
    if (!start || !goal) return null;
    if (start === goal) return [{ node: goal, jump: false }];
    const g = new Map([[start, 0]]);
    const came = new Map();
    const open = [start];
    const f = new Map([[start, start.pos.distanceTo(goal.pos)]]);
    const closed = new Set();
    let iter = 0;
    while (open.length && iter++ < 4000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f.get(open[i]) < f.get(open[bi])) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) {
        const out = [];
        let n = goal;
        while (n !== start) {
          const c = came.get(n);
          out.push({ node: n, jump: c.jump });
          n = c.from;
        }
        return out.reverse();
      }
      closed.add(cur);
      for (const e of cur.edges) {
        if (closed.has(e.to)) continue;
        const ng = g.get(cur) + e.cost;
        if (ng < (g.get(e.to) ?? Infinity)) {
          g.set(e.to, ng);
          came.set(e.to, { from: cur, jump: e.jump });
          f.set(e.to, ng + e.to.pos.distanceTo(goal.pos));
          if (!open.includes(e.to)) open.push(e.to);
        }
      }
    }
    return null;
  }

  randomGoal() {
    return this.goalNodes[Math.floor(Math.random() * this.goalNodes.length)];
  }
}
