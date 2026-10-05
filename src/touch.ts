// On-screen controls for phones and tablets: a floating move stick on the left,
// drag-to-look on the right, and hold buttons for fire / up / down / sprint.
// Buttons that map to keyboard keys write straight into the game's key set, so the
// rest of the game doesn't care where input came from.

/** Phones/tablets (coarse primary pointer). `?touch=1` / `?touch=0` force it either way. */
export const isTouchDevice = () => {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
};

export interface TouchHooks {
  onBandage(): void;
  onShop(): void;
  onPause(): void;
}

const STICK_RADIUS = 56;
const LOOK_SENSITIVITY = 0.0055;

export class TouchControls {
  root: HTMLDivElement;
  /** Analog move vector: x = strafe right, y = forward. Length 0..1. */
  move = { x: 0, y: 0 };
  /** Accumulated look delta in radians since last consume(). */
  private look = { yaw: 0, pitch: 0 };
  fireHeld = false;
  private shopBtn: HTMLButtonElement;
  private bandageBtn: HTMLButtonElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };

  constructor(private keys: Set<string>, hooks: TouchHooks) {
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div class="t-zone t-move"></div>
      <div class="t-zone t-look"></div>
      <div class="t-stick"><div class="t-knob"></div></div>
      <button class="t-btn t-fire" aria-label="Fire">FIRE</button>
      <button class="t-btn t-up" aria-label="Swim up">▲</button>
      <button class="t-btn t-down" aria-label="Dive">▼</button>
      <button class="t-btn t-sprint" aria-label="Sprint">»</button>
      <button class="t-btn t-bandage" aria-label="Use bandage">✚</button>
      <button class="t-btn t-pause" aria-label="Pause">❚❚</button>
      <button class="t-btn t-shop hidden" aria-label="Open shop">SHOP</button>`;
    document.body.appendChild(root);
    this.root = root;
    this.stickBase = root.querySelector('.t-stick')!;
    this.stickKnob = root.querySelector('.t-knob')!;
    this.shopBtn = root.querySelector('.t-shop')!;
    this.bandageBtn = root.querySelector('.t-bandage')!;

    // Move stick: appears wherever the left thumb lands.
    const moveZone = root.querySelector<HTMLDivElement>('.t-move')!;
    moveZone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      moveZone.setPointerCapture(e.pointerId);
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stickBase.style.left = `${e.clientX}px`;
      this.stickBase.style.top = `${e.clientY}px`;
      this.stickBase.classList.add('active');
      this.updateStick(e.clientX, e.clientY);
    });
    moveZone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.updateStick(e.clientX, e.clientY);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.move = { x: 0, y: 0 };
      this.stickKnob.style.transform = 'translate(-50%, -50%)';
      this.stickBase.classList.remove('active');
    };
    moveZone.addEventListener('pointerup', endStick);
    moveZone.addEventListener('pointercancel', endStick);

    // Look: drag anywhere on the right side.
    const lookZone = root.querySelector<HTMLDivElement>('.t-look')!;
    lookZone.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      lookZone.setPointerCapture(e.pointerId);
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.look.yaw -= (e.clientX - this.lookLast.x) * LOOK_SENSITIVITY;
      this.look.pitch -= (e.clientY - this.lookLast.y) * LOOK_SENSITIVITY;
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => {
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);

    // Hold buttons. Fire also lets you aim by dragging while held.
    this.hold('.t-fire', (on) => (this.fireHeld = on), true);
    this.hold('.t-up', (on) => this.key('Space', on));
    this.hold('.t-down', (on) => this.key('KeyC', on));
    this.hold('.t-sprint', (on) => this.key('ShiftLeft', on));
    this.tap('.t-bandage', () => hooks.onBandage());
    this.tap('.t-shop', () => hooks.onShop());
    this.tap('.t-pause', () => hooks.onPause());

    // No browser gestures (scroll, pinch-zoom, long-press menu) while playing.
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updateStick(x: number, y: number) {
    let dx = x - this.stickOrigin.x;
    let dy = y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // Small dead zone so a resting thumb doesn't drift.
    const m = Math.min(1, len / STICK_RADIUS);
    const k = m < 0.12 ? 0 : (m - 0.12) / 0.88 / Math.max(m, 1e-6);
    this.move = { x: (dx / STICK_RADIUS) * k, y: (-dy / STICK_RADIUS) * k };
  }

  private key(code: string, on: boolean) {
    if (on) this.keys.add(code);
    else this.keys.delete(code);
  }

  private hold(sel: string, cb: (on: boolean) => void, dragLooks = false) {
    const b = this.root.querySelector<HTMLButtonElement>(sel)!;
    let id: number | null = null;
    let last = { x: 0, y: 0 };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      b.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
      b.classList.add('down');
      cb(true);
    });
    if (dragLooks)
      b.addEventListener('pointermove', (e) => {
        if (e.pointerId !== id) return;
        this.look.yaw -= (e.clientX - last.x) * LOOK_SENSITIVITY;
        this.look.pitch -= (e.clientY - last.y) * LOOK_SENSITIVITY;
        last = { x: e.clientX, y: e.clientY };
      });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      b.classList.remove('down');
      cb(false);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }

  private tap(sel: string, cb: () => void) {
    const b = this.root.querySelector<HTMLButtonElement>(sel)!;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cb();
    });
  }

  /** Returns and clears the look delta gathered since the last frame. */
  consumeLook() {
    const l = this.look;
    this.look = { yaw: 0, pitch: 0 };
    return l;
  }

  setVisible(on: boolean) {
    this.root.classList.toggle('hidden', !on);
    if (!on) this.release();
  }

  setShopAvailable(on: boolean) {
    this.shopBtn.classList.toggle('hidden', !on);
  }

  setBandages(n: number) {
    this.bandageBtn.dataset.count = String(n);
    this.bandageBtn.classList.toggle('empty', n <= 0);
  }

  /** Drop every held input (e.g. when a menu opens mid-press). */
  release() {
    this.fireHeld = false;
    this.move = { x: 0, y: 0 };
    this.stickId = null;
    this.lookId = null;
    this.stickBase.classList.remove('active');
    for (const k of ['Space', 'KeyC', 'ShiftLeft']) this.keys.delete(k);
    this.root.querySelectorAll('.down').forEach((el) => el.classList.remove('down'));
  }
}
