import * as THREE from 'three';
import { AI, PLAYER, WEAPONS } from '../config.js';
import { bus } from '../core/EventBus.js';
import { NavGraph } from './NavGraph.js';
import { PERSONALITIES, WEAPON_RANGES } from './BotPersonalities.js';

// ─────────────────────────────────────────────────────────────
//  EnemyAI · cerebros de los bots (aliados y rivales)
//  Cada bot piensa a 10 Hz (percepción → utilidad → plan) y actúa en
//  cada fotograma (dirección, puntería, disparo). Estados:
//  PINTAR ZONAS, COMBATIR, FLANQUEAR, RETIRARSE Y RECARGAR, REAGRUPARSE.
//  Dirección = seguir ruta A* + separación + evitar huecos + saltos.
// ─────────────────────────────────────────────────────────────

export const STATE = {
  PAINT: 'PINTAR',
  FIGHT: 'COMBATIR',
  FLANK: 'FLANQUEAR',
  RETREAT: 'RETIRARSE',
  REGROUP: 'REAGRUPARSE'
};

const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const _a = new THREE.Vector3();
const _cell = { team: -1, floor: 0, height: 0, cover: 0 };

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function projectileBlock(s) {
  return s.blocksProjectiles;
}

function walkBlock(s) {
  return s.blocksMovement;
}

function laneOf(x) {
  return x < -13 ? 'west' : x > 13 ? 'east' : 'center';
}

