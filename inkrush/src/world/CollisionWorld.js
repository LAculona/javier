// Spatial queries against the static level: ground height, character sliding,
// raycasts for projectiles, camera and line of sight.
import * as THREE from 'three';

const CELL = 6;
const _hit = { t: 0, normal: new THREE.Vector3() };
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

export class CollisionWorld {
  constructor(bounds) {
    this.colliders = [];
    this.bounds = bounds; // {minX,maxX,minZ,maxZ}
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / CELL) + 1;
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / CELL) + 1;
    this.grid = Array.from({ length: this.cols * this.rows }, () => []);
    this._stamp = 0;
  }

  add(c) {
    c._id = this.colliders.length;
    c._mark = 0;
    this.colliders.push(c);
    const [x0, z0] = this.cellOf(c.min.x, c.min.z);
    const [x1, z1] = this.cellOf(c.max.x, c.max.z);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.grid[z * this.cols + x].push(c);
    return c;
  }

  cellOf(x, z) {
    const cx = Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.bounds.minX) / CELL)));
    const cz = Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.bounds.minZ) / CELL)));
    return [cx, cz];
  }

  // Collect unique colliders touching an XZ rectangle.
  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const stamp = ++this._stamp;
    const [x0, z0] = this.cellOf(minX, minZ);
    const [x1, z1] = this.cellOf(maxX, maxZ);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const list = this.grid[z * this.cols + x];
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c._mark !== stamp) { c._mark = stamp; out.push(c); }
        }
      }
    }
    return out;
  }

  groundHeight(x, z, maxY, r = 0.25) {
    const list = this.query(x - r, z - r, x + r, z + r, this._tmpList || (this._tmpList = []));
    let best = -Infinity;
    for (const c of list) {
      const h = c.topAt(x, z, r);
      if (h <= maxY && h > best) best = h;
    }
    return best;
  }

  ceilingHeight(x, z, feetY, r) {
    const list = this.query(x - r, z - r, x + r, z + r, this._tmpList2 || (this._tmpList2 = []));
    let best = Infinity;
    for (const c of list) {
      if (c.type !== 'box') continue;
      if (c.min.y > feetY + 0.3 && c.min.y < best && c.overlapsXZ(x, z, r * 0.8)) best = c.min.y;
    }
    return best;
  }

  // Push a vertical cylinder out of blocking geometry. Returns contact normal (or null).
  resolveCylinder(pos, r, height, stepH, outNormal) {
    const list = this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, this._tmpList3 || (this._tmpList3 = []));
    let contact = false;
    outNormal.set(0, 0, 0);
    for (let iter = 0; iter < 2; iter++) {
      for (const c of list) {
        if (c.min.y >= pos.y + height - 0.05) continue;
        if (!c.overlapsXZ(pos.x, pos.z, r)) continue;
        const top = c.blockHeightNear(pos.x, pos.z);
        if (top <= pos.y + stepH) continue;
        const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          dx /= d; dz /= d;
          pos.x += dx * push;
          pos.z += dz * push;
          outNormal.x += dx; outNormal.z += dz;
        } else {
          // Center inside footprint: exit along the shallowest axis.
          const ex = [pos.x - c.min.x, c.max.x - pos.x, pos.z - c.min.z, c.max.z - pos.z];
          let k = 0;
          for (let i = 1; i < 4; i++) if (ex[i] < ex[k]) k = i;
          if (k === 0) { pos.x = c.min.x - r; outNormal.x -= 1; }
          else if (k === 1) { pos.x = c.max.x + r; outNormal.x += 1; }
          else if (k === 2) { pos.z = c.min.z - r; outNormal.z -= 1; }
          else { pos.z = c.max.z + r; outNormal.z += 1; }
        }
        contact = true;
      }
    }
    if (contact) outNormal.normalize();
    return contact;
  }

  // Segment/ray query. Returns {t, point, normal, collider} or null.
  raycast(origin, dir, maxDist, out) {
    // Short segments (projectiles) use the broadphase grid; long rays test everything.
    const list = maxDist < 3
      ? this.query(Math.min(origin.x, origin.x + dir.x * maxDist) - 0.1, Math.min(origin.z, origin.z + dir.z * maxDist) - 0.1,
        Math.max(origin.x, origin.x + dir.x * maxDist) + 0.1, Math.max(origin.z, origin.z + dir.z * maxDist) + 0.1,
        this._tmpList4 || (this._tmpList4 = []))
      : this.colliders;
    let bestT = maxDist, best = null;
    for (const c of list) {
      if (c.raycast(origin, dir, bestT, _hit) && _hit.t < bestT) {
        bestT = _hit.t;
        best = c;
        out.normal.copy(_hit.normal);
      }
    }
    if (!best) return null;
    out.t = bestT;
    out.collider = best;
    out.point.copy(origin).addScaledVector(dir, bestT);
    return out;
  }

  lineOfSight(a, b) {
    _d.subVectors(b, a);
    const len = _d.length();
    if (len < 1e-4) return true;
    _d.divideScalar(len);
    _o.copy(a);
    for (const c of this.colliders) {
      if (c.raycast(_o, _d, len, _hit)) return false;
    }
    return true;
  }

  // Is there room for a body standing at (x,y,z)?
  fits(x, y, z, r, height) {
    const list = this.query(x - r, z - r, x + r, z + r, this._tmpList5 || (this._tmpList5 = []));
    for (const c of list) {
      if (c.min.y >= y + height || !c.overlapsXZ(x, z, r)) continue;
      if (c.blockHeightNear(x, z) > y + 0.3) return false;
    }
    return true;
  }
}

export function makeHit() {
  return { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };
}
