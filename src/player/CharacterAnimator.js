import * as THREE from 'three';
import { LEG, HIP_HEIGHT } from './CharacterRig.js';

// ─────────────────────────────────────────────────────────────
//  CharacterAnimator · animación 100% procedural
//  Ciclo de marcha con objetivos de pie + IK de 2 huesos, ajuste al suelo
//  por raycast, salto por fases (anticipación, impulso, ápice, caída,
//  aterrizaje con squash), surf, disparo con retroceso, cambio de arma,
//  daño (flinch + destello), cuerpo a cuerpo, recarga, caída desde el dron
//  y movimiento secundario con muelles amortiguados (tanque, capucha,
//  antena y bufanda).
// ─────────────────────────────────────────────────────────────

class Spring {
  constructor(k = 180, d = 14) {
    this.k = k;
    this.d = d;
    this.x = 0;
    this.v = 0;
  }

  update(target, dt) {
    const steps = dt > 1 / 60 ? 2 : 1;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = (target - this.x) * this.k - this.v * this.d;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }

  kick(v) {
    this.v += v;
  }

  reset(x = 0) {
    this.x = x;
    this.v = 0;
  }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const TAU = Math.PI * 2;

export class CharacterAnimator {
  constructor(rig) {
    this.rig = rig;
    this.b = rig.bones;
    this.t = Math.random() * 10;
    this.phase = Math.random() * TAU;
    this.speed = 0;
    this.moveDirX = 0;
    this.moveDirZ = 1;
    this.lean = new Spring(60, 12);
    this.bank = new Spring(50, 10);
    this.squash = new Spring(260, 13);
    this.recoil = new Spring(320, 20);
    this.flinch = new Spring(220, 16);
    this.surfBlend = new Spring(40, 12);
    this.aimBlend = new Spring(90, 16);
    this.airBlend = new Spring(70, 14);
    this.crouch = new Spring(120, 16);
    this.tankX = new Spring(140, 7);
    this.tankZ = new Spring(140, 7);
    this.hoodX = new Spring(110, 8);
    this.antX = new Spring(90, 4.5);
    this.antZ = new Spring(90, 4.5);
    this.scarfX = new Spring(70, 6);
    this.pelvisY = new Spring(150, 18);
    this.visualYOffset = 0;
    this.blinkTimer = 2 + Math.random() * 3;
    this.blink = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.lookTimer = 0;
    this.flash = 0;
    this.switchT = -1;
    this.meleeT = -1;
    this.flickT = -1;
    this.popT = -1;
    this._prevVX = 0;
    this._prevVZ = 0;
    this.weaponSwapped = false;
    this.footGround = [0, 0];
    this.emotion = 0;
    this.emotionTimer = 0;
  }

  // ── eventos ──
  onShoot(strength = 1) {
    this.recoil.kick(9 * strength);
  }

  onJump() {
    this.squash.kick(-3.2);
  }

  onLand(impact) {
    const k = clamp(impact / 14, 0.15, 1);
    this.squash.kick(4.5 * k);
    this.tankX.kick(-6 * k);
    this.antX.kick(-12 * k);
    this.hoodX.kick(-5 * k);
  }

  onHurt(amount) {
    this.flinch.kick(clamp(amount / 30, 0.3, 1.2) * 14);
    this.flash = 1;
    this.setEmotion(2, 0.5);
  }

  onSwitch() {
    this.switchT = 0;
    this.weaponSwapped = false;
  }

  onMelee() {
    this.meleeT = 0;
    this.setEmotion(1, 0.6);
  }

  onFlick() {
    this.flickT = 0;
  }

  onPop() {
    this.popT = 0;
    this.setEmotion(3, 10);
  }

  setEmotion(e, time = 1) {
    this.emotion = e;
    this.emotionTimer = time;
  }

