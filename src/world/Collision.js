// ─────────────────────────────────────────────────────────────
//  Collision · mundo 2.5D de sólidos convexos
//  Cada sólido es una caja (OBB rotada en Y) o una rampa (cuña cuya cara
//  superior sube a lo largo de su eje local +Z). El personaje es una
//  cápsula vertical: las superficies cuya parte superior está por debajo
//  de pie + stepHeight son suelo, el resto son paredes. Esto hace que las
//  rampas nunca atasquen y que los escalones pequeños se suban solos.
// ─────────────────────────────────────────────────────────────

const EPS = 1e-6;

export class Solid {
  constructor(o) {
    this.id = -1;
    this.type = o.type || 'box';
    this.cx = o.x;
    this.cy = o.y; // centro vertical de la caja envolvente
    this.cz = o.z;
    this.hx = o.w * 0.5;
    this.hy = o.h * 0.5;
    this.hz = o.d * 0.5;
    this.rot = o.rot || 0;
    this.cos = Math.cos(this.rot);
    this.sin = Math.sin(this.rot);
    // rampa: altura inferior en -Z local y superior en +Z local
    this.yLow = o.yLow !== undefined ? o.yLow : this.cy + this.hy;
    this.yHigh = o.yHigh !== undefined ? o.yHigh : this.cy + this.hy;
    this.bottom = this.cy - this.hy;
    this.top = this.cy + this.hy;
    this.floor = o.floor !== undefined ? o.floor : false; // cuenta como territorio
    this.walkable = o.walkable !== undefined ? o.walkable : true; // se puede estar encima
    this.paintable = o.paintable !== undefined ? o.paintable : true;
    this.blocksProjectiles = o.blocksProjectiles !== undefined ? o.blocksProjectiles : true;
    this.blocksCamera = o.blocksCamera !== undefined ? o.blocksCamera : true;
    this.blocksMovement = o.blocksMovement !== undefined ? o.blocksMovement : true;
    this.material = o.material || 'concrete';
    this.tag = o.tag || '';
    this.faces = null; // caras del atlas de pintura (ver PaintAtlas)
    this._stamp = 0;
    this.computeBounds();
    this.computePlanes();
  }

  computeBounds() {
    const ex = Math.abs(this.cos) * this.hx + Math.abs(this.sin) * this.hz;
    const ez = Math.abs(this.sin) * this.hx + Math.abs(this.cos) * this.hz;
    this.minX = this.cx - ex;
    this.maxX = this.cx + ex;
    this.minZ = this.cz - ez;
    this.maxZ = this.cz + ez;
  }

  // Planos (normal hacia fuera, en espacio local) para el raycast convexo
  computePlanes() {
    const p = [];
    const { hx, hy, hz } = this;
    // [nx, ny, nz, d] con n·x <= d dentro
    p.push([1, 0, 0, hx]); // +X
    p.push([-1, 0, 0, hx]); // -X
    p.push([0, 0, 1, hz]); // +Z
    p.push([0, 0, -1, hz]); // -Z
    p.push([0, -1, 0, hy]); // abajo
    if (this.type === 'ramp') {
      // plano inclinado que pasa por (z=-hz, y=yLow) y (z=+hz, y=yHigh) en local
      const y0 = this.yLow - this.cy;
      const y1 = this.yHigh - this.cy;
      const dy = y1 - y0;
      const dz = 2 * hz;
      // normal = (0, dz, -dy) normalizada
      const len = Math.hypot(dz, dy);
      const ny = dz / len;
      const nz = -dy / len;
      const d = ny * y0 + nz * -hz;
      p.push([0, ny, nz, d]);
    } else {
      p.push([0, 1, 0, hy]); // arriba
    }
    this.planes = p;
  }

  toLocal(x, z, out) {
    const dx = x - this.cx;
    const dz = z - this.cz;
    out.x = dx * this.cos - dz * this.sin;
    out.z = dx * this.sin + dz * this.cos;
    return out;
  }

  // Altura de la cara superior en coordenadas locales (lz dentro de [-hz, hz])
  topAtLocal(lz) {
    if (this.type !== 'ramp') return this.top;
    const t = Math.min(1, Math.max(0, (lz + this.hz) / (2 * this.hz)));
    return this.yLow + (this.yHigh - this.yLow) * t;
  }
}

const _l = { x: 0, z: 0 };

export class CollisionWorld {
  constructor(cellSize = 4) {
    this.solids = [];
    this.cell = cellSize;
    this.grid = new Map();
    this.minX = -80;
    this.minZ = -100;
    this.cols = Math.ceil(160 / cellSize);
    this.rows = Math.ceil(200 / cellSize);
    this._stamp = 1;
  }

