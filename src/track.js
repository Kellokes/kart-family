import * as THREE from 'three';

// Pista original "Circuito do Quintal": laço fechado, plano, com curvas variadas.
const CONTROL = [
  [0, 0], [70, -6], [130, 8], [168, 50], [160, 104], [118, 128], [78, 106],
  [52, 72], [14, 70], [-22, 104], [-70, 126], [-122, 106], [-146, 58],
  [-128, 12], [-84, -10], [-40, -6],
];

export const ROAD_HALF = 8;     // meia largura do asfalto
export const WALL_HALF = 14;    // limite lateral (barreira)
const N = 1200;

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

export class Track {
  constructor(scene) {
    this.scene = scene;
    const pts = CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.samples = this.curve.getSpacedPoints(N); // N+1 pontos, último = primeiro
    this.samples.pop();
    this.n = this.samples.length;
    this.length = this.curve.getLength();
    this.step = this.length / this.n;
    this.tangents = [];
    this.normals = []; // horizontal, aponta para a esquerda
    for (let i = 0; i < this.n; i++) {
      const a = this.samples[(i - 1 + this.n) % this.n], b = this.samples[(i + 1) % this.n];
      const t = b.clone().sub(a).normalize();
      this.tangents.push(t);
      this.normals.push(new THREE.Vector3(t.z, 0, -t.x));
    }
    this.boostPads = [0.2, 0.47, 0.71, 0.9].map(f => ({ s: f * this.length, len: 7 }));
    this.build();
  }

  // índice mais próximo; "hint" restringe a busca para ser rápido
  nearest(pos, hint = -1) {
    let best = 0, bd = Infinity;
    const scan = (i) => {
      const p = this.samples[i];
      const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    };
    if (hint < 0) for (let i = 0; i < this.n; i++) scan(i);
    else for (let k = -40; k <= 40; k++) scan((hint + k + this.n) % this.n);
    return best;
  }

  // retorna {i, s, lat} : índice, distância ao longo da pista, deslocamento lateral (+ = esquerda)
  locate(pos, hint) {
    const i = this.nearest(pos, hint);
    const p = this.samples[i], t = this.tangents[i], nrm = this.normals[i];
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const along = dx * t.x + dz * t.z;
    const lat = dx * nrm.x + dz * nrm.z;
    let s = i * this.step + along;
    s = ((s % this.length) + this.length) % this.length;
    return { i, s, lat };
  }

  pointAt(s, lat = 0) {
    s = ((s % this.length) + this.length) % this.length;
    const f = s / this.step;
    const i = Math.floor(f) % this.n, j = (i + 1) % this.n, k = f - Math.floor(f);
    const p = this.samples[i].clone().lerp(this.samples[j], k);
    const t = this.tangents[i].clone().lerp(this.tangents[j], k).normalize();
    const nrm = new THREE.Vector3(t.z, 0, -t.x);
    p.addScaledVector(nrm, lat);
    return { p, t, nrm };
  }