  reset() {
    for (const s of [this.lean, this.bank, this.squash, this.recoil, this.flinch, this.surfBlend, this.aimBlend, this.airBlend, this.crouch, this.tankX, this.tankZ, this.hoodX, this.antX, this.antZ, this.scarfX]) s.reset();
    this.pelvisY.reset(0);
    this.switchT = -1;
    this.meleeT = -1;
    this.flickT = -1;
    this.popT = -1;
    this.flash = 0;
    this.emotion = 0;
    this.emotionTimer = 0;
  }

  /**
   * s: estado del personaje (ver Character.animState)
   * groundAt(x,z,maxY) → altura del suelo (para ajuste de pies)
   */
  update(dt, s, groundAt) {
    const b = this.b;
    this.t += dt;
    const t = this.t;

    // velocidad local (respecto al cuerpo)
    const cy = Math.cos(s.yaw);
    const sy = Math.sin(s.yaw);
    const lvx = s.vx * cy - s.vz * sy; // +x local = izquierda del personaje
    const lvz = s.vx * sy + s.vz * cy; // +z local = delante
    const speed = Math.hypot(s.vx, s.vz);
    this.speed = lerp(this.speed, speed, 1 - Math.exp(-dt * 10));
    if (speed > 0.3) {
      const l = Math.hypot(lvx, lvz);
      this.moveDirX = lerp(this.moveDirX, lvx / l, 1 - Math.exp(-dt * 12));
      this.moveDirZ = lerp(this.moveDirZ, lvz / l, 1 - Math.exp(-dt * 12));
    }
    // aceleración para inercias
    const ax = (s.vx - this._prevVX) / Math.max(dt, 1e-3);
    const az = (s.vz - this._prevVZ) / Math.max(dt, 1e-3);
    this._prevVX = s.vx;
    this._prevVZ = s.vz;
    const lax = ax * cy - az * sy;
    const laz = ax * sy + az * cy;

    const grounded = s.grounded;
    const surf = this.surfBlend.update(s.surfing ? 1 : 0, dt);
    const aim = this.aimBlend.update(s.aiming || s.firing ? 1 : 0, dt);
    const air = this.airBlend.update(grounded ? 0 : 1, dt);
    const crouch = this.crouch.update(s.reloading >= 0 ? 0.35 : s.rolling ? 0.4 : 0, dt);
    const run = clamp((this.speed - 1) / 6, 0, 1);

    // ── fase de marcha
    const cycle = clamp(0.8 + this.speed * 0.06, 0.8, 1.25);
    if (grounded && surf < 0.5) this.phase = (this.phase + (this.speed * dt / cycle) * TAU) % TAU;
    const moving = clamp(this.speed / 1.2, 0, 1) * (1 - surf) * (1 - air);

    // ── raíz: squash & stretch
    let sq = this.squash.update(0, dt);
    if (!grounded && s.vy > 2) sq = Math.min(sq, -0.12 * clamp(s.vy / 9, 0, 1));
    let pop = 0;
    if (this.popT >= 0) {
      this.popT += dt;
      pop = Math.sin(clamp(this.popT / 0.14, 0, 1) * Math.PI) * 0.25;
    }
    const syScale = clamp(1 - sq * 0.22 + pop, 0.6, 1.4);
    const sxz = 1 / Math.sqrt(syScale);
    b.root.scale.set(sxz, syScale, sxz);

    // inclinación: carrera hacia delante, curvas y surf
    const turn = clamp(s.turnRate * 0.12, -0.5, 0.5);
    const leanTarget = run * 0.16 * clamp(this.moveDirZ, -0.4, 1) + clamp(laz * 0.006, -0.15, 0.15) + surf * -0.05;
    const bankTarget = -turn * (0.4 + surf * 0.9) - clamp(lax * 0.004, -0.1, 0.1);
    const lean = this.lean.update(leanTarget, dt);
    const bank = this.bank.update(bankTarget, dt);

    // ── pelvis
    const bob = moving * (0.018 + run * 0.02) * (0.5 - 0.5 * Math.cos(this.phase * 2));
    const idleBreath = Math.sin(t * 2.1) * 0.006 * (1 - moving);
    // ajuste al suelo de cada pie (raycast simple)
    const hipOffsetX = 0.1;
    let gL = 0;
    let gR = 0;
    if (grounded && groundAt && surf < 0.5) {
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? 1 : -1;
        const fx = s.x + (side * hipOffsetX) * cy + 0.05 * sy;
        const fz = s.z - (side * hipOffsetX) * sy + 0.05 * cy;
        const h = groundAt(fx, fz, s.y + 0.4);
        const off = h > -1e5 ? clamp(h - s.y, -0.3, 0.3) : 0;
        this.footGround[i] = lerp(this.footGround[i], off, 1 - Math.exp(-dt * 18));
      }
      gL = this.footGround[0];
      gR = this.footGround[1];
    } else {
      this.footGround[0] *= 0.8;
      this.footGround[1] *= 0.8;
    }
    const pelvisDrop = Math.min(0, gL, gR);
    const surfCrouch = surf * 0.13;
    const pelvisTarget = -bob + idleBreath + pelvisDrop - surfCrouch - crouch * 0.12 - air * 0.02;
    const py = this.pelvisY.update(pelvisTarget, dt);
    b.hips.position.set(Math.sin(t * 0.8) * 0.008 * (1 - moving), 0.58 + py, 0);
    b.hips.rotation.set(0, Math.sin(this.phase) * 0.12 * moving + surf * 0.9, Math.sin(this.phase) * 0.03 * moving);