  add(o) {
    const s = o instanceof Solid ? o : new Solid(o);
    s.id = this.solids.length;
    this.solids.push(s);
    const c0 = this._col(s.minX);
    const c1 = this._col(s.maxX);
    const r0 = this._row(s.minZ);
    const r1 = this._row(s.maxZ);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * this.cols + c;
        let arr = this.grid.get(k);
        if (!arr) {
          arr = [];
          this.grid.set(k, arr);
        }
        arr.push(s);
      }
    }
    return s;
  }

  _col(x) {
    return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cell)));
  }

  _row(z) {
    return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / this.cell)));
  }

  // Sólidos cuyo AABB XZ toca el círculo (x,z,r). Reutiliza el array `out`.
  query(x, z, r, out) {
    out.length = 0;
    const stamp = ++this._stamp;
    const c0 = this._col(x - r);
    const c1 = this._col(x + r);
    const r0 = this._row(z - r);
    const r1 = this._row(z + r);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const arr = this.grid.get(row * this.cols + col);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const s = arr[i];
          if (s._stamp === stamp) continue;
          s._stamp = stamp;
          if (x + r < s.minX || x - r > s.maxX || z + r < s.minZ || z - r > s.maxZ) continue;
          out.push(s);
        }
      }
    }
    return out;
  }

  /**
   * Altura del suelo más alto bajo el círculo de apoyo cuya cara superior
   * no supere maxY. Devuelve -Infinity si no hay suelo (agua).
   */
  groundHeight(x, z, supportR, maxY, result) {
    const list = this.query(x, z, supportR, this._tmpA || (this._tmpA = []));
    let best = -Infinity;
    let bestSolid = null;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.walkable) continue;
      s.toLocal(x, z, _l);
      const cx = Math.max(-s.hx, Math.min(s.hx, _l.x));
      const cz = Math.max(-s.hz, Math.min(s.hz, _l.z));
      const ddx = _l.x - cx;
      const ddz = _l.z - cz;
      if (ddx * ddx + ddz * ddz > supportR * supportR) continue;
      const top = s.topAtLocal(cz);
      if (top <= maxY + EPS && top > best) {
        best = top;
        bestSolid = s;
      }
    }
    if (result) {
      result.height = best;
      result.solid = bestSolid;
    }
    return best;
  }

  /**
   * Empuja un círculo horizontal fuera de los sólidos que actúan como pared
   * para una cápsula con pies en feetY. Modifica pos.{x,z}. Devuelve
   * el número de contactos y deja la normal acumulada en this.lastNormal.
   */
  resolveCircle(pos, radius, feetY, height, stepHeight) {
    let contacts = 0;
    let nx = 0;
    let nz = 0;
    for (let iter = 0; iter < 3; iter++) {
      const list = this.query(pos.x, pos.z, radius + 0.05, this._tmpB || (this._tmpB = []));
      let moved = false;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s.blocksMovement) continue;
        if (s.bottom >= feetY + height - 0.05) continue; // por encima de la cabeza
        s.toLocal(pos.x, pos.z, _l);
        const cx = Math.max(-s.hx, Math.min(s.hx, _l.x));
        const cz = Math.max(-s.hz, Math.min(s.hz, _l.z));
        const top = s.topAtLocal(cz);
        if (top <= feetY + stepHeight && s.walkable) continue; // escalón o suelo
        let dx = _l.x - cx;
        let dz = _l.z - cz;
        let d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        let d = Math.sqrt(d2);
        let push;
        if (d < EPS) {
          // centro dentro de la caja: salir por la cara más cercana
          const px = s.hx - Math.abs(_l.x);
          const pz = s.hz - Math.abs(_l.z);
          if (px < pz) {
            dx = Math.sign(_l.x) || 1;
            dz = 0;
            push = px + radius;
          } else {
            dx = 0;
            dz = Math.sign(_l.z) || 1;
            push = pz + radius;
          }
          d = 1;
        } else {
          push = radius - d;
          dx /= d;
          dz /= d;
        }
        // de local a mundo
        const wx = dx * s.cos + dz * s.sin;
        const wz = -dx * s.sin + dz * s.cos;
        pos.x += wx * push;
        pos.z += wz * push;
        nx += wx;
        nz += wz;
        contacts++;
        moved = true;
      }
      if (!moved) break;
    }
    const len = Math.hypot(nx, nz);
    this.lastNormalX = len > 0 ? nx / len : 0;
    this.lastNormalZ = len > 0 ? nz / len : 0;
    return contacts;
  }

  /** Techo más bajo por encima de feetY (para cortar saltos). */
  ceiling(x, z, radius, feetY, height) {
    const list = this.query(x, z, radius, this._tmpC || (this._tmpC = []));
    let best = Infinity;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.blocksMovement) continue;
      if (s.bottom <= feetY + 0.2) continue;
      s.toLocal(x, z, _l);
      if (Math.abs(_l.x) > s.hx + radius * 0.6 || Math.abs(_l.z) > s.hz + radius * 0.6) continue;
      if (s.bottom < best) best = s.bottom;
    }
    return best;
  }

  /**
   * Raycast contra todos los sólidos (recorrido DDA de la rejilla).
   * filter(s) → true para considerar el sólido.
   * Devuelve hit {t, x, y, z, nx, ny, nz, solid, face} o null.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter, hit) {
    const stamp = ++this._stamp;
    let best = maxDist;
    let bestSolid = null;
    let bestFace = -1;
    let bnx = 0;
    let bny = 0;
    let bnz = 0;

    // DDA en XZ
    const cell = this.cell;
    let col = Math.floor((ox - this.minX) / cell);
    let row = Math.floor((oz - this.minZ) / cell);
    const stepC = dx > 0 ? 1 : -1;
    const stepR = dz > 0 ? 1 : -1;
    const invDx = Math.abs(dx) > EPS ? 1 / dx : Infinity;
    const invDz = Math.abs(dz) > EPS ? 1 / dz : Infinity;
    let tMaxC =
      Math.abs(dx) > EPS
        ? ((this.minX + (col + (dx > 0 ? 1 : 0)) * cell - ox) * invDx)
        : Infinity;
    let tMaxR =
      Math.abs(dz) > EPS
        ? ((this.minZ + (row + (dz > 0 ? 1 : 0)) * cell - oz) * invDz)
        : Infinity;
    const tDeltaC = Math.abs(cell * invDx);
    const tDeltaR = Math.abs(cell * invDz);
    let tCell = 0;
    let guard = 0;

    while (tCell <= best && guard++ < 512) {
      if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
        const arr = this.grid.get(row * this.cols + col);
        if (arr) {
          for (let i = 0; i < arr.length; i++) {
            const s = arr[i];
            if (s._stamp === stamp) continue;
            s._stamp = stamp;
            if (filter && !filter(s)) continue;
            const r = this._rayConvex(s, ox, oy, oz, dx, dy, dz, best);
            if (r !== null) {
              best = r.t;
              bestSolid = s;
              bestFace = r.face;
              bnx = r.nx;
              bny = r.ny;
              bnz = r.nz;
            }
          }
        }
      } else if (
        (col < 0 && stepC < 0) ||
        (col >= this.cols && stepC > 0) ||
        (row < 0 && stepR < 0) ||
        (row >= this.rows && stepR > 0)
      ) {
        break;
      }
      if (tMaxC < tMaxR) {
        tCell = tMaxC;
        tMaxC += tDeltaC;
        col += stepC;
      } else {
        tCell = tMaxR;
        tMaxR += tDeltaR;
        row += stepR;
      }
    }

    if (!bestSolid) return null;
    const h = hit || {};
    h.t = best;
    h.x = ox + dx * best;
    h.y = oy + dy * best;
    h.z = oz + dz * best;
    h.nx = bnx;
    h.ny = bny;
    h.nz = bnz;
    h.solid = bestSolid;
    h.face = bestFace;
    return h;
  }

  _rayConvex(s, ox, oy, oz, dx, dy, dz, maxT) {
    // a espacio local del sólido
    const rx = ox - s.cx;
    const ry = oy - s.cy;
    const rz = oz - s.cz;
    const lox = rx * s.cos - rz * s.sin;
    const loz = rx * s.sin + rz * s.cos;
    const loy = ry;
    const ldx = dx * s.cos - dz * s.sin;
    const ldz = dx * s.sin + dz * s.cos;
    const ldy = dy;
    let tEnter = 0;
    let tExit = maxT;
    let enterFace = -1;
    const planes = s.planes;
    for (let i = 0; i < planes.length; i++) {
      const p = planes[i];
      const denom = p[0] * ldx + p[1] * ldy + p[2] * ldz;
      const dist = p[3] - (p[0] * lox + p[1] * loy + p[2] * loz);
      if (Math.abs(denom) < EPS) {
        if (dist < 0) return null;
        continue;
      }
      const t = dist / denom;
      if (denom < 0) {
        if (t > tEnter) {
          tEnter = t;
          enterFace = i;
        }
      } else if (t < tExit) {
        tExit = t;
      }
      if (tEnter > tExit) return null;
    }
    if (enterFace < 0) return null; // origen dentro del sólido
    if (tEnter > maxT) return null;
    const p = planes[enterFace];
    // normal local → mundo (objeto reutilizado: sin asignaciones por rayo)
    const r = this._rc || (this._rc = { t: 0, face: 0, nx: 0, ny: 0, nz: 0 });
    r.t = tEnter;
    r.face = enterFace;
    r.nx = p[0] * s.cos + p[2] * s.sin;
    r.ny = p[1];
    r.nz = -p[0] * s.sin + p[2] * s.cos;
    return r;
  }

  /** ¿Hay línea de visión libre entre dos puntos? */
  lineOfSight(ax, ay, az, bx, by, bz, filter) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    const hit = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, filter || losFilter, this._losHit || (this._losHit = {}));
    return hit === null;
  }

  /** ¿El punto está dentro de algún sólido? */
  pointInside(x, y, z) {
    const list = this.query(x, z, 0.01, this._tmpD || (this._tmpD = []));
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (y < s.bottom || y > s.top + 0.001) continue;
      s.toLocal(x, z, _l);
      if (Math.abs(_l.x) > s.hx || Math.abs(_l.z) > s.hz) continue;
      if (y <= s.topAtLocal(_l.z)) return s;
    }
    return null;
  }
}

function losFilter(s) {
  return s.blocksProjectiles;
}
