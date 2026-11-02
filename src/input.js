// Entrada do jogador: teclado, inclinação do celular (fácil) e joystick virtual + pedais (difícil)
export class PlayerInput {
  constructor() {
    this.mode = 'easy';
    this.keys = new Set();
    this.tilt = null;          // valor bruto de inclinação (graus)
    this.tiltZero = 0;
    this.tiltAvailable = false;
    this.joyX = 0;
    this.gas = false; this.brake = false;
    this.touchSteer = 0;       // fallback: tocar lados da tela

    addEventListener('keydown', e => { this.keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // Usa a gravidade (devicemotion): funciona com o celular deitado ou em pé.
    // tilt = graus que o lado DIREITO da tela está abaixado.
    const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.invert = false;
    this.onMotion = (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null) return;
      this.tiltAvailable = true;
      const ang = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
      let right;
      if (ang === 90) right = -a.y;
      else if (ang === -90 || ang === 270) right = a.y;
      else if (ang === 180) right = -a.x;
      else right = a.x;
      let down = iOS ? right : -right;
      if (this.invert) down = -down;
      const g = Math.hypot(a.x, a.y, a.z) || 9.81;
      const deg = Math.asin(Math.max(-1, Math.min(1, down / g))) * 57.2958;
      this.tilt = this.tilt == null ? deg : this.tilt + (deg - this.tilt) * 0.5;
    };
    addEventListener('devicemotion', this.onMotion);
    this.setupJoystick();
    this.setupPedals();
    this.setupTouchFallback();
  }

  // iOS exige permissão disparada por um toque
  async requestTilt() {
    try {
      const DME = window.DeviceMotionEvent;
      if (DME && typeof DME.requestPermission === 'function') {
        const r = await DME.requestPermission();
        return r === 'granted';
      }
    } catch (e) { /* ignora */ }
    return true;
  }

  calibrate() { if (this.tilt != null) this.tiltZero = this.tilt; }

  setupJoystick() {
    const joy = document.getElementById('joy'), knob = document.getElementById('joy-knob');
    let id = null, cx = 0, cy = 0;
    const move = (x, y) => {
      const r = joy.clientWidth / 2;
      let dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy), max = r * 0.8;
      if (len > max) { dx *= max / len; dy *= max / len; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.joyX = dx / max;
    };
    joy.addEventListener('pointerdown', e => {
      id = e.pointerId; joy.setPointerCapture(id);
      const b = joy.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2;
      move(e.clientX, e.clientY);
    });
    joy.addEventListener('pointermove', e => { if (e.pointerId === id) move(e.clientX, e.clientY); });
    const end = e => { if (e.pointerId !== id) return; id = null; this.joyX = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  }

  setupPedals() {
    const bind = (el, key) => {
      const on = e => { e.preventDefault(); this[key] = true; el.classList.add('down'); };
      const off = e => { this[key] = false; el.classList.remove('down'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    };
    bind(document.getElementById('btn-gas'), 'gas');
    bind(document.getElementById('btn-brake'), 'brake');
  }

  // Modo fácil sem giroscópio: segurar o lado esquerdo/direito da tela
  setupTouchFallback() {
    const touches = new Map();
    const upd = () => {
      let s = 0;
      for (const x of touches.values()) s += x < innerWidth / 2 ? -1 : 1;
      this.touchSteer = Math.max(-1, Math.min(1, s));
    };
    addEventListener('pointerdown', e => {
      if (this.mode !== 'easy' || e.pointerType !== 'touch' || this.tiltAvailable) return;
      if (e.target.closest('button')) return;
      touches.set(e.pointerId, e.clientX); upd();
    });
    addEventListener('pointerup', e => { touches.delete(e.pointerId); upd(); });
    addEventListener('pointercancel', e => { touches.delete(e.pointerId); upd(); });
  }

  read() {
    const k = this.keys;
    const kl = k.has('ArrowLeft') || k.has('KeyA'), kr = k.has('ArrowRight') || k.has('KeyD');
    const ku = k.has('ArrowUp') || k.has('KeyW'), kd = k.has('ArrowDown') || k.has('KeyS') || k.has('Space');
    // convenção: steer +1 = virar à esquerda
    let steer = (kl ? 1 : 0) - (kr ? 1 : 0);
    let throttle = 0;
    if (this.mode === 'easy') {
      throttle = kd ? -1 : 1;
      if (!kl && !kr) {
        if (this.tiltAvailable && this.tilt != null) {
          let t = this.tilt - this.tiltZero;
          if (Math.abs(t) < 2.5) t = 0; else t -= Math.sign(t) * 2.5;
          steer = Math.max(-1, Math.min(1, -t / 20));
        } else steer = -this.touchSteer;
      }
    } else {
      throttle = (ku || this.gas ? 1 : 0) - (kd || this.brake ? 1 : 0);
      if (!kl && !kr) {
        const j = this.joyX;
        steer = -Math.sign(j) * Math.min(1, Math.abs(j) ** 1.3);
      }
    }
    return { throttle, steer };
  }

  reset() { this.gas = this.brake = false; this.joyX = 0; this.keys.clear(); }
}