    // ── piernas
    this.legs(dt, s, moving, run, air, surf, gL - pelvisDrop, gR - pelvisDrop, py);

    // ── columna y pecho
    const recoil = this.recoil.update(0, dt);
    const flinch = this.flinch.update(0, dt);
    const breathe = Math.sin(t * 2.1) * 0.02;
    const aimPitch = s.aimPitch || 0;
    let spineX = lean + crouch * 0.35 + surf * 0.1 - flinch * 0.03;
    let chestX = lean * 0.5 - recoil * 0.035 - aimPitch * 0.35 * aim + breathe * 0.3 - flinch * 0.04;
    let chestY = -surf * 0.95 + Math.sin(this.phase) * -0.1 * moving * (1 - aim) + flinch * 0.02 * Math.sin(t * 30);
    let chestZ = bank * 0.5 - s.aimYawOffset * 0.15;
    // cuerpo a cuerpo: giro rápido del torso
    let meleeK = 0;
    if (this.meleeT >= 0) {
      this.meleeT += dt;
      const m = this.meleeT / 0.38;
      if (m >= 1) this.meleeT = -1;
      else {
        meleeK = m < 0.3 ? -smooth(m / 0.3) : smooth(1 - (m - 0.3) / 0.7) * 1.6 - 0.6 * (1 - (m - 0.3) / 0.7);
        chestY += meleeK * 0.9;
        spineX += Math.max(0, meleeK) * 0.25;
      }
    }
    b.spine.rotation.set(spineX, 0, bank * 0.4);
    b.chest.rotation.set(chestX, chestY + s.aimYawOffset * 0.45 * aim, chestZ);
    b.chest.scale.set(1 + breathe * 0.1, 1 + breathe * 0.25, 1 + breathe * 0.1);
    b.neck.rotation.set(-aimPitch * 0.15, s.aimYawOffset * 0.2, 0);
    // cabeza: mira hacia el objetivo con leve retraso
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = 1.2 + Math.random() * 2.5;
      this.lookX = (Math.random() - 0.5) * 0.5 * (1 - aim);
      this.lookY = (Math.random() - 0.5) * 0.2 * (1 - aim);
    }
    const headYaw = s.aimYawOffset * 0.35 + this.lookX * (1 - moving * 0.7) - chestY * 0.6;
    const headPitch = -aimPitch * 0.45 + this.lookY + flinch * -0.06 + air * (s.vy < 0 ? 0.12 : -0.08);
    b.head.rotation.set(headPitch - chestX * 0.4, headYaw, -bank * 0.4 + flinch * 0.05);