class BotBrain {
  constructor(ai, character, personality, lane, index) {
    this.ai = ai;
    this.c = character;
    this.P = personality;
    this.lane = lane;
    this.thinkAcc = index / (AI.thinkRate * 6);
    this.aim = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3(), distance: 20 };
    this.targetPos = new THREE.Vector3();
    this.paintPoint = new THREE.Vector3();
    this.goalPos = new THREE.Vector3();
    this.errPhase = [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28];
    // coste extra de A* por pasar cerca del objetivo (flanquear / huir)
    this.linkCost = (a, b) => {
      const until = this.badLinks.get(a.id * 4096 + b.id);
      return until !== undefined && until > this.ai.now ? 60 : 0;
    };
    this.dangerCost = (a, b) => {
      let extra = this.linkCost(a, b);
      if (!this.target) return extra;
      const d = Math.hypot(b.x - this.targetPos.x, b.z - this.targetPos.z);
      if (d < 12) extra += (12 - d) * 1.6;
      return extra;
    };
    this.reset();
  }

  reset() {
    this.state = STATE.PAINT;
    this.stateT = 0;
    this.path = null;
    this.pathI = 0;
    this.goal = null;
    this.goalT = 0;
    this.target = null;
    this.targetVisible = false;
    this.targetSeen = -99;
    this.trackT = 0;
    this.reactT = 0;
    this.threat = null;
    this.threatT = -99;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 0;
    this.fwdBias = 0;
    this.jumpCd = 0;
    this.stuckT = 0;
    this.stuckJumped = false;
    this.progressNode = null;
    this.progressBest = 0;
    this.badLinks = new Map();
    this.hasPaintPoint = false;
    this.paintPointT = 0;
    this.direct = false;
    this.perch = null;
    this.perchCd = 0;
    this.flankCd = rand(4, 10);
    this.switchCd = 0;
    this.wantWeapon = -1;
    this.reloadCd = 0;
    this.enemiesSeen = 0;
    this.allyDist = 0;
    this.aimYaw = this.c.bodyYaw;
    this.aimPitch = 0;
    this.lookAt = null;
    this.sinceSpawn = 0;
  }

  get pos() {
    return this.c.position;
  }

  distTo(ch) {
    const p = this.pos;
    const q = ch.position;
    return Math.hypot(q.x - p.x, q.z - p.z);
  }

  onDamaged(e) {
    const a = e.attacker;
    if (!a || a.team === this.c.team || !a.alive) return;
    this.threat = a;
    this.threatT = this.ai.now;
    if (!this.target || !this.targetVisible) {
      this.target = a;
      this.targetPos.copy(a.position);
      this.targetSeen = this.ai.now;
      this.reactT = rand(AI.reactionMin, AI.reactionMax) * this.P.reaction * 1.15;
    }
  }

  onRespawn() {
    this.reset();
    this.aimYaw = this.c.bodyYaw;
    this.goalT = 0;
  }

  // ── pensar (10 Hz) ────────────────────────────────────────

  think(dt) {
    const c = this.c;
    if (!c.alive || c.motor.locked) {
      this.path = null;
      return;
    }
    this.sinceSpawn += dt;
    this.stateT += dt;
    this.goalT -= dt;
    this.flankCd -= dt;
    this.perchCd -= dt;
    this.switchCd -= dt;
    this.reloadCd -= dt;
    this.perceive();
    this.decide();
    this.plan();
    this.choosePaintPoint(dt);
    this.chooseWeapon();
    this.smoothPath();
  }

  /** Visión (cono de 150°, 34 m, línea de visión) y oído cercano. */
  perceive() {
    const ai = this.ai;
    const c = this.c;
    const now = ai.now;
    const head = c.headPosition(_a);
    let best = null;
    let bestScore = -Infinity;
    let seen = 0;
    const half = (AI.fovDeg * DEG) / 2;
    for (const e of ai.characters) {
      if (e.team === c.team || !e.alive || !e.visible || e.motor.locked) continue;
      const ep = e.position;
      const dx = ep.x - head.x;
      const dz = ep.z - head.z;
      const d = Math.hypot(dx, dz);
      if (d > AI.viewDistance) continue;
      const recentThreat = e === this.threat && now - this.threatT < 2;
      const heard = d < 8 || (e.firing && d < 15);
      const inCone = Math.abs(angleDiff(this.aimYaw, Math.atan2(dx, dz))) < half;
      if (!inCone && !heard && !recentThreat) continue;
      if (!ai.collision.lineOfSight(head.x, head.y, head.z, ep.x, ep.y + 0.9, ep.z, projectileBlock)) {
        if (!ai.collision.lineOfSight(head.x, head.y, head.z, ep.x, ep.y + 1.3, ep.z, projectileBlock)) continue;
      }
      seen++;
      let score = -d;
      if (e === this.target) score += 6;
      if (recentThreat) score += 8;
      if (e.hp < 45) score += 4;
      if (e.invulnerable) score -= 12;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    this.enemiesSeen = seen;
    if (best) {
      if (best !== this.target) {
        this.target = best;
        this.reactT = rand(AI.reactionMin, AI.reactionMax) * this.P.reaction;
        this.trackT = 0;
      } else if (!this.targetVisible) {
        // reaparece tras perderlo: reacción corta
        this.reactT = Math.max(this.reactT, 0.12);
      }
      this.targetVisible = true;
      this.targetSeen = now;
      this.targetPos.copy(best.position);
    } else {
      this.targetVisible = false;
      if (this.target && (!this.target.alive || now - this.targetSeen > 2.2 + this.P.chase)) this.target = null;
    }
    // aliado más cercano
    let ad = Infinity;
    for (const o of ai.characters) {
      if (o === c || o.team !== c.team || !o.alive) continue;
      ad = Math.min(ad, this.distTo(o));
    }
    this.allyDist = ad;
  }

  /** Utilidad de cada estado con histéresis. */
  decide() {
    const c = this.c;
    const w = this.P.weights;
    const ink = c.weapons.ink;
    const hp = c.hp;
    const tgt = this.target;
    const d = tgt ? this.pos.distanceTo(this.targetPos) : 99;
    const range = WEAPON_RANGES[c.weapons.weaponId];

    const u = {};
    u[STATE.PAINT] = (0.45 + (tgt ? 0 : 0.25)) * w.paint * (ink < this.P.inkReserve ? 0.6 : 1);
    let fight = 0;
    if (tgt) {
      fight = (this.targetVisible ? 0.75 : 0.42) * w.fight + clamp(1 - d / 30, 0, 1) * 0.35;
      if (tgt.hp < 45) fight += 0.15;
      if (hp < AI.lowHP) fight -= 0.35;
      if (ink < AI.lowInk) fight -= 0.45;
      if (tgt.invulnerable) fight -= 0.3;
    }
    u[STATE.FIGHT] = fight;
    let flank = 0;
    if (tgt && this.flankCd <= 0 && hp > 55 && ink > 45) {
      if (!this.targetVisible) flank = 0.72 * w.flank + 0.15;
      else if (this.state === STATE.FIGHT && this.stateT > 6 && tgt.hp > 50) flank = 1.2 * w.flank; // tablas: probar por el lado
    }
    u[STATE.FLANK] = flank;
    let retreat = 0;
    if (ink < AI.lowInk) retreat = 0.95 * w.retreat;
    if (hp < AI.lowHP && tgt) retreat = Math.max(retreat, 0.9 * w.retreat - (this.targetVisible && d < 7 ? 0.35 : 0));
    // retirándose: seguir hasta haberse recuperado
    if (this.state === STATE.RETREAT && (ink < 80 || hp < 70) && this.stateT < 9) retreat = Math.max(retreat, 0.8 * w.retreat);
    u[STATE.RETREAT] = retreat;
    let regroup = 0;
    if (this.allyDist > 24 && this.allyDist < Infinity && (this.enemiesSeen >= 2 || hp < 60)) regroup = 0.62 * w.regroup;
    u[STATE.REGROUP] = regroup;

    u[this.state] += 0.15;
    let best = this.state;
    for (const k in u) if (u[k] > u[best]) best = k;
    const urgent = best === STATE.FIGHT || best === STATE.RETREAT;
    if (best !== this.state && (this.stateT > 0.7 || urgent)) this.setState(best);
  }

  setState(s) {
    if (s === STATE.FLANK) this.flankCd = rand(10, 16);
    this.state = s;
    this.stateT = 0;
    this.path = null;
    this.goal = null;
    this.goalT = 0;
    this.perch = null;
  }

  /** Elige destino y ruta según el estado. */
  plan() {
    const ai = this.ai;
    const p = this.pos;
    const c = this.c;
    this.direct = false;
    switch (this.state) {
      case STATE.PAINT:
        if (!this.path || this.pathI >= this.path.length || this.goalT <= 0) {
          this.setGoal(this.pickPaintGoal(), rand(5, 9));
        }
        break;
      case STATE.FIGHT: {
        const tp = this.targetPos;
        const d = Math.hypot(tp.x - p.x, tp.z - p.z);
        // francotirador: buscar una posición elevada cercana
        if (this.P.height > 0 && this.targetVisible && this.perchCd <= 0 && p.y < 1 && c.weapons.weaponId === 'blaster') {
          this.perchCd = 6;
          const perch = this.pickPerch();
          if (perch) {
            this.perch = perch;
            this.setGoal(perch, 6);
          }
        }
        if (this.perch) {
          if (this.path && this.pathI < this.path.length && this.goalT > 0) break;
          this.perch = null;
          this.path = null;
        }
        const dy = Math.abs(tp.y - p.y);
        if (this.targetVisible && d < 20 && dy < 1.2 && ai.collision.lineOfSight(p.x, p.y + 0.5, p.z, tp.x, tp.y + 0.5, tp.z, walkBlock)) {
          this.direct = true;
          this.path = null;
        } else if (!this.path || this.pathI >= this.path.length || this.goalT <= 0) {
          this.setGoal(ai.nav.nearest(tp.x, tp.y, tp.z), AI.repathInterval);
        }
        break;
      }
      case STATE.FLANK:
        if (!this.goal) {
          const g = this.pickFlank();
          if (!g) {
            this.setState(STATE.FIGHT);
            return;
          }
          this.setGoal(g, 9);
        } else if (this.pathI >= (this.path ? this.path.length : 0) || this.goalT <= 0 || (this.targetVisible && this.stateT > 2.5)) {
          this.setState(this.target ? STATE.FIGHT : STATE.PAINT);
        }
        break;
      case STATE.RETREAT:
        if (!this.path || this.pathI >= this.path.length || this.goalT <= 0) this.setGoal(this.pickRetreat(), 4);
        break;
      case STATE.REGROUP: {
        if (!this.path || this.pathI >= this.path.length || this.goalT <= 0) {
          let ally = null;
          let bd = Infinity;
          for (const o of ai.characters) {
            if (o === c || o.team !== c.team || !o.alive) continue;
            const dd = this.distTo(o);
            if (dd < bd) {
              bd = dd;
              ally = o;
            }
          }
          if (!ally || bd < 7) {
            this.setState(STATE.PAINT);
            return;
          }
          this.setGoal(ai.nav.nearest(ally.position.x, ally.position.y, ally.position.z), 2);
        }
        break;
      }
    }
  }

  setGoal(node, time) {
    const ai = this.ai;
    const p = this.pos;
    this.goalT = time;
    if (!node) {
      this.path = null;
      return;
    }
    const start = ai.nav.nearest(p.x, p.y, p.z);
    const path = ai.nav.path(start, node, this.state === STATE.FLANK || this.state === STATE.RETREAT ? this.dangerCost : this.linkCost);
    this.goal = node;
    this.goalPos.set(node.x, node.y, node.z);
    this.path = path;
    this.pathI = 0;
    // saltar el primer nodo si ya lo hemos dejado atrás
    if (path && path.length > 1) {
      const a = path[0];
      const b = path[1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      if ((p.x - a.x) * abx + (p.z - a.z) * abz > 0) this.pathI = 1;
    }
  }

  /** Nodo con más terreno por pintar, sesgado hacia su carril y el frente. */
  pickPaintGoal() {
    const ai = this.ai;
    const c = this.c;
    const p = this.pos;
    const team = c.team;
    let best = null;
    let bestScore = -Infinity;
    const early = this.sinceSpawn < 25 && ai.matchTime < 70;
    for (const n of ai.nav.nodes) {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < 4) continue;
      const fwd = team === 0 ? (n.z + 60) / 120 : (60 - n.z) / 120;
      if (fwd > 0.86) continue; // no acampar en la base rival
      let notOwn = 0;
      let enemy = 0;
      let floor = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          ai.paint.cellAt(n.x + i * 2.2, n.z + j * 2.2, _cell);
          if (!_cell.floor) continue;
          floor++;
          if (_cell.team !== team) notOwn++;
          if (_cell.team === 1 - team) enemy++;
        }
      }
      if (!floor) continue;
      let score = (notOwn / floor) * 1.1 + (enemy / floor) * 0.45;
      score += (this.P.forward + Math.min(0.35, ai.matchTime / 300)) * Math.min(fwd, 0.7);
      if (laneOf(n.x) === this.lane) score += early ? 0.55 : 0.25;
      score -= d / 50;
      // no amontonarse con compañeros
      for (const o of ai.bots) {
        if (o === this || o.c.team !== team || !o.goal) continue;
        if (Math.hypot(o.goal.x - n.x, o.goal.z - n.z) < 9) score -= 0.35;
      }
      if (this.target && Math.hypot(this.targetPos.x - n.x, this.targetPos.z - n.z) < 10) score -= 0.25 * this.P.weights.retreat;
      score += Math.random() * 0.22;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  /** Nodo lateral al objetivo (ángulo grande respecto a la línea bot-objetivo). */
  pickFlank() {
    const ai = this.ai;
    const p = this.pos;
    const tp = this.targetPos;
    const bx = p.x - tp.x;
    const bz = p.z - tp.z;
    const bl = Math.hypot(bx, bz) || 1;
    let best = null;
    let bestScore = -Infinity;
    for (const n of ai.nav.nodes) {
      const nx = n.x - tp.x;
      const nz = n.z - tp.z;
      const nd = Math.hypot(nx, nz);
      if (nd < 5 || nd > 15) continue;
      const cos = (nx * bx + nz * bz) / (nd * bl);
      if (cos > 0.45) continue;
      const travel = Math.hypot(n.x - p.x, n.z - p.z);
      if (travel > 34) continue;
      const score = (1 - cos) + (n.y > 0.8 ? 0.3 : 0) - travel / 40 + Math.random() * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  /** Posición elevada con visión del objetivo a buena distancia. */
  pickPerch() {
    const ai = this.ai;
    const p = this.pos;
    const tp = this.targetPos;
    let best = null;
    let bestScore = -Infinity;
    for (const n of ai.nav.nodes) {
      if (n.y < 0.9) continue;
      const travel = Math.hypot(n.x - p.x, n.z - p.z);
      if (travel > 12) continue;
      const dt = Math.hypot(n.x - tp.x, n.z - tp.z);
      if (dt < 8 || dt > 21) continue;
      if (!ai.collision.lineOfSight(n.x, n.y + 1.3, n.z, tp.x, tp.y + 1, tp.z, projectileBlock)) continue;
      const score = n.y * 0.4 - travel / 8 - Math.abs(dt - 14) / 10;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  /** Refugio: pintura propia, lejos del enemigo, hacia casa. */
  pickRetreat() {
    const ai = this.ai;
    const c = this.c;
    const p = this.pos;
    const team = c.team;
    let best = null;
    let bestScore = -Infinity;
    for (const n of ai.nav.nodes) {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d > 30 || d < 3) continue;
      let own = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (ai.paint.paintAt(n.x + i * 2, n.z + j * 2) === team) own++;
      const back = team === 0 ? (-n.z + 60) / 120 : (n.z + 60) / 120;
      let score = (own / 9) * 1.5 + back * 0.5 - d / 45;
      if (this.target) {
        const td = Math.hypot(n.x - this.targetPos.x, n.z - this.targetPos.z);
        if (td < 14) score -= ((14 - td) / 14) * 1.4;
        if (!ai.collision.lineOfSight(n.x, n.y + 1, n.z, this.targetPos.x, this.targetPos.y + 1, this.targetPos.z, projectileBlock)) score += 0.35;
      }
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  /** Punto del suelo sin pintar al que disparar mientras se avanza (se mantiene un rato). */
  choosePaintPoint(dt) {
    const ai = this.ai;
    const c = this.c;
    const p = this.pos;
    const wid = c.weapons.weaponId;
    if (wid === 'roller') {
      this.hasPaintPoint = false;
      return;
    }
    const range = WEAPONS[wid].range;
    this.paintPointT -= dt;
    if (this.hasPaintPoint) {
      const pp = this.paintPoint;
      const d = Math.hypot(pp.x - p.x, pp.z - p.z);
      const done = ai.paint.paintAt(pp.x, pp.z) === c.team;
      if (!done && this.paintPointT > 0 && d > 1.5 && d < range * 0.8) return;
    }
    this.hasPaintPoint = false;
    const v = c.motor.vel;
    const sp = Math.hypot(v.x, v.z);
    const base = sp > 1 ? Math.atan2(v.x, v.z) : this.aimYaw;
    const onEnemy = c.motor.paint === -1;
    let bestScore = 0.4;
    for (let k = 0; k < 12; k++) {
      // cerca del punto anterior para barrer en vez de saltar de lado a lado
      const ang = base + (k < 6 ? angleDiff(base, this.aimYaw) * 0.6 + rand(-0.5, 0.5) : rand(-1.2, 1.2));
      const dist = onEnemy && k < 4 ? rand(1.8, 3.5) : rand(3, range * 0.55);
      const x = p.x + Math.sin(ang) * dist;
      const z = p.z + Math.cos(ang) * dist;
      ai.paint.cellAt(x, z, _cell);
      if (!_cell.floor || Math.abs(_cell.height - p.y) > 1.6) continue;
      let score = _cell.team === c.team ? 0 : _cell.team === -1 ? 1 : 1.25;
      if (score <= 0) continue;
      score += Math.random() * 0.3 - Math.abs(dist - range * 0.35) / range + (k < 6 ? 0.15 : 0);
      if (score <= bestScore) continue;
      if (!ai.collision.lineOfSight(p.x, p.y + 1.2, p.z, x, _cell.height + 0.25, z, projectileBlock)) continue;
      bestScore = score;
      this.paintPoint.set(x, _cell.height, z);
      this.hasPaintPoint = true;
    }
    this.paintPointT = rand(0.5, 0.9);
  }

  /** Arma adecuada a la situación (con pausa entre cambios). */
  chooseWeapon() {
    const c = this.c;
    const ws = c.weapons;
    if (this.switchCd > 0 || ws.switchT >= 0 || ws.reloadT >= 0) return;
    let want = 0; // arma principal por defecto
    if (this.state === STATE.FIGHT && this.target && ws.weapons.length > 1) {
      const d = this.pos.distanceTo(this.targetPos);
      let bestScore = -Infinity;
      for (let i = 0; i < ws.weapons.length; i++) {
        const r = WEAPON_RANGES[ws.weapons[i].id];
        const off = d < r[0] ? r[0] - d : d > r[1] ? d - r[1] : 0;
        const score = -off / 4 + (i === 0 ? 0.6 : 0);
        if (score > bestScore) {
          bestScore = score;
          want = i;
        }
      }
    }
    if (want !== ws.index) {
      this.wantWeapon = want;
      this.switchCd = rand(3.5, 5);
    }
  }

  /** Atajo: saltarse el nodo actual si el siguiente ya es alcanzable en línea recta. */
  smoothPath() {
    const path = this.path;
    if (!path || this.pathI + 1 >= path.length) return;
    const p = this.pos;
    const next = path[this.pathI + 1];
    if (Math.hypot(next.x - p.x, next.z - p.z) > 13) return;
    if (!this.c.motor.grounded) return;
    const r = this.ai.nav.walkTest({ x: p.x, y: p.y, z: p.z }, next);
    if (r && !r.jump) this.pathI++;
  }

  // ── actuar (cada fotograma) ───────────────────────────────

  act(dt) {
    const c = this.c;
    const it = c.intent;
    const m = c.motor;
    it.fire = false;
    it.firePressed = false;
    it.jump = false;
    it.jumpHeld = true;
    it.reload = false;
    it.melee = false;
    it.switchTo = -1;
    it.switchDelta = 0;
    it.aim = false;
    it.run = false;
    it.moveX = 0;
    it.moveZ = 0;
    if (!c.alive || m.locked) {
      it.lookYaw = this.aimYaw;
      it.lookPitch = this.aimPitch;
      return;
    }
    this.jumpCd -= dt;
    if (this.reactT > 0 && this.targetVisible) this.reactT -= dt;
    if (this.targetVisible) this.trackT += dt;
    if (this.wantWeapon >= 0) {
      it.switchTo = this.wantWeapon;
      this.wantWeapon = -1;
    }

    const p = this.pos;
    const ws = c.weapons;
    const wid = ws.weaponId;
    const fighting = !!this.target && this.targetVisible;
    const d = this.target ? Math.hypot(this.targetPos.x - p.x, this.targetPos.z - p.z) : 99;

    // ── dirección de movimiento
    let mx = 0;
    let mz = 0;
    if (this.state === STATE.FIGHT && this.direct && this.target) {
      const r = this.combatMove(dt, d);
      mx = r.x;
      mz = r.z;
    } else {
      const r = this.followPath();
      mx = r.x;
      mz = r.z;
      // pintando o huyendo: pequeño zigzag para no ser un blanco fácil
      if (fighting && (mx || mz)) {
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          this.strafeT = rand(AI.strafeChangeMin, AI.strafeChangeMax);
          this.strafeDir *= -1;
        }
        mx += -mz * this.strafeDir * 0.35;
        mz += r.x * this.strafeDir * 0.35;
      }
    }
    // separación
    for (const o of this.ai.characters) {
      if (o === c || !o.alive) continue;
      const dx = p.x - o.position.x;
      const dz = p.z - o.position.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 1e-3 && dd < AI.separationRadius) {
        const k = ((AI.separationRadius - dd) / AI.separationRadius) * 1.4;
        mx += (dx / dd) * k;
        mz += (dz / dd) * k;
      }
    }
    let ml = Math.hypot(mx, mz);
    if (ml > 1e-3) {
      mx /= ml;
      mz /= ml;
      // huecos (agua): nunca caminar hacia el vacío
      if (!this.safeAhead(mx, mz)) {
        const sx = -mz;
        const sz = mx;
        if (this.safeAhead(sx, sz)) {
          mx = sx;
          mz = sz;
        } else if (this.safeAhead(-sx, -sz)) {
          mx = -sx;
          mz = -sz;
        } else {
          mx = -mx;
          mz = -mz;
        }
        this.strafeDir *= -1;
      }
      this.jumpObstacles(mx, mz);
    }
    it.moveX = mx;
    it.moveZ = mz;
    ml = Math.hypot(mx, mz);

    // atascado: sin progreso hacia el nodo actual → saltar; si sigue, otra ruta
    const speed = Math.hypot(m.vel.x, m.vel.z);
    const node = this.path && this.pathI < this.path.length ? this.path[this.pathI] : null;
    if (node && !this.direct) {
      const nd = Math.hypot(node.x - p.x, node.z - p.z) + Math.abs(node.y - p.y);
      if (node !== this.progressNode || nd < this.progressBest - 0.4) {
        this.progressNode = node;
        this.progressBest = nd;
        this.stuckT = 0;
        this.stuckJumped = false;
      } else {
        this.stuckT += dt;
      }
    } else if (ml > 0.3 && speed < 1.1 && m.grounded) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.8 && !this.stuckJumped) {
      this.doJump();
      this.stuckJumped = true;
    }
    if (this.stuckT > 2.2) {
      this.stuckT = 0;
      this.stuckJumped = false;
      this.strafeDir *= -1;
      this.progressNode = null;
      // evitar esa arista un rato y buscar un rodeo
      if (node && this.pathI > 0) this.badLinks.set(this.path[this.pathI - 1].id * 4096 + node.id, this.ai.now + 12);
      const n = this.ai.nav.randomNear(p.x, p.z, 12);
      this.setGoal(n, 3);
    }

    // ── puntería
    let aimX;
    let aimY;
    let aimZ;
    let wantFire = false;
    let precise = false;
    if (fighting) {
      const t = this.target;
      const tp = t.position;
      const cfg = WEAPONS[wid];
      const spd = cfg.projectileSpeed || 30;
      const tt = d / spd;
      const lead = this.P.lead;
      aimX = tp.x + t.velocity.x * tt * lead;
      aimZ = tp.z + t.velocity.z * tt * lead;
      aimY = tp.y + 0.8 + (cfg.projectileGravity || 0) * 0.5 * tt * tt * 0.9;
      precise = true;
    } else if (this.hasPaintPoint && ws.ink > this.inkFloor()) {
      aimX = this.paintPoint.x;
      aimY = this.paintPoint.y;
      aimZ = this.paintPoint.z;
      const dist = Math.hypot(aimX - p.x, aimZ - p.z);
      const g = WEAPONS[wid].projectileGravity || 0;
      const tt = dist / (WEAPONS[wid].projectileSpeed || 30);
      aimY += g * 0.5 * tt * tt * 0.8;
      wantFire = true;
    } else if (this.target) {
      aimX = this.targetPos.x;
      aimY = this.targetPos.y + 1;
      aimZ = this.targetPos.z;
    } else {
      // mirar hacia donde se va
      const v = m.vel;
      const sp = Math.hypot(v.x, v.z);
      const dir = sp > 0.5 ? Math.atan2(v.x, v.z) : this.aimYaw;
      aimX = p.x + Math.sin(dir) * 10;
      aimY = p.y + 1.1;
      aimZ = p.z + Math.cos(dir) * 10;
    }
    const head = c.headPosition(_a);
    const dx = aimX - head.x;
    const dy = aimY - head.y;
    const dz = aimZ - head.z;
    const hd = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(dx, dz);
    const wantPitch = clamp(Math.atan2(dy, hd), -1.0, 1.0);
    const trackK = 1 - Math.exp(-AI.aimTrackSpeed * dt * (precise ? 1 : 0.8));
    this.aimYaw += angleDiff(this.aimYaw, wantYaw) * trackK;
    this.aimPitch += (wantPitch - this.aimPitch) * trackK;
    const aimErr = Math.hypot(angleDiff(this.aimYaw, wantYaw), wantPitch - this.aimPitch);

    // error humano: oscilación lenta que se reduce de cerca y al seguir al objetivo
    let yaw = this.aimYaw;
    let pitch = this.aimPitch;
    if (precise) {
      const k = clamp((d - 3) / 19, 0, 1);
      let err = (AI.aimErrorNear + (AI.aimErrorFar - AI.aimErrorNear) * k) * DEG * this.P.aimSkill;
      if (this.trackT > 1.5) err *= 0.75;
      const tv = this.target.velocity;
      if (Math.hypot(tv.x, tv.z) > 4) err *= 1.25;
      const now = this.ai.now;
      const ph = this.errPhase;
      yaw += err * (Math.sin(now * 1.9 + ph[0]) * 0.65 + Math.sin(now * 4.3 + ph[1]) * 0.35);
      pitch += err * 0.6 * (Math.sin(now * 2.3 + ph[2]) * 0.6 + Math.sin(now * 3.7 + ph[3]) * 0.4);
    }
    const cp = Math.cos(pitch);
    const aim = this.aim;
    aim.origin.copy(head);
    aim.dir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    const aimDist = Math.max(2, Math.hypot(hd, dy));
    aim.point.copy(head).addScaledVector(aim.dir, aimDist);
    aim.distance = aimDist;
    it.lookYaw = this.aimYaw;
    it.lookPitch = this.aimPitch;

    // ── disparo
    if (precise) {
      const tol = Math.max(5 * DEG, Math.atan2(0.8, d));
      const cfg = WEAPONS[wid];
      const inRange = d < (wid === 'roller' ? 5 : cfg.range * 1.05);
      if (this.reactT <= 0 && aimErr < tol && inRange && ws.ink > 1) {
        if (wid === 'roller') {
          if (d < 2.2) it.fire = true; // arrollar
          else if (ws.current.cooldown <= 0) it.firePressed = true; // barrido
        } else {
          it.fire = true;
          it.aim = this.useAim && d > 9;
        }
      }
      if (d < 1.6 && ws.meleeCd <= 0 && Math.random() < dt * 3 * (this.P.id === 'agresivo' ? 2 : 1)) it.melee = true;
    } else if (wantFire && aimErr < 10 * DEG) {
      it.fire = true;
    } else if (wid === 'roller' && ml > 0.3 && ws.ink > this.inkFloor()) {
      // el rodillo pinta al rodar si el suelo delante no es propio
      const ax = p.x + mx * 1.2;
      const az = p.z + mz * 1.2;
      if (this.ai.paint.paintAt(ax, az) !== c.team) it.fire = true;
    }

    // ── recarga
    const safe = !this.targetVisible && this.ai.now - this.targetSeen > 1;
    if (ws.reloadT < 0 && this.reloadCd <= 0 && ws.switchT < 0) {
      if ((ws.ink < 30 && safe) || (ws.ink < 6 && (!this.targetVisible || d > 12))) {
        if (!(m.paint === 1 && ws.ink > 15 && this.state === STATE.RETREAT)) {
          it.reload = true;
          this.reloadCd = 2.5;
        }
      }
    }

    // ── surf / carrera: viajar sin disparar sobre pintura propia
    if (!it.fire && !it.firePressed && ws.reloadT < 0 && ml > 0.3) {
      const travel = this.state === STATE.RETREAT || this.state === STATE.REGROUP || (!this.hasPaintPoint && !fighting && wid !== 'roller');
      if (travel && (m.paint === 1 ? Math.random() < 0.98 * this.P.surfLove + 0.02 : true)) it.run = true;
      if (this.state === STATE.RETREAT && m.paint === 1) it.run = true;
    }
  }

  get useAim() {
    if (this._useAimT === undefined || this.ai.now - this._useAimT > 3) {
      this._useAimT = this.ai.now;
      this._useAim = Math.random() < this.P.useAim;
    }
    return this._useAim;
  }

  inkFloor() {
    const reserve = this.target ? this.P.inkReserve : this.P.inkReserve * 0.4;
    return Math.max(2, reserve);
  }

  /** Movimiento de combate: distancia preferida + desplazamiento lateral. */
  combatMove(dt, d) {
    const p = this.pos;
    const tp = this.target.position;
    const wid = this.c.weapons.weaponId;
    const [rmin, rmax] = WEAPON_RANGES[wid];
    const tx = (tp.x - p.x) / (d || 1);
    const tz = (tp.z - p.z) / (d || 1);
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = rand(AI.strafeChangeMin, AI.strafeChangeMax);
      if (Math.random() < 0.7) this.strafeDir *= -1;
      this.fwdBias = rand(-0.35, 0.35);
      if (Math.random() < AI.jumpChance * this.P.jumpiness) this.doJump();
    }
    let fwd = this.fwdBias;
    let side = 1;
    if (wid === 'roller') {
      fwd = d > 1.2 ? 1 : 0.2;
      side = d > 4 ? 0.35 : 0.2;
    } else if (d > rmax) {
      fwd = 1;
      side = 0.5;
    } else if (d < rmin) {
      fwd = -1;
      side = 0.6;
    }
    if (this.perch) side *= 0.3;
    const out = this._mv || (this._mv = { x: 0, z: 0 });
    out.x = tx * fwd + -tz * this.strafeDir * side;
    out.z = tz * fwd + tx * this.strafeDir * side;
    return out;
  }

  /** Seguir la ruta; si no hay, deambular hacia el objetivo o su nodo. */
  followPath() {
    const out = this._mv || (this._mv = { x: 0, z: 0 });
    out.x = 0;
    out.z = 0;
    const p = this.pos;
    const path = this.path;
    if (path && this.pathI < path.length) {
      let n = path[this.pathI];
      let dx = n.x - p.x;
      let dz = n.z - p.z;
      let dh = Math.hypot(dx, dz);
      if (dh < AI.arriveDistance && Math.abs(n.y - p.y) < 1.1) {
        this.pathI++;
        if (this.pathI >= path.length) {
          this.goalT = 0; // pedir destino nuevo en el próximo pensamiento
          // seguir avanzando en la misma dirección mientras tanto
          out.x = dx / (dh || 1);
          out.z = dz / (dh || 1);
          return out;
        }
        n = path[this.pathI];
        dx = n.x - p.x;
        dz = n.z - p.z;
        dh = Math.hypot(dx, dz);
      }
      out.x = dx / (dh || 1);
      out.z = dz / (dh || 1);
      return out;
    }
    // sin ruta: avanzar hacia el objetivo o el destino
    const g = this.target ? this.targetPos : this.goalPos;
    const dx = g.x - p.x;
    const dz = g.z - p.z;
    const dh = Math.hypot(dx, dz);
    if (dh > 1) {
      out.x = dx / dh;
      out.z = dz / dh;
    } else {
      out.x = Math.sin(this.aimYaw);
      out.z = Math.cos(this.aimYaw);
    }
    return out;
  }

  /** ¿Hay suelo (no agua) delante en esa dirección? */
  safeAhead(dx, dz) {
    const p = this.pos;
    const c = this.ai.collision;
    const h = c.groundHeight(p.x + dx * 1.1, p.z + dz * 1.1, 0.15, p.y + 0.6);
    return h > PLAYER.killY + 0.5;
  }

  /** Salta si delante hay un escalón demasiado alto para subirlo andando. */
  jumpObstacles(dx, dz) {
    const m = this.c.motor;
    if (!m.grounded || this.jumpCd > 0) return;
    const p = this.pos;
    const c = this.ai.collision;
    for (const dist of [0.55, 1.05]) {
      const h = c.groundHeight(p.x + dx * dist, p.z + dz * dist, 0.12, p.y + 1.65);
      const rise = h - p.y;
      if (rise > PLAYER.stepHeight + 0.05 && rise < 1.65) {
        // sólo si hacia allí va la ruta (no saltar a cualquier caja al esquivar)
        const path = this.path;
        const n = path && this.pathI < path.length ? path[this.pathI] : null;
        if (!n || n.y > p.y + 0.3 || this.pathLinkJump() || this.direct) {
          this.doJump();
          return;
        }
      }
    }
  }

  pathLinkJump() {
    const path = this.path;
    if (!path || this.pathI < 1 || this.pathI >= path.length) return false;
    const a = path[this.pathI - 1];
    const b = path[this.pathI];
    for (const l of a.links) if (l.to === b.id) return l.jump;
    return false;
  }

  doJump() {
    if (this.jumpCd > 0 || !this.c.motor.grounded) return;
    this.c.intent.jump = true;
    this.jumpCd = 0.45;
  }
}

export class EnemyAI {
  constructor({ collision, paint, characters }) {
    this.collision = collision;
    this.paint = paint;
    this.characters = characters;
    this.nav = new NavGraph(collision);
    this.bots = [];
    this.byChar = new Map();
    this.now = 0;
    this.matchTime = 0;
    this.enabled = true;
    bus.on('damage', (e) => {
      const b = this.byChar.get(e.victim);
      if (b) b.onDamaged(e);
    });
    bus.on('respawn:landed', ({ character }) => {
      const b = this.byChar.get(character);
      if (b) b.onRespawn();
    });
    bus.on('kill', (e) => {
      for (const b of this.bots) {
        if (b.target === e.victim) {
          b.target = null;
          b.targetVisible = false;
        }
      }
    });
  }

  add(character, personalityId, lane) {
    const P = PERSONALITIES[personalityId] || PERSONALITIES.agresivo;
    const b = new BotBrain(this, character, P, lane || 'center', this.bots.length);
    character.brain = b;
    character.botAim = b.aim;
    this.bots.push(b);
    this.byChar.set(character, b);
    return b;
  }

  reset() {
    for (const b of this.bots) b.reset();
    this.matchTime = 0;
  }

  /** Piensa a 10 Hz (escalonado entre bots) y actúa cada fotograma. */
  update(dt, now) {
    this.now = now;
    this.matchTime += dt;
    const step = 1 / AI.thinkRate;
    for (const b of this.bots) {
      if (!this.enabled) {
        b.c.intent.moveX = 0;
        b.c.intent.moveZ = 0;
        b.c.intent.fire = false;
        continue;
      }
      b.thinkAcc += dt;
      if (b.thinkAcc >= step) {
        b.think(b.thinkAcc);
        b.thinkAcc = Math.min(b.thinkAcc - step, step);
      }
      b.act(dt);
    }
  }

  /** Datos de depuración por bot. */
  debug() {
    return this.bots.map((b) => ({
      name: b.c.name,
      state: b.state,
      alive: b.c.alive,
      hp: Math.round(b.c.hp),
      ink: Math.round(b.c.weapons.ink),
      weapon: b.c.weapons.weaponId,
      pos: [+b.pos.x.toFixed(1), +b.pos.y.toFixed(1), +b.pos.z.toFixed(1)],
      target: b.target ? b.target.name : null,
      goal: b.goal ? b.goal.name : null,
      pathLeft: b.path ? b.path.length - b.pathI : 0
    }));
  }
}

