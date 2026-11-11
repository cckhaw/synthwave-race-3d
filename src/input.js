// Keyboard + touch input. Exposes a small polled state so the game loop
// never has to deal with DOM events directly.

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const BOOST = ['ArrowUp', 'KeyW', 'Space', 'ShiftLeft', 'ShiftRight'];
const BRAKE = ['ArrowDown', 'KeyS'];
const SWIPE_PX = 28;

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.touchSteer = 0; // -1 / 0 / 1 from on-screen buttons
    this.touchBoost = false;
    this.laneShifts = 0; // queued swipe lane changes (signed)
    this.boostTap = false; // one-shot boost request (swipe up)
    this.handlers = {};

    window.addEventListener('keydown', (e) => {
      if ([...LEFT, ...RIGHT, ...BOOST, ...BRAKE].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyP' || e.code === 'Escape') this.emit('pause');
      if (e.code === 'KeyM') this.emit('mute');
      if (e.code === 'Enter' || e.code === 'Space') this.emit('confirm');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());

    // Swipe gestures on the game canvas.
    let start = null;
    canvas.addEventListener(
      'touchstart',
      (e) => {
        const t = e.changedTouches[0];
        start = { x: t.clientX, y: t.clientY, id: t.identifier };
      },
      { passive: true },
    );
    canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        if (!start) return;
        const t = [...e.changedTouches].find((c) => c.identifier === start.id);
        if (!t) return;
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
          this.laneShifts += Math.sign(dx);
          start = { x: t.clientX, y: t.clientY, id: t.identifier }; // allow chained swipes
        } else if (dy < -SWIPE_PX * 1.4 && Math.abs(dy) > Math.abs(dx)) {
          this.boostTap = true;
          start = null;
        }
      },
      { passive: false },
    );
    const end = () => (start = null);
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  /** Bind an on-screen hold button. */
  bindHold(el, onDown, onUp) {
    const down = (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      onDown();
    };
    const up = (e) => {
      e.preventDefault();
      el.classList.remove('pressed');
      onUp();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindTouchButtons(left, right, boost) {
    this.bindHold(left, () => (this.touchSteer = -1), () => this.touchSteer === -1 && (this.touchSteer = 0));
    this.bindHold(right, () => (this.touchSteer = 1), () => this.touchSteer === 1 && (this.touchSteer = 0));
    this.bindHold(boost, () => (this.touchBoost = true), () => (this.touchBoost = false));
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  emit(name) {
    this.handlers[name]?.();
  }

  any(codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** Continuous steering axis in [-1, 1]. */
  get steer() {
    const k = (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0);
    return k || this.touchSteer;
  }

  get boost() {
    return this.any(BOOST) || this.touchBoost;
  }

  get brake() {
    return this.any(BRAKE);
  }

  takeLaneShift() {
    if (!this.laneShifts) return 0;
    const dir = Math.sign(this.laneShifts);
    this.laneShifts -= dir;
    return dir;
  }

  takeBoostTap() {
    const b = this.boostTap;
    this.boostTap = false;
    return b;
  }

  reset() {
    this.keys.clear();
    this.touchSteer = 0;
    this.touchBoost = false;
    this.laneShifts = 0;
    this.boostTap = false;
  }
}
