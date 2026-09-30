import * as THREE from 'three';
import { setSunUniforms } from './ToonMaterial.js';

// ─────────────────────────────────────────────────────────────
//  Lighting · sol cálido de media tarde + relleno frío del cielo
//  La sombra usa una única cascada cercana que sigue al foco (jugador o
//  cámara) con ajuste al texel para evitar el parpadeo al moverse.
// ─────────────────────────────────────────────────────────────

export class Lighting {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.sunDir = (opts.sunDir || new THREE.Vector3(-0.62, 0.52, -0.42)).clone().normalize();

    this.sun = new THREE.DirectionalLight(opts.sunColor || 0xffe0b8, opts.sunIntensity || 2.15);
    this.sun.name = 'sun';
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    this.sun.shadow.intensity = 1;
    this.sunDistance = 90;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(opts.skyColor || 0xa9c8ff, opts.groundColor || 0xd9b99a, opts.hemiIntensity || 0.46);
    this.hemi.name = 'skyfill';
    scene.add(this.hemi);

    this.extent = 40;
    this.mapSize = 2048;
    this._focus = new THREE.Vector3();
    this._lightSpace = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
    this._tmp = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    // base ortonormal fija del espacio de luz (el sol no se mueve)
    this._fwd = this.sunDir.clone().negate();
    this._right = new THREE.Vector3().crossVectors(this._fwd, this._up).normalize();
    this._upL = new THREE.Vector3().crossVectors(this._right, this._fwd).normalize();
    this.configureShadow(40, 2048, 3);
    this.update(new THREE.Vector3());
  }

  configureShadow(extent, mapSize, radius) {
    this.extent = extent;
    this.mapSize = mapSize;
    const cam = this.sun.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 1;
    cam.far = this.sunDistance * 2 + 40;
    cam.updateProjectionMatrix();
    this.sun.shadow.radius = radius;
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  /** Coloca la cascada de sombra centrada en el foco, ajustada al texel. */
  update(focus) {
    const texel = (this.extent * 2) / this.mapSize;
    const fwd = this._fwd;
    const right = this._right;
    const up = this._upL;
    // proyectar foco en el plano de la luz y ajustar
    const r = Math.round(focus.dot(right) / texel) * texel;
    const u = Math.round(focus.dot(up) / texel) * texel;
    const f = focus.dot(fwd);
    this._focus.set(0, 0, 0).addScaledVector(right, r).addScaledVector(up, u).addScaledVector(fwd, f);
    this.sun.target.position.copy(this._focus);
    this.sun.position.copy(this._focus).addScaledVector(this.sunDir, this.sunDistance);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
    setSunUniforms(this.sun);
  }
}