    // ── brazos
    this.arms(dt, s, aim, moving, run, surf, air, recoil, meleeK, crouch);

    // ── movimiento secundario
    const tx = this.tankX.update(clamp(-laz * 0.012 + lean * 0.8 + recoil * 0.02, -0.6, 0.6), dt);
    const tz = this.tankZ.update(clamp(lax * 0.01 + bank, -0.5, 0.5), dt);
    b.tank.rotation.set(tx * 0.5, 0, tz * 0.4);
    const hx = this.hoodX.update(clamp(-laz * 0.015 + run * 0.25 + air * (s.vy < 0 ? -0.4 : 0.2), -0.7, 0.7), dt);
    b.hood.rotation.set(-hx * 0.6, 0, tz * 0.3);
    const antx = this.antX.update(clamp(-laz * 0.02 + run * 0.3 + (s.vy || 0) * -0.03, -1, 1), dt);
    const antz = this.antZ.update(clamp(lax * 0.02 + bank * 1.2, -1, 1), dt);
    b.antenna.rotation.set(antx * 0.8, 0, antz * 0.8);
    const scx = this.scarfX.update(clamp(-laz * 0.02 + run * 0.6 + surf * 0.8, -1.2, 1.2), dt);
    b.scarf.rotation.set(-0.3 - scx * 0.7, Math.sin(t * 9) * 0.1 * run, 0);
    // líquido: la superficie se inclina con la aceleración
    const liq = this.rig.liquidMat.uniforms;
    liq.uTilt.value.set(clamp(tz * 0.35, -0.3, 0.3), clamp(-tx * 0.35, -0.3, 0.3));
    liq.uTime.value = t;

    // ── visor: parpadeo, emociones, mirada
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    if (this.emotionTimer > 0) {
      this.emotionTimer -= dt;
      if (this.emotionTimer <= 0) this.emotion = 0;
    }
    let emotion = this.emotion;
    if (emotion === 0 && (s.firing || s.surfing)) emotion = 1;
    const vis = this.rig.visorMat.userData.visor;
    vis.uEmotion.value = s.dead ? 3 : emotion;
    vis.uBlink.value = emotion === 0 ? smooth(Math.min(1, this.blink * 1.3)) : 0;
    vis.uLook.value.set(clamp(this.lookX * 1.2 - s.aimYawOffset * 0.5, -1, 1), clamp(-this.lookY - aimPitch * 0.4, -1, 1));