  ribbon(off0, off1, y, vScale, uRepeat = 1) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= this.n; i++) {
      const k = i % this.n;
      const p = this.samples[k], nrm = this.normals[k];
      const v = (i * this.step) / vScale;
      pos.push(p.x + nrm.x * off0, y, p.z + nrm.z * off0, p.x + nrm.x * off1, y, p.z + nrm.z * off1);
      uv.push(0, v, uRepeat, v);
      if (i < this.n) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  build() {
    const scene = this.scene;
    // chão de grama
    const grassTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#5fae3c'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        c.fillStyle = Math.random() < .5 ? '#6cbb45' : '#539a33';
        c.fillRect(Math.random() * w, Math.random() * h, 2, 3);
      }
    });
    grassTex.repeat.set(120, 120);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshLambertMaterial({ map: grassTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);

    // asfalto
    const roadTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#4a4c57'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        const g = 60 + Math.random() * 40 | 0;
        c.fillStyle = `rgb(${g},${g},${g + 8})`;
        c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      c.fillStyle = '#f2f2f2';
      c.fillRect(w / 2 - 3, 0, 6, h * 0.5);
      c.fillRect(6, 0, 5, h); c.fillRect(w - 11, 0, 5, h);
    });
    const road = new THREE.Mesh(this.ribbon(ROAD_HALF, -ROAD_HALF, 0.01, 16),
      new THREE.MeshLambertMaterial({ map: roadTex }));
    scene.add(road);

    // zebras
    const curbTex = canvasTex(32, 64, (c, w, h) => {
      c.fillStyle = '#e23b3b'; c.fillRect(0, 0, w, h / 2);
      c.fillStyle = '#ffffff'; c.fillRect(0, h / 2, w, h / 2);
    });
    const curbMat = new THREE.MeshLambertMaterial({ map: curbTex });
    scene.add(new THREE.Mesh(this.ribbon(ROAD_HALF + 1.4, ROAD_HALF, 0.02, 3), curbMat));
    scene.add(new THREE.Mesh(this.ribbon(-ROAD_HALF, -ROAD_HALF - 1.4, 0.02, 3), curbMat));

    // faixa de terra entre zebra e barreira
    const dirtMat = new THREE.MeshLambertMaterial({ color: 0x8fbf52 });
    scene.add(new THREE.Mesh(this.ribbon(WALL_HALF, ROAD_HALF + 1.4, 0.005, 10), dirtMat));
    scene.add(new THREE.Mesh(this.ribbon(-ROAD_HALF - 1.4, -WALL_HALF, 0.005, 10), dirtMat));

    // barreiras (blocos baixos alternando cores)
    this.buildWalls();

    // linha de largada quadriculada
    const checker = canvasTex(128, 32, (c, w, h) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
        c.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        c.fillRect(x * 8, y * 8, 8, 8);
      }
    }, false);
    const start = this.pointAt(0);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 2.2),
      new THREE.MeshLambertMaterial({ map: checker }));
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = Math.atan2(start.t.x, start.t.z) + Math.PI / 2 * 0;
    line.position.copy(start.p).setY(0.03);
    line.rotation.order = 'YXZ';
    line.rotation.set(-Math.PI / 2, 0, 0);
    const holder = new THREE.Group();
    holder.add(line);
    holder.position.copy(start.p).setY(0.03);
    line.position.set(0, 0, 0);
    holder.rotation.y = Math.atan2(start.t.x, start.t.z);
    scene.add(holder);

    // pórtico de largada
    const arch = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color: 0x2b2f6b });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), postMat);
      post.position.set(sx * (ROAD_HALF + 2), 3.5, 0);
      arch.add(post);
    }
    const bannerTex = canvasTex(512, 64, (c, w, h) => {
      c.fillStyle = '#ffcc29'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1b1f3b'; c.font = 'italic 900 44px Trebuchet MS, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('KART FAMILY', w / 2, h / 2 + 2);
    }, false);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 4.8, 1.6, 0.4),
      [postMat, postMat, postMat, postMat, new THREE.MeshLambertMaterial({ map: bannerTex }), new THREE.MeshLambertMaterial({ map: bannerTex })]);
    banner.position.y = 6.6;
    arch.add(banner);
    arch.position.copy(start.p);
    arch.rotation.y = Math.atan2(start.t.x, start.t.z);
    scene.add(arch);

    // faixas de turbo
    const boostTex = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = '#ffb000'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff3a0';
      c.beginPath(); c.moveTo(8, 50); c.lineTo(32, 14); c.lineTo(56, 50); c.lineTo(44, 50); c.lineTo(32, 32); c.lineTo(20, 50); c.fill();
    });
    this.boostMat = new THREE.MeshBasicMaterial({ map: boostTex });
    for (const b of this.boostPads) {
      const { p, t } = this.pointAt(b.s + b.len / 2);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, b.len), this.boostMat);
      const g = new THREE.Group();
      m.rotation.x = -Math.PI / 2;
      g.add(m);
      g.position.copy(p).setY(0.04);
      g.rotation.y = Math.atan2(t.x, t.z);
      scene.add(g);
      b.mesh = g;
    }

    this.buildScenery();
  }

  buildWalls() {
    const count = Math.floor(this.length / 2.2);
    const geo = new THREE.BoxGeometry(2.0, 0.9, 0.6);
    const mat = new THREE.MeshLambertMaterial();
    const inst = new THREE.InstancedMesh(geo, mat, count * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const colA = new THREE.Color(0xffffff), colB = new THREE.Color(0x2f6fe0);
    let k = 0;
    for (let c = 0; c < count; c++) {
      const s = c * (this.length / count);
      for (const side of [1, -1]) {
        const { p, t } = this.pointAt(s, side * (WALL_HALF + 0.3));
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(t.x, t.z) + Math.PI / 2);
        p.y = 0.45;
        m.compose(p, q, sc);
        inst.setMatrixAt(k, m);
        inst.setColorAt(k, c % 2 ? colA : colB);
        k++;
      }
    }
    this.scene.add(inst);
  }

  // distância mínima de um ponto até a linha central (aprox, por amostras)
  distToCenter(x, z) {
    let bd = Infinity;
    for (let i = 0; i < this.n; i += 4) {
      const p = this.samples[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) bd = d;
    }
    return Math.sqrt(bd);
  }

  buildScenery() {
    const rnd = mulberry(42);
    // árvores
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.2, 6);
    const leafGeo = new THREE.ConeGeometry(2.2, 5, 7);
    const bushGeo = new THREE.IcosahedronGeometry(2.4, 0);
    const trunks = [], leaves = [], bushes = [];
    let tries = 0;
    while ((leaves.length + bushes.length) < 260 && tries++ < 5000) {
      const x = (rnd() - 0.5) * 520, z = (rnd() - 0.5) * 420 + 55;
      const d = this.distToCenter(x, z);
      if (d < WALL_HALF + 6) continue;
      const s = 0.7 + rnd() * 0.8;
      if (rnd() < 0.7) { trunks.push([x, z, s]); leaves.push([x, z, s]); }
      else bushes.push([x, z, s]);
    }
    const put = (geo, mat, arr, yf) => {
      const inst = new THREE.InstancedMesh(geo, mat, arr.length);
      const m = new THREE.Matrix4();
      arr.forEach(([x, z, s], i) => {
        m.makeScale(s, s, s).setPosition(x, yf * s, z);
        inst.setMatrixAt(i, m);
      });
      this.scene.add(inst);
      return inst;
    };
    put(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a4b2a }), trunks, 1.1);
    const leafInst = put(leafGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), leaves, 4.4);
    const greens = [0x2f8a3a, 0x3c9e47, 0x267a36, 0x4aa84f].map(c => new THREE.Color(c));
    leaves.forEach((_, i) => leafInst.setColorAt(i, greens[i % greens.length]));
    const bushInst = put(bushGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), bushes, 1.2);
    const flowers = [0x58b84a, 0x9ccc4a, 0x4f9e44].map(c => new THREE.Color(c));
    bushes.forEach((_, i) => bushInst.setColorAt(i, flowers[i % flowers.length]));

    // arquibancada perto da largada
    const st = this.pointAt(-14, -(WALL_HALF + 9));
    const stand = new THREE.Group();
    const seatCols = [0xff5d5d, 0xffcc29, 0x4cc3ff, 0x8f6bff];
    for (let r = 0; r < 4; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(34, 1, 2.4), new THREE.MeshLambertMaterial({ color: seatCols[r] }));
      step.position.set(0, 0.5 + r * 1, -r * 2.4);
      stand.add(step);
    }
    stand.position.copy(st.p);
    stand.rotation.y = Math.atan2(st.t.x, st.t.z) - Math.PI / 2;
    this.scene.add(stand);

    // nuvens / montanhas no horizonte
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x7fb36a, flatShading: true });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = 420 + rnd() * 80;
      const h = new THREE.Mesh(new THREE.ConeGeometry(60 + rnd() * 60, 50 + rnd() * 60, 6), hillMat);
      h.position.set(Math.cos(a) * r, 20, Math.sin(a) * r + 55);
      this.scene.add(h);
    }
  }
}

export function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
