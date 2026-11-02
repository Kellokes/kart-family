import { ROAD_HALF } from './track.js';
import { mulberry } from './track.js';

const DIFF = [
  { base: 0.84, spread: 0.05, err: 0.25 },  // tranquilos
  { base: 0.92, spread: 0.05, err: 0.12 },  // normais
  { base: 0.99, spread: 0.03, err: 0.04 },  // feras
];

export class BotDriver {
  constructor(kart, difficulty, seed) {
    this.kart = kart;
    this.rnd = mulberry(seed);
    const d = DIFF[difficulty] ?? DIFF[1];
    this.skill = d.base + (this.rnd() - 0.5) * 2 * d.spread;
    this.err = d.err;
    this.lane = (this.rnd() - 0.5) * ROAD_HALF;
    this.laneTimer = 2 + this.rnd() * 3;
    this.stuck = 0;
    this.reverse = 0;
    this.wobble = this.rnd() * 10;
  }

  think(dt, player, t) {
    const k = this.kart, track = k.track;
    // troca de faixa de vez em quando
    this.laneTimer -= dt;
    if (this.laneTimer < 0) {
      this.laneTimer = 2 + this.rnd() * 4;
      this.lane = (this.rnd() - 0.5) * 2 * (ROAD_HALF - 2.5);
    }
    // "elástico": se muito à frente do jogador, alivia; se muito atrás, aperta
    let rubber = 1;
    if (player) {
      const gap = k.dist - player.dist;
      rubber = 1 - Math.max(-0.07, Math.min(0.08, gap / 900));
    }
    k.speedFactor = this.skill * rubber;

    if (this.reverse > 0) {
      this.reverse -= dt;
      k.input.throttle = -1;
      k.input.steer = -this.revSteer;
      return;
    }

    const loc = track.locate(k.pos, k.hint);
    const ahead = 9 + Math.abs(k.speed) * 0.45;
    const lat = this.lane + Math.sin(t * 0.7 + this.wobble) * this.err * 6;
    const { p } = track.pointAt(loc.s + ahead, lat);
    const want = Math.atan2(p.x - k.pos.x, p.z - k.pos.z);
    let diff = want - k.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    k.input.steer = Math.max(-1, Math.min(1, diff * 2.4));
    k.input.throttle = Math.abs(diff) > 0.55 && k.speed > 16 ? -0.35 : 1;

    // destravar se ficou parado
    if (Math.abs(k.speed) < 1.5) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 1.2) {
      this.stuck = 0;
      this.reverse = 0.9;
      this.revSteer = Math.sign(diff) || 1;
    }
  }
}
