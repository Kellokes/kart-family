import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Track } from './track.js';
import { Kart, collideKarts } from './kart.js';
import { BotDriver } from './bot.js';
import { PlayerInput } from './input.js';
import { Sfx } from './audio.js';
import CHARS from './personagens.json';

const BASE = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ---------- render ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0x8fd3ff, 140, 520);
const camera = new THREE.PerspectiveCamera(68, 1, 0.3, 1200);
scene.add(new THREE.HemisphereLight(0xdff2ff, 0x5a8a3a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(80, 120, 40);
scene.add(sun);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 80 : 68;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const track = new Track(scene);

// ---------- estado ----------
const input = new PlayerInput();
const sfx = new Sfx();
const opts = { mode: 'easy', bots: 7, laps: 3, diff: 1, char: null };
const models = {};
let karts = [], bots = [], player = null;
let state = 'menu'; // menu | countdown | race | paused | done
let raceTime = 0, countdown = 0, finishOrder = [];
let lastCount = -1;

// ---------- telas ----------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  if (id) $(id).classList.add('active');
}
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => show('scr-' + b.dataset.go)));
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  opts.mode = b.dataset.mode;
  opts.bots = +$('opt-bots').value;
  opts.laps = +$('opt-laps').value;
  opts.diff = +$('opt-diff').value;
  show('scr-char');
}));

const charsEl = $('chars');
for (const c of CHARS) {
  const el = document.createElement('div');
  el.className = 'char';
  const bar = (label, v) => `<div class="stat"><span>${label}</span><i style="--v:${v * 20}%"></i></div>`;
  el.innerHTML = `<img src="${BASE}thumbs/${c.id}.webp" alt=""><b>${c.nome}</b>` +
    bar('Velocidade', c.velocidade) + bar('Aceleração', c.aceleracao) + bar('Controle', c.controle);
  el.addEventListener('click', () => {
    charsEl.querySelectorAll('.char').forEach(x => x.classList.remove('sel'));
    el.classList.add('sel');
    opts.char = c;
    $('btn-race').disabled = false;
  });
  charsEl.appendChild(el);
}

$('btn-race').addEventListener('click', async () => {
  sfx.init();
  if (opts.mode === 'easy' && isTouch) await input.requestTilt();
  if (isTouch) {
    try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch (e) {}
    try { await screen.orientation?.lock?.('landscape'); } catch (e) {}
  }
  await startRace();
});

// ---------- carregamento ----------
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
async function loadModels(ids) {
  const need = ids.filter(id => !models[id]);
  let done = 0;
  $('load-bar').style.width = '5%';
  await Promise.all(need.map(id => new Promise(res => {
    loader.load(`${BASE}models/${id}.glb`, g => {
      g.scene.traverse(o => { if (o.isMesh) { o.material.side = THREE.FrontSide; } });
      models[id] = g.scene;
      done++; $('load-bar').style.width = `${5 + 95 * done / need.length}%`;
      res();
    }, undefined, () => { models[id] = null; done++; res(); });
  })));
}

// ---------- corrida ----------
function clearRace() {
  for (const k of karts) scene.remove(k.root);
  karts = []; bots = []; player = null;
}

async function startRace() {
  show('scr-load');
  const others = CHARS.filter(c => c.id !== opts.char.id).sort(() => Math.random() - 0.5).slice(0, opts.bots);
  await loadModels([opts.char.id, ...others.map(c => c.id)]);
  clearRace();
  const roster = [...others];
  // jogador larga no fim do grid (a câmera não fica atrás de outro kart)
  roster.push(opts.char);
  roster.forEach((c, i) => {
    const k = new Kart({ char: c, model: models[c.id], track, isPlayer: c === opts.char });
    const row = Math.floor(i / 2), col = i % 2;
    k.place(-6 - row * 6.5 - col * 2.5, (col ? -1 : 1) * 3.6);
    scene.add(k.root);
    karts.push(k);
    if (k.isPlayer) {
      player = k;
      k.name = 'Você';
      k.onBoost = () => sfx.boost();
      k.onBump = () => { sfx.bump(); navigator.vibrate?.(30); };
    } else {
      bots.push(new BotDriver(k, opts.diff, i * 977 + 13));
    }
  });
  input.mode = opts.mode;
  input.reset();
  $('ctl-hard').classList.toggle('on', opts.mode === 'hard' && isTouch);
  $('hud').classList.toggle('hard', opts.mode === 'hard' && isTouch);
  $('tilt-ind').style.display = opts.mode === 'easy' && isTouch ? 'block' : 'none';
  $('hud-pos').innerHTML = `${karts.length}º<small>/${karts.length}</small>`;
  raceTime = 0; finishOrder = []; countdown = 3.999; lastCount = -1;
  state = 'countdown';
  document.body.classList.add('racing');
  show('hud');
  snapCamera();
}

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