    // destello de daño
    this.flash = Math.max(0, this.flash - dt * 6);
    this.rig.bodyMat.userData.inkUniforms.uFlash.value = Math.max(this.flash * 0.85, s.flashExtra || 0);
  }

  legs(dt, s, moving, run, air, surf, gL, gR, py) {
    const b = this.b;
    const cycle = clamp(0.8 + this.speed * 0.06, 0.8, 1.25);
    const quarter = cycle * 0.25 * clamp(this.speed / 2.5, 0, 1);
    const hipY = HIP_HEIGHT + py;
    const lift = 0.07 + run * 0.08;
    const dirX = this.moveDirX;
    const dirZ = this.moveDirZ;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const name = i === 0 ? 'L' : 'R';
      const ph = (this.phase + (i === 0 ? 0 : Math.PI)) % TAU;
      // pie: apoyo (0..π) y vuelo (π..2π)
      let off;
      let y;
      if (ph < Math.PI) {
        const u = ph / Math.PI;
        off = lerp(quarter, -quarter, u);
        y = 0;
      } else {
        const u = (ph - Math.PI) / Math.PI;
        off = lerp(-quarter, quarter, smooth(u));
        y = Math.sin(u * Math.PI) * lift;
      }
      let fx = side * 0.1 + dirX * off * moving;
      let fz = dirZ * off * moving + 0.02;
      let fy = LEG.footH + y * moving + (i === 0 ? gL : gR);
      // postura de surf: pie delantero adelantado, trasero atrás y abierto
      if (surf > 0.01) {
        const sfx = side * 0.16;
        const sfz = side * 0.2;
        fx = lerp(fx, sfx, surf);
        fz = lerp(fz, sfz, surf);
        fy = lerp(fy, LEG.footH, surf);
      }
      // en el aire: recoger (subiendo) o estirar (cayendo)
      if (air > 0.01) {
        const up = s.vy > 0 ? 1 : 0;
        const tuck = up ? 0.2 : 0.06;
        fy = lerp(fy, LEG.footH + tuck + (i === 0 ? 0.03 : 0), air);
        fz = lerp(fz, (i === 0 ? 0.08 : -0.06) + (up ? 0.05 : 0), air);
        fx = lerp(fx, side * 0.11, air);
      }
      // IK de 2 huesos en el plano sagital (+ pequeña abducción)
      const hx = side * 0.1;
      const dx = fx - hx;
      const dy = fy - hipY;
      const dz = fz;
      const a = LEG.thigh;
      const bb = LEG.shin;
      const lenSag = Math.hypot(dy, dz);
      const L = clamp(Math.hypot(lenSag, dx), 0.08, a + bb - 0.002);
      const alpha = Math.acos(clamp((a * a + L * L - bb * bb) / (2 * a * L), -1, 1));
      const beta = Math.acos(clamp((a * a + bb * bb - L * L) / (2 * a * bb), -1, 1));
      const thetaD = Math.atan2(dz, -dy); // + hacia delante
      const thighX = -(thetaD + alpha);
      const kneeX = Math.PI - beta;
      const abd = Math.atan2(dx, -dy);
      b['thigh' + name].rotation.set(thighX, 0, abd);
      b['shin' + name].rotation.set(kneeX, 0, 0);
      // pie paralelo al suelo con balanceo de punta en el despegue
      const toe = ph >= Math.PI ? Math.sin(((ph - Math.PI) / Math.PI) * Math.PI) * 0.35 * moving : 0;
      b['foot' + name].rotation.set(-(thighX + kneeX) - toe, 0, -abd);
    }
  }

  arms(dt, s, aim, moving, run, surf, air, recoil, meleeK, crouch) {
    const b = this.b;
    const phase = this.phase;
    const swing = Math.sin(phase) * (0.35 + run * 0.4) * moving;
    const w = s.weapon;
    const aimPitch = s.aimPitch || 0;

    // Brazo derecho (arma)
    let rUx;
    let rUz;
    let rFx;
    let lUx;
    let lUz;
    let lFx;
    if (w === 'roller') {
      // manos en el mango: rodillo bajado hacia delante
      const low = s.rolling ? 1 : 0.6;
      rUx = lerp(-0.55, -0.85, low);
      rUz = -0.25;
      rFx = -0.5;
      lUx = lerp(-0.75, -1.0, low);
      lUz = -0.35;
      lFx = -0.7;
      rUx += swing * 0.2 * (1 - low);
      // barrido vertical: el rodillo sube por detrás y cae delante
      if (this.flickT >= 0) {
        this.flickT += dt;
        const f = this.flickT / 0.45;
        if (f >= 1) this.flickT = -1;
        else {
          const k = f < 0.35 ? smooth(f / 0.35) : 1 - easeOutBack(clamp((f - 0.35) / 0.65, 0, 1));
          rUx = lerp(rUx, -3.0, k);
          lUx = lerp(lUx, -2.9, k);
          rFx = lerp(rFx, -0.2, k);
          lFx = lerp(lFx, -0.3, k);
        }
      }
    } else {
      // pistola / splasher: relajada a la cadera, apuntada al disparar
      const relaxedUx = -0.35 + swing * 0.3;
      const aimedUx = -1.35 - aimPitch * 0.75;
      rUx = lerp(relaxedUx, aimedUx, aim) - recoil * 0.05;
      rUz = lerp(-0.12, -0.02, aim);
      rFx = lerp(-0.55, -0.25, aim) - recoil * 0.06;
      lUx = lerp(-swing * 0.9 - 0.1, -1.25 - aimPitch * 0.7, aim);
      lUz = lerp(0.08 + run * 0.1, -0.52, aim);
      lFx = lerp(-0.35 - run * 0.4, -0.75, aim);
    }
    // surf: brazos abiertos para equilibrarse
    if (surf > 0.01) {
      rUx = lerp(rUx, -0.3, surf);
      rUz = lerp(rUz, -1.2, surf);
      rFx = lerp(rFx, -0.2, surf);
      lUx = lerp(lUx, -0.5, surf);
      lUz = lerp(lUz, 1.25, surf);
      lFx = lerp(lFx, -0.3, surf);
    }
    // en el aire: brazos arriba al caer
    if (air > 0.01 && surf < 0.5) {
      const falling = s.vy < -1 ? 1 : 0;
      lUz = lerp(lUz, 0.6 + falling * 0.5, air * 0.7);
      lUx = lerp(lUx, -0.5 - falling * 0.6, air * 0.7);
      if (aim < 0.5) {
        rUz = lerp(rUz, -0.5 - falling * 0.4, air * 0.6);
        rUx = lerp(rUx, -0.6 - falling * 0.4, air * 0.6);
      }
    }
    // recarga: el brazo derecho palmea el tanque
    if (s.reloading >= 0) {
      const r = Math.sin(s.reloading * Math.PI);
      lUx = lerp(lUx, 0.6, r);
      lUz = lerp(lUz, 0.9, r);
      lFx = lerp(lFx, -1.8, r);
    }
    // cuerpo a cuerpo: golpe con el arma en arco horizontal
    if (meleeK !== 0) {
      rUx = lerp(rUx, -1.5, Math.min(1, Math.abs(meleeK)));
      rUz = rUz + meleeK * 0.9;
    }
    // cambio de arma: el brazo sube por encima del hombro
    let weaponSpin = 0;
    if (this.switchT >= 0) {
      this.switchT += dt / 0.42;
      const k = this.switchT;
      if (k >= 1) {
        this.switchT = -1;
      } else {
        const up = Math.sin(k * Math.PI);
        rUx = lerp(rUx, -2.7, up);
        rUz = lerp(rUz, -0.4, up);
        rFx = lerp(rFx, -1.3, up);
        weaponSpin = k < 0.5 ? smooth(k / 0.5) * Math.PI : (1 - smooth((k - 0.5) / 0.5)) * Math.PI;
        if (k >= 0.5 && !this.weaponSwapped) this.weaponSwapped = true;
      }
    }
    this.weaponSpin = weaponSpin;
    // agacharse mueve los brazos hacia delante
    rUx -= crouch * 0.2;
    lUx -= crouch * 0.2;
    b.upperArmR.rotation.set(rUx, 0, rUz);
    b.foreArmR.rotation.set(rFx, 0, 0);
    b.handR.rotation.set(-0.1, 0, 0);
    b.upperArmL.rotation.set(lUx, 0, lUz);
    b.foreArmL.rotation.set(lFx, 0, 0);
    b.handL.rotation.set(0, 0, 0);
    b.shoulderL.rotation.set(0, 0, Math.sin(this.t * 2.1) * 0.02 * (1 - moving));
    b.shoulderR.rotation.set(0, 0, -Math.sin(this.t * 2.1) * 0.02 * (1 - moving));
  }
}

export { Spring };
export const _v = new THREE.Vector3();
