import * as THREE from 'three';
import { createToonMaterial } from '../render/ToonMaterial.js';

// ─────────────────────────────────────────────────────────────
//  Particles · pool fijo en InstancedMesh (sin asignaciones por fotograma)
//  · gotas de pintura estiradas según su velocidad (algunas manchan el
//    suelo al caer), neblina, chispas de surf, goterones, trozos de la
//    explosión de pintura, salpicaduras de agua y confeti plano.
// ─────────────────────────────────────────────────────────────

const K_DROP = 0;
const K_MIST = 1;
const K_SPARK = 2;
const K_CHUNK = 3;
const K_GOO = 4;
const K_WATER = 5;

function glowMaterial(name, glow) {
  const m = createToonMaterial({ name, color: 0xffffff, roughness: 0.18, envMapIntensity: 0.9, rim: 0.3, variation: 0, paint: 'none' });
  const base = m.onBeforeCompile;
  m.userData.inkUniforms.uGlow = { value: glow };
  m.onBeforeCompile = function (shader) {
    base.call(this, shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float uFlash;', 'uniform float uFlash;\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n\ttotalEmissiveRadiance += vColor.rgb * uGlow;\n#endif');
  };
  m.customProgramCacheKey = () => 'ink-particle';
  return m;
}

export class Particles {
  constructor(scene, paint, max = 1400) {
    this.paint = paint;
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.mat = glowMaterial('particles', 0.55);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.name = 'particles';
    scene.add(this.mesh);

    // confeti (quads planos que giran)
    this.maxConf = 420;
    const q = new THREE.PlaneGeometry(1, 0.6);
    this.confMat = createToonMaterial({ name: 'confetti', color: 0xffffff, roughness: 0.4, side: THREE.DoubleSide, variation: 0, rim: 0.2, paint: 'none' });
    this.conf = new THREE.InstancedMesh(q, this.confMat, this.maxConf);
    this.conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.conf.setColorAt(0, new THREE.Color(1, 1, 1));
    this.conf.count = 0;
    this.conf.frustumCulled = false;
    this.conf.name = 'confetti';
    scene.add(this.conf);

    // estado del pool
    const n = max;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.team = new Int8Array(n);
    this.stain = new Uint8Array(n);
    this.cr = new Float32Array(n);
    this.cg = new Float32Array(n);
    this.cb = new Float32Array(n);
    this.alive = 0;

    const m = this.maxConf;
    this.cx = new Float32Array(m);
    this.cy = new Float32Array(m);
    this.cz = new Float32Array(m);
    this.cvx = new Float32Array(m);
    this.cvy = new Float32Array(m);
    this.cvz = new Float32Array(m);
    this.cl = new Float32Array(m);
    this.cml = new Float32Array(m);
    this.crx = new Float32Array(m);
    this.cry = new Float32Array(m);
    this.crs = new Float32Array(m);
    this.ccol = new Float32Array(m * 3);
    this.confAlive = 0;

    this._c = new THREE.Color();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.heightAt = null; // (x,z) → altura del suelo (rejilla CPU)
  }

  clear() {
    this.alive = 0;
    this.confAlive = 0;
    this.mesh.count = 0;
    this.conf.count = 0;
  }

  _spawn(kind, x, y, z, vx, vy, vz, life, size, grav, drag, color, team, stain) {
    let i;
    if (this.alive < this.max) i = this.alive++;
    else i = (Math.random() * this.max) | 0; // pool lleno: reciclar uno al azar
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.kind[i] = kind;
    this.team[i] = team;
    this.stain[i] = stain ? 1 : 0;
    this._c.set(color);
    this.cr[i] = this._c.r;
    this.cg[i] = this._c.g;
    this.cb[i] = this._c.b;
  }

  /** Salpicadura de pintura en un impacto. n: nº gotas; normal: dirección principal. */
  splash(x, y, z, color, team, n = 10, speed = 5, nx = 0, ny = 1, nz = 0, stainChance = 0.25) {
    for (let i = 0; i < n; i++) {
      const rx = (Math.random() - 0.5) * 2;
      const ry = Math.random();
      const rz = (Math.random() - 0.5) * 2;
      const sp = speed * (0.45 + Math.random() * 0.8);
      const dx = nx * 0.9 + rx * 0.8;
      const dy = ny * 0.9 + ry * 0.8 + 0.3;
      const dz = nz * 0.9 + rz * 0.8;
      const l = Math.hypot(dx, dy, dz) || 1;
      this._spawn(K_DROP, x, y, z, (dx / l) * sp, (dy / l) * sp, (dz / l) * sp, 0.45 + Math.random() * 0.5, 0.045 + Math.random() * 0.075, 20, 0.6, color, team, Math.random() < stainChance);
    }
    // neblina
    for (let i = 0; i < 3; i++) {
      this._spawn(K_MIST, x, y, z, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.22 + Math.random() * 0.1, 0.12 + Math.random() * 0.1, 0, 4, color, team, false);
    }
  }

  /** Fogonazo de pintura en la boca del arma. */
  muzzle(x, y, z, dx, dy, dz, color, n = 5) {
    for (let i = 0; i < n; i++) {
      const sp = 3 + Math.random() * 4;
      this._spawn(K_MIST, x, y, z, dx * sp + (Math.random() - 0.5) * 1.5, dy * sp + (Math.random() - 0.5) * 1.5, dz * sp + (Math.random() - 0.5) * 1.5, 0.1 + Math.random() * 0.08, 0.05 + Math.random() * 0.06, 0, 6, color, -1, false);
    }
  }

  /** Chispas de surf / estela brillante. */
  sparks(x, y, z, vx, vz, color, n = 2) {
    for (let i = 0; i < n; i++) {
      this._spawn(
        K_SPARK,
        x + (Math.random() - 0.5) * 0.3,
        y + 0.05,
        z + (Math.random() - 0.5) * 0.3,
        -vx * 0.25 + (Math.random() - 0.5) * 2.5,
        1.5 + Math.random() * 2.5,
        -vz * 0.25 + (Math.random() - 0.5) * 2.5,
        0.28 + Math.random() * 0.2,
        0.03 + Math.random() * 0.03,
        12,
        1.2,
        color,
        -1,
        false
      );
    }
  }

  /** Partículas pegajosas al pisar pintura enemiga. */
  goo(x, y, z, color) {
    this._spawn(K_GOO, x + (Math.random() - 0.5) * 0.4, y + 0.08, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 0.8 + Math.random(), (Math.random() - 0.5) * 0.6, 0.5, 0.05 + Math.random() * 0.04, 6, 2.5, color, -1, false);
  }

  /** Explosión de pintura al ser eliminado. */
  explosion(x, y, z, color, team) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.2 + Math.random() * 1.1;
      const sp = 3 + Math.random() * 7;
      const big = Math.random() < 0.25;
      this._spawn(K_CHUNK, x, y + 0.8, z, Math.cos(a) * sp, up * sp * 0.8, Math.sin(a) * sp, 0.7 + Math.random() * 0.6, big ? 0.14 + Math.random() * 0.1 : 0.05 + Math.random() * 0.06, 18, 0.4, color, team, Math.random() < 0.35);
    }
    // destello y anillo de gotas a ras de suelo
    this._spawn(K_MIST, x, y + 0.8, z, 0, 0.5, 0, 0.18, 0.9, 0, 2, color, -1, false);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this._spawn(K_DROP, x, y + 0.15, z, Math.cos(a) * 7, 1.2, Math.sin(a) * 7, 0.35, 0.06, 6, 3, color, team, i % 4 === 0);
    }
    this.splash(x, y + 0.8, z, color, team, 14, 7, 0, 1, 0, 0.2);
  }

  /** Salpicadura blanca al caer al agua. */
  water(x, y, z) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3;
      this._spawn(K_WATER, x, y, z, Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp, 0.6 + Math.random() * 0.4, 0.06 + Math.random() * 0.08, 16, 0.6, 0xf2fbff, -1, false);
    }
  }

  /** Confeti de pintura (victoria). */
  confetti(x, y, z, colors, n = 120, spread = 8) {
    for (let k = 0; k < n; k++) {
      let i;
      if (this.confAlive < this.maxConf) i = this.confAlive++;
      else i = (Math.random() * this.maxConf) | 0;
      this.cx[i] = x + (Math.random() - 0.5) * spread;
      this.cy[i] = y + Math.random() * 2;
      this.cz[i] = z + (Math.random() - 0.5) * spread;
      this.cvx[i] = (Math.random() - 0.5) * 4;
      this.cvy[i] = 3 + Math.random() * 6;
      this.cvz[i] = (Math.random() - 0.5) * 4;
      this.cl[i] = this.cml[i] = 3 + Math.random() * 2.5;
      this.crx[i] = Math.random() * 6;
      this.cry[i] = Math.random() * 6;
      this.crs[i] = 4 + Math.random() * 8;
      this._c.set(colors[(Math.random() * colors.length) | 0]);
      this.ccol[i * 3] = this._c.r;
      this.ccol[i * 3 + 1] = this._c.g;
      this.ccol[i * 3 + 2] = this._c.b;
    }
  }

  update(dt) {
    const m = this.mesh.instanceMatrix.array;
    const col = this.mesh.instanceColor.array;
    const heightAt = this.heightAt;
    let i = 0;
    while (i < this.alive) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this._kill(i);
        continue;
      }
      const k = this.kind[i];
      const drag = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= drag;
      this.vz[i] *= drag;
      this.vy[i] = this.vy[i] * drag - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      // suelo (rejilla de alturas de la CPU)
      if (heightAt && (k === K_DROP || k === K_CHUNK || k === K_SPARK || k === K_WATER) && this.vy[i] < 0) {
        const h = heightAt(this.px[i], this.pz[i]);
        if (this.py[i] <= h) {
          if (this.stain[i] && this.team[i] >= 0 && this.paint) {
            this.paint.stampGround(this.px[i], h, this.pz[i], k === K_CHUNK ? 0.5 + this.size[i] * 2 : 0.26 + this.size[i] * 2, this.team[i], { shape: 'drop', strength: 0.95 });
          }
          if (k === K_SPARK || k === K_WATER) {
            this.py[i] = h;
            this.vy[i] *= -0.3;
          } else {
            this._kill(i);
            continue;
          }
        }
      }
      // matriz: estirada en la dirección de la velocidad
      const t = this.life[i] / this.maxLife[i];
      let s = this.size[i];
      if (k === K_MIST) s *= 0.6 + (1 - t) * 1.6;
      else s *= Math.min(1, t * 4) * (0.5 + 0.5 * Math.min(1, t * 2));
      const vx = this.vx[i];
      const vy = this.vy[i];
      const vz = this.vz[i];
      const sp = Math.hypot(vx, vy, vz);
      const stretch = 1 + Math.min(k === K_CHUNK ? 0.55 : 2.5, sp * (k === K_CHUNK ? 0.05 : 0.09));
      const o = i * 16;
      if (sp > 0.01) {
        // eje Y = velocidad; X, Z perpendiculares
        const yx = vx / sp;
        const yy = vy / sp;
        const yz = vz / sp;
        let ax = yy * 1 - yz * 0;
        let ay = yz * 0 - yx * 1;
        let az = yx * 0 - yy * 0;
        // cross(Y, (0,0,1)) puede degenerar
        let al = Math.hypot(ax, ay, az);
        if (al < 1e-3) {
          ax = 1;
          ay = 0;
          az = 0;
          al = 1;
        }
        ax /= al;
        ay /= al;
        az /= al;
        const zx = ay * yz - az * yy;
        const zy = az * yx - ax * yz;
        const zz = ax * yy - ay * yx;
        const sx = s / Math.sqrt(stretch);
        const sy = s * stretch;
        m[o] = ax * sx;
        m[o + 1] = ay * sx;
        m[o + 2] = az * sx;
        m[o + 3] = 0;
        m[o + 4] = yx * sy;
        m[o + 5] = yy * sy;
        m[o + 6] = yz * sy;
        m[o + 7] = 0;
        m[o + 8] = zx * sx;
        m[o + 9] = zy * sx;
        m[o + 10] = zz * sx;
        m[o + 11] = 0;
      } else {
        m[o] = s;
        m[o + 1] = 0;
        m[o + 2] = 0;
        m[o + 3] = 0;
        m[o + 4] = 0;
        m[o + 5] = s;
        m[o + 6] = 0;
        m[o + 7] = 0;
        m[o + 8] = 0;
        m[o + 9] = 0;
        m[o + 10] = s;
        m[o + 11] = 0;
      }
      m[o + 12] = this.px[i];
      m[o + 13] = this.py[i];
      m[o + 14] = this.pz[i];
      m[o + 15] = 1;
      const bright = k === K_SPARK ? 2.2 : k === K_MIST ? 1.3 : 1;
      col[i * 3] = this.cr[i] * bright;
      col[i * 3 + 1] = this.cg[i] * bright;
      col[i * 3 + 2] = this.cb[i] * bright;
      i++;
    }
    this.mesh.count = this.alive;
    if (this.alive > 0) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, this.alive * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.clearUpdateRanges();
      this.mesh.instanceColor.addUpdateRange(0, this.alive * 3);
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.updateConfetti(dt);
  }

  _kill(i) {
    const last = --this.alive;
    if (i === last) return;
    this.px[i] = this.px[last];
    this.py[i] = this.py[last];
    this.pz[i] = this.pz[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.vz[i] = this.vz[last];
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.size[i] = this.size[last];
    this.grav[i] = this.grav[last];
    this.drag[i] = this.drag[last];
    this.kind[i] = this.kind[last];
    this.team[i] = this.team[last];
    this.stain[i] = this.stain[last];
    this.cr[i] = this.cr[last];
    this.cg[i] = this.cg[last];
    this.cb[i] = this.cb[last];
  }

  updateConfetti(dt) {
    const m = this._m;
    let i = 0;
    while (i < this.confAlive) {
      this.cl[i] -= dt;
      if (this.cl[i] <= 0) {
        const last = --this.confAlive;
        if (i !== last) {
          this.cx[i] = this.cx[last];
          this.cy[i] = this.cy[last];
          this.cz[i] = this.cz[last];
          this.cvx[i] = this.cvx[last];
          this.cvy[i] = this.cvy[last];
          this.cvz[i] = this.cvz[last];
          this.cl[i] = this.cl[last];
          this.cml[i] = this.cml[last];
          this.crx[i] = this.crx[last];
          this.cry[i] = this.cry[last];
          this.crs[i] = this.crs[last];
          this.ccol[i * 3] = this.ccol[last * 3];
          this.ccol[i * 3 + 1] = this.ccol[last * 3 + 1];
          this.ccol[i * 3 + 2] = this.ccol[last * 3 + 2];
        }
        continue;
      }
      const drag = Math.exp(-1.6 * dt);
      this.cvx[i] = this.cvx[i] * drag + Math.sin(this.cl[i] * 3 + i) * 2 * dt;
      this.cvz[i] = this.cvz[i] * drag + Math.cos(this.cl[i] * 2.7 + i) * 2 * dt;
      this.cvy[i] = Math.max(-2.2, this.cvy[i] * drag - 6 * dt);
      this.cx[i] += this.cvx[i] * dt;
      this.cy[i] += this.cvy[i] * dt;
      this.cz[i] += this.cvz[i] * dt;
      this.crx[i] += this.crs[i] * dt;
      this.cry[i] += this.crs[i] * 0.7 * dt;
      const fade = Math.min(1, this.cl[i] / 0.5);
      this._e.set(this.crx[i], this.cry[i], 0);
      this._q.setFromEuler(this._e);
      this._p.set(this.cx[i], this.cy[i], this.cz[i]);
      this._s.set(0.16 * fade, 0.16 * fade, 0.16 * fade);
      m.compose(this._p, this._q, this._s);
      this.conf.setMatrixAt(i, m);
      this._c.setRGB(this.ccol[i * 3], this.ccol[i * 3 + 1], this.ccol[i * 3 + 2]);
      this.conf.setColorAt(i, this._c);
      i++;
    }
    this.conf.count = this.confAlive;
    if (this.confAlive > 0) {
      this.conf.instanceMatrix.needsUpdate = true;
      this.conf.instanceColor.needsUpdate = true;
    }
  }
}