let toastT = 0;
function toast(msg, dur = 1.4) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show'); toastT = dur;
}

function ranking() {
  return [...karts].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.dist - a.dist;
  });
}

function finishRace() {
  state = 'done';
  sfx.stopAll();
  setTimeout(() => {
    const order = ranking();
    // quem não terminou recebe tempo estimado
    const list = $('res-list'); list.innerHTML = '';
    order.forEach((k, i) => {
      const li = document.createElement('li');
      if (k.isPlayer) li.className = 'me';
      const t = k.finished ? fmt(k.finishTime) : '--';
      li.innerHTML = `<span>${i + 1}º ${k.isPlayer ? 'Você (' + k.char.nome + ')' : k.name}</span><span>${t}</span>`;
      list.appendChild(li);
    });
    const p = order.indexOf(player) + 1;
    $('res-title').textContent = p === 1 ? 'Você venceu!' : p <= 3 ? `Pódio! ${p}º lugar` : `${p}º lugar`;
    show('scr-result');
  }, 2200);
}

// pausa
$('btn-pause').addEventListener('click', () => { if (state === 'race' || state === 'countdown') { state = 'paused:' + state; sfx.stopAll(); show('scr-pause'); } });
$('btn-resume').addEventListener('click', () => { state = state.split(':')[1] || 'race'; show('hud'); });
$('btn-recal').addEventListener('click', () => { input.calibrate(); toast('Calibrado'); });
$('btn-restart').addEventListener('click', () => startRace());
$('btn-quit').addEventListener('click', quit);
$('btn-invert').addEventListener('click', () => {
  input.invert = !input.invert;
  try { localStorage.setItem('kf-invert', input.invert ? '1' : '0'); } catch (e) {}
  toast(input.invert ? 'Inclinação invertida' : 'Inclinação normal');
});
try { input.invert = localStorage.getItem('kf-invert') === '1'; } catch (e) {}
$('btn-again').addEventListener('click', () => startRace());
$('btn-menu').addEventListener('click', quit);
function quit() {
  state = 'menu'; sfx.stopAll(); clearRace();
  document.body.classList.remove('racing');
  try { document.exitFullscreen?.(); } catch (e) {}
  show('scr-menu');
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state === 'race' || state === 'countdown')) $('btn-pause').click();
});

// ---------- câmera ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function camTarget(k, out, look) {
  const f = new THREE.Vector3(Math.sin(k.yaw), 0, Math.cos(k.yaw));
  out.copy(k.pos).addScaledVector(f, -6.8).setY(3.4);
  look.copy(k.pos).addScaledVector(f, 4).setY(1.2);
}
function snapCamera() { if (player) { camTarget(player, camPos, camLook); camera.position.copy(camPos); camera.lookAt(camLook); } }
const tmpP = new THREE.Vector3(), tmpL = new THREE.Vector3();
function updateCamera(dt) {
  if (!player) {
    // câmera de menu: passeia pela pista
    const t = performance.now() * 0.00002 * track.length;
    const a = track.pointAt(t, 0), b = track.pointAt(t + 30, 0);
    camera.position.copy(a.p).addScaledVector(a.nrm, 22).setY(14);
    camera.lookAt(b.p);
    return;
  }
  camTarget(player, tmpP, tmpL);
  const k = 1 - Math.exp(-dt * 6);
  camPos.lerp(tmpP, k); camLook.lerp(tmpL, 1 - Math.exp(-dt * 10));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  const targetFov = (innerWidth < innerHeight ? 80 : 68) + (player.boost > 0 ? 8 : 0) + Math.max(0, player.speed) * 0.12;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

// ---------- minimapa ----------
const mm = $('minimap'), mctx = mm.getContext('2d');
let mmBounds;
{
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of track.samples) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const s = 140 / Math.max(x1 - x0, z1 - z0);
  mmBounds = { x0, z0, s, ox: (160 - (x1 - x0) * s) / 2, oz: (160 - (z1 - z0) * s) / 2 };
}
const mmX = x => mmBounds.ox + (x - mmBounds.x0) * mmBounds.s;
const mmY = z => mmBounds.oz + (z - mmBounds.z0) * mmBounds.s;
function drawMinimap() {
  mctx.clearRect(0, 0, 160, 160);
  mctx.lineWidth = 7; mctx.strokeStyle = '#0008'; mctx.lineJoin = 'round';
  mctx.beginPath();
  track.samples.forEach((p, i) => i ? mctx.lineTo(mmX(p.x), mmY(p.z)) : mctx.moveTo(mmX(p.x), mmY(p.z)));
  mctx.closePath(); mctx.stroke();
  mctx.lineWidth = 3; mctx.strokeStyle = '#fff'; mctx.stroke();
  for (const k of karts) {
    mctx.fillStyle = k.isPlayer ? '#ffcc29' : '#ff5d5d';
    mctx.beginPath(); mctx.arc(mmX(k.pos.x), mmY(k.pos.z), k.isPlayer ? 5 : 3.5, 0, 7); mctx.fill();
  }
}

