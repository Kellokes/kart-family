import * as THREE from 'three';
import { ROAD_HALF, WALL_HALF } from './track.js';

const COLORS = {
  barba: 0xd9452b, menino: 0x23a35a, menina: 0xff6fb5, oculos: 0x7b5cff,
  joinha: 0xffb400, celular: 0x2f8fe0, laranja: 0xff8a1f, cacheada: 0x16b8b0,
};

function shadowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let SHADOW;

export function buildKartMesh(char, model) {
  const color = COLORS[char.id] ?? 0xff4444;
  const root = new THREE.Group();
  const body = new THREE.Group(); // inclina nas curvas
  root.add(body);
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22232b });
  const metal = new THREE.MeshLambertMaterial({ color: 0xc9ccd6 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 2.8), paint);
  chassis.position.set(0, 0.42, 0);
  body.add(chassis);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.9), paint);
  nose.position.set(0, 0.5, 1.55); nose.rotation.x = -0.25;
  body.add(nose);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.3), dark);
  bumper.position.set(0, 0.32, 1.95);
  body.add(bumper);
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 1.6), paint);
  sideL.position.set(0.82, 0.72, -0.2); body.add(sideL);
  const sideR = sideL.clone(); sideR.position.x = -0.82; body.add(sideR);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.35), paint);
  back.position.set(0, 0.75, -1.15); body.add(back);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), dark);
  wing.position.set(0, 1.25, -1.35); body.add(wing);
  for (const sx of [-0.6, 0.6]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), dark);
    st.position.set(sx, 1.0, -1.3); body.add(st);
  }
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 8), metal);
  exhaust.rotation.x = Math.PI / 2; exhaust.position.set(0.35, 0.5, -1.5); body.add(exhaust);
  const ex2 = exhaust.clone(); ex2.position.x = -0.35; body.add(ex2);
  const wheelCol = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), dark);
  wheelCol.position.set(0, 0.85, 0.75); wheelCol.rotation.x = -0.9; body.add(wheelCol);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 14), dark);
  steering.position.set(0, 1.02, 0.55); steering.rotation.x = -0.6;
  body.add(steering);

  // rodas
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.42, 14);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.44, 8);
  hubGeo.rotateZ(Math.PI / 2);
  for (const [x, z, front] of [[0.95, 1.05, 1], [-0.95, 1.05, 1], [1.0, -1.0, 0], [-1.0, -1.0, 0]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, dark);
    const hub = new THREE.Mesh(hubGeo, metal);
    spin.add(tire, hub);
    if (!front) spin.scale.set(1.2, 1.08, 1.08);
    pivot.add(spin);
    root.add(pivot);
    wheels.push({ pivot, spin, front });
  }

  // piloto
  if (model) {
    const m = model.clone(true);
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const s = 2.05 / size.y;
    m.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x * s, -box.min.y * s + 0.22, -c.z * s - 0.3);
    body.add(m);
  }

  if (!SHADOW) SHADOW = new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false });
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.8), SHADOW);
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.035;
  root.add(sh);

  // chamas do turbo
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85 });
  const flames = new THREE.Group();
  for (const sx of [0.35, -0.35]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 8), flameMat);
    f.rotation.x = -Math.PI / 2; f.position.set(sx, 0.5, -2.05);
    flames.add(f);
  }
  flames.visible = false;
  body.add(flames);

  return { root, body, wheels, flames, steering };
}

export class Kart {
  constructor({ char, model, track, isPlayer = false, name }) {
    this.char = char;
    this.name = name ?? char.nome;
    this.track = track;
    this.isPlayer = isPlayer;
    const v = buildKartMesh(char, model);
    Object.assign(this, v);
    // atributos (1..5) -> física
    this.maxSpeed = 27 + char.velocidade * 1.6;     // m/s
    this.accel = 9 + char.aceleracao * 2.2;
    this.turnRate = 1.55 + char.controle * 0.13;
    this.mass = char.peso === 'pesado' ? 1.3 : char.peso === 'leve' ? 0.8 : 1.0;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.steer = 0;
    this.boost = 0;
    this.hint = -1;
    this.dist = 0;      // distância total percorrida na pista (para voltas/posição)
    this.prevS = 0;
    this.finished = false;
    this.finishTime = 0;
    this.lap = 1;
    this.speedFactor = 1; // usado pelos bots
    this.wheelRot = 0;
    this.offroad = false;
    this.bump = 0;
    this.input = { throttle: 0, steer: 0 };
  }

  place(s, lat) {
    const { p, t } = this.track.pointAt(s, lat);
    this.pos.copy(p);
    this.yaw = Math.atan2(t.x, t.z);
    const loc = this.track.locate(this.pos, -1);
    this.hint = loc.i;
    this.prevS = loc.s;
    this.dist = s; // pode ser negativo (atrás da linha)
    this.speed = 0;
    this.syncMesh(0);
  }

