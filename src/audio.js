// Sons sintetizados (sem arquivos): motor, bipes da largada, turbo e batidas
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination);
      this.osc = this.ctx.createOscillator(); this.osc.type = 'sawtooth';
      this.osc2 = this.ctx.createOscillator(); this.osc2.type = 'square';
      this.filt = this.ctx.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 600;
      this.eng = this.ctx.createGain(); this.eng.gain.value = 0;
      this.osc.connect(this.filt); this.osc2.connect(this.filt); this.filt.connect(this.eng); this.eng.connect(this.master);
      this.osc.start(); this.osc2.start();
    } catch (e) { this.ctx = null; }
  }
  engine(speedRatio, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 55 + speedRatio * 140;
    this.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.filt.frequency.setTargetAtTime(400 + speedRatio * 1400, t, 0.1);
    this.eng.gain.setTargetAtTime(on && !this.muted ? 0.16 + speedRatio * 0.1 : 0, t, 0.1);
  }
  beep(freq, dur = 0.15, type = 'square', vol = 0.4) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  boost() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.4);
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.5);
  }
  bump() { this.beep(90, 0.12, 'triangle', 0.5); }
  stopAll() { if (this.eng && this.ctx) this.eng.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); }
}