// ---------- loop ----------
let last = performance.now(), hudT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt, now);
  if (!window.__kart?.freeCam) updateCamera(dt);
  renderer.render(scene, camera);
}
function tick(dt, now) {
  const playing = state === 'race' || state === 'countdown' || state === 'done';

  if (state === 'countdown') {
    countdown -= dt;
    const c = Math.ceil(countdown);
    if (c !== lastCount) {
      lastCount = c;
      if (c > 0) { $('countdown').textContent = c; sfx.beep(440, 0.18); if (c === 3) input.calibrate(); }
    }
    if (countdown <= 0) {
      state = 'race'; $('countdown').textContent = 'VAI!'; sfx.beep(880, 0.4);
      setTimeout(() => { if ($('countdown').textContent === 'VAI!') $('countdown').textContent = ''; }, 800);
    }
  }

  if (playing) {
    const raceOn = state === 'race' || state === 'done';
    if (state === 'race') raceTime += dt;
    if (player && !player.finished) player.input = input.read();
    const t = now / 1000;
    for (const b of bots) b.think(dt, player, t);
    if (player?.finished) { player.input.steer = 0; }
    for (const k of karts) k.update(dt, raceOn && state !== 'countdown');
    collideKarts(karts);

    // voltas e chegada
    const L = track.length;
    for (const k of karts) {
      const lap = Math.max(1, Math.floor(k.dist / L) + 1);
      if (!k.finished && k.dist >= opts.laps * L) {
        k.finished = true; k.finishTime = raceTime;
        finishOrder.push(k);
        if (k.isPlayer) {
          const p = ranking().indexOf(k) + 1;
          toast(p === 1 ? 'VITÓRIA!' : `Chegou em ${p}º!`, 2.5);
          sfx.beep(660, 0.2); setTimeout(() => sfx.beep(990, 0.4), 200);
          finishRace();
        }
      } else if (k.isPlayer && lap > k.lap && lap <= opts.laps) {
        toast(lap === opts.laps ? 'ÚLTIMA VOLTA!' : `Volta ${lap}`);
        sfx.beep(700, 0.15);
      }
      k.lap = Math.min(lap, opts.laps);
    }
    if (state === 'race' && player) sfx.engine(Math.min(1, Math.abs(player.speed) / 40), true);

    hudT -= dt;
    if (hudT <= 0 && player) {
      hudT = 0.1;
      const order = ranking();
      const p = order.indexOf(player) + 1;
      $('hud-pos').innerHTML = `${p}º<small>/${karts.length}</small>`;
      $('hud-lap').textContent = `Volta ${player.lap}/${opts.laps}`;
      $('hud-time').textContent = fmt(raceTime);
      $('hud-speed').innerHTML = `${Math.round(Math.abs(player.speed) * 3.6)} <small>km/h</small>`;
      if (input.tiltAvailable) {
        const s = input.read().steer;
        $('tilt-ind').firstElementChild.style.left = `${50 - s * 45}%`;
      }
      drawMinimap();
    }
  }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  // turbo pisca
  if (track.boostMat.map) track.boostMat.map.offset.y = -(now * 0.0015 % 1);

}
requestAnimationFrame(frame);

// expõe para testes
window.__kart = { camera, freeCam: false, BotDriver, get bots() { return bots; },
  // simula N segundos sem desenhar (testes)
  simulate(sec, simNow = performance.now()) { for (let t = 0; t < sec; t += 1 / 60) { simNow += 1000 / 60; tick(1 / 60, simNow); } }, get state() { return state; }, get player() { return player; }, get karts() { return karts; }, opts, input, track };
