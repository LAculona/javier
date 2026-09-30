// Static collision primitives: axis-aligned boxes and ramps (convex wedges).
import * as THREE from 'three';

const EPS = 1e-6;

export class BoxCollider {
  constructor(min, max) {
    this.type = 'box';
    this.min = min.clone();
    this.max = max.clone();
  }

  // Walkable top height at (x,z) considering a disc of radius r, or -Infinity.
  topAt(x, z, r) {
    if (x < this.min.x - r || x > this.max.x + r || z < this.min.z - r || z > this.max.z + r) return -Infinity;
    return this.max.y;
  }

  overlapsXZ(x, z, r) {
    const cx = Math.max(this.min.x, Math.min(x, this.max.x));
    const cz = Math.max(this.min.z, Math.min(z, this.max.z));
    const dx = x - cx, dz = z - cz;
    return dx * dx + dz * dz < r * r;
  }

  // Height of solid at the closest footprint point (for side blocking).
  blockHeightNear() {
    return this.max.y;
  }

  raycast(o, d, maxT, out) {
    let tmin = 0, tmax = maxT, nAxis = -1, nSign = 0;
    for (let a = 0; a < 3; a++) {
      const k = a === 0 ? 'x' : a === 1 ? 'y' : 'z';
      const od = o[k], dd = d[k];
      if (Math.abs(dd) < EPS) {
        if (od < this.min[k] || od > this.max[k]) return false;
        continue;
      }
      let t1 = (this.min[k] - od) / dd;
      let t2 = (this.max[k] - od) / dd;
      let sign = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = a; nSign = sign; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
    if (nAxis < 0) return false; // origin inside
    out.t = tmin;
    out.normal.set(0, 0, 0);
    out.normal.setComponent(nAxis, nSign);
    return true;
  }
}

// A wedge rising along horizontal direction `dir` (unit, axis aligned).
export class RampCollider {
  constructor(center, dir, length, width, baseY, yLow, yHigh) {
    this.type = 'ramp';
    this.center = center.clone();
    this.dir = dir.clone();
    this.side = new THREE.Vector3(-dir.z, 0, dir.x);
    this.length = length;
    this.width = width;
    this.baseY = baseY;
    this.yLow = yLow;
    this.yHigh = yHigh;
    const hx = Math.abs(dir.x) * length / 2 + Math.abs(this.side.x) * width / 2;
    const hz = Math.abs(dir.z) * length / 2 + Math.abs(this.side.z) * width / 2;
    this.min = new THREE.Vector3(center.x - hx, baseY, center.z - hz);
    this.max = new THREE.Vector3(center.x + hx, yHigh, center.z + hz);
    // Convex planes (normal, d) with inside: n·p <= d
    const slope = new THREE.Vector3().copy(dir).multiplyScalar(-(yHigh - yLow)).add(new THREE.Vector3(0, length, 0)).normalize();
    const lowPoint = new THREE.Vector3().copy(center).addScaledVector(dir, -length / 2).setY(yLow);
    this.planes = [
      { n: slope, d: slope.dot(lowPoint) },
      { n: new THREE.Vector3(0, -1, 0), d: -baseY },
      { n: dir.clone(), d: dir.dot(center) + length / 2 },
      { n: dir.clone().negate(), d: -dir.dot(center) + length / 2 },
      { n: this.side.clone(), d: this.side.dot(center) + width / 2 },
      { n: this.side.clone().negate(), d: -this.side.dot(center) + width / 2 },
    ];
  }

  heightAtClamped(x, z) {
    const lx = (x - this.center.x) * this.dir.x + (z - this.center.z) * this.dir.z;
    const t = Math.max(0, Math.min(1, lx / this.length + 0.5));
    return this.yLow + (this.yHigh - this.yLow) * t;
  }

  topAt(x, z, r) {
    if (x < this.min.x - r || x > this.max.x + r || z < this.min.z - r || z > this.max.z + r) return -Infinity;
    const cx = Math.max(this.min.x, Math.min(x, this.max.x));
    const cz = Math.max(this.min.z, Math.min(z, this.max.z));
    return this.heightAtClamped(cx, cz);
  }

  overlapsXZ(x, z, r) {
    const cx = Math.max(this.min.x, Math.min(x, this.max.x));
    const cz = Math.max(this.min.z, Math.min(z, this.max.z));
    const dx = x - cx, dz = z - cz;
    return dx * dx + dz * dz < r * r;
  }

  blockHeightNear(x, z) {
    const cx = Math.max(this.min.x, Math.min(x, this.max.x));
    const cz = Math.max(this.min.z, Math.min(z, this.max.z));
    return this.heightAtClamped(cx, cz);
  }

  raycast(o, d, maxT, out) {
    let tmin = 0, tmax = maxT, hitPlane = null;
    for (const p of this.planes) {
      const denom = p.n.dot(d);
      const dist = p.d - p.n.dot(o);
      if (Math.abs(denom) < EPS) {
        if (dist < 0) return false;
        continue;
      }
      const t = dist / denom;
      if (denom < 0) {
        if (t > tmin) { tmin = t; hitPlane = p; }
      } else if (t < tmax) tmax = t;
      if (tmin > tmax) return false;
    }
    if (!hitPlane) return false;
    out.t = tmin;
    out.normal.copy(hitPlane.n);
    return true;
  }
}