  update(dt, raceOn) {
    const inp = raceOn && !this.finished ? this.input : { throttle: this.finished ? 0.4 : 0, steer: this.finished ? this.input.steer : 0 };
    const loc = this.track.locate(this.pos, this.hint);
    this.hint = loc.i;
    this.offroad = Math.abs(loc.lat) > ROAD_HALF + 1.4;

    // turbo
    for (const b of this.track.boostPads) {
      let ds = loc.s - b.s;
      if (ds < 0) ds += this.track.length;
      if (ds < b.len && Math.abs(loc.lat) < 2.6) {
        if (this.boost < 0.2 && this.onBoost) this.onBoost();
        this.boost = 1.3;
      }
    }
    this.boost = Math.max(0, this.boost - dt);

    let top = this.maxSpeed * this.speedFactor;
    if (this.offroad) top *= 0.5;
    if (this.boost > 0) top *= 1.35;

    const th = inp.throttle;
    if (th > 0) {
      if (this.speed < 0) this.speed += 30 * dt;
      else this.speed += this.accel * th * dt * (1 - 0.55 * Math.min(1, this.speed / top));
      if (this.boost > 0) this.speed += 25 * dt;
    } else if (th < 0) {
      if (this.speed > 0.5) this.speed -= 32 * dt * -th;
      else this.speed = Math.max(-9, this.speed - 10 * dt * -th);
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    }
    if (this.speed > top) this.speed = Math.max(top, this.speed - 25 * dt);

    // direção suavizada
    this.steer += (inp.steer - this.steer) * Math.min(1, dt * 10);
    const sp = this.speed;
    const grip = Math.min(1, Math.abs(sp) / 7) * Math.sign(sp || 1);
    const hiSpeed = 1 - 0.25 * Math.min(1, Math.abs(sp) / 40);
    this.yaw += this.steer * this.turnRate * grip * hiSpeed * dt;

    this.pos.x += Math.sin(this.yaw) * sp * dt;
    this.pos.z += Math.cos(this.yaw) * sp * dt;

    // barreira
    const loc2 = this.track.locate(this.pos, this.hint);
    if (Math.abs(loc2.lat) > WALL_HALF - 1.1) {
      const lim = Math.sign(loc2.lat) * (WALL_HALF - 1.1);
      const pt = this.track.pointAt(loc2.s, lim);
      this.pos.x = pt.p.x; this.pos.z = pt.p.z;
      // vira suavemente para dentro e perde velocidade
      const tYaw = Math.atan2(pt.t.x, pt.t.z) + (sp >= 0 ? 0 : Math.PI);
      let d = tYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 6);
      this.speed *= 1 - Math.min(0.9, dt * 3);
      if (this.bump <= 0 && Math.abs(sp) > 10 && this.onBump) this.onBump();
      this.bump = 0.4;
    }
    this.bump -= dt;

    // progresso
    let ds = loc2.s - this.prevS;
    const L = this.track.length;
    if (ds < -L / 2) ds += L;
    if (ds > L / 2) ds -= L;
    this.dist += ds;
    this.prevS = loc2.s;

    this.syncMesh(dt);
  }

  syncMesh(dt) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    const lean = -this.steer * Math.min(1, Math.abs(this.speed) / 20) * 0.12;
    this.body.rotation.z += (lean - this.body.rotation.z) * Math.min(1, dt * 8);
    this.body.position.y = this.offroad && Math.abs(this.speed) > 3 ? Math.sin(performance.now() * 0.05) * 0.03 : 0;
    this.wheelRot += this.speed * dt / 0.42;
    for (const w of this.wheels) {
      w.spin.rotation.x = this.wheelRot;
      if (w.front) w.pivot.rotation.y = this.steer * 0.45;
    }
    this.steering.rotation.z = -this.steer * 0.8;
    this.flames.visible = this.boost > 0;
    if (this.flames.visible) this.flames.scale.setScalar(0.8 + Math.random() * 0.5);
  }
}

// colisão simples entre karts
export function collideKarts(karts) {
  for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) {
    const a = karts[i], b = karts[j];
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const d2 = dx * dx + dz * dz, R = 2.1;
    if (d2 < R * R && d2 > 1e-6) {
      const d = Math.sqrt(d2), push = (R - d) / 2;
      const nx = dx / d, nz = dz / d;
      const wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass);
      a.pos.x -= nx * push * 2 * wa; a.pos.z -= nz * push * 2 * wa;
      b.pos.x += nx * push * 2 * wb; b.pos.z += nz * push * 2 * wb;
      // quem bate por trás perde um pouco
      const fa = Math.sin(a.yaw) * nx + Math.cos(a.yaw) * nz;
      const fb = -(Math.sin(b.yaw) * nx + Math.cos(b.yaw) * nz);
      if (fa > 0.5) a.speed *= 0.97;
      if (fb > 0.5) b.speed *= 0.97;
      if ((a.isPlayer || b.isPlayer) && a.onBump && b.onBump) (a.isPlayer ? a : b).onBump?.(true);
    }
  }
}
