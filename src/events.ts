import * as THREE from 'three';
import { fleshMat } from './fish';

// One-time scripted scares on the way down, so the dread builds before the ending instead of
// only at it. Each fires once per save (its id is stored in save.logs, like the depth logs).

export const EVENT_IDS = { shadow: 10001, blackout: 10002, radio: 10003, beneath: 10004, eyes: 10005 } as const;

export interface EventHooks {
  scene: THREE.Scene;
  camera: THREE.Camera;
  seen(id: number): boolean;
  mark(id: number): void;
  log(text: string, secs?: number): void;
  shake(amount: number): void;
  /** Multiplies the flashlight (1 = normal, 0 = dead). */
  lamp(mult: number): void;
  sound: {
    whale(vol: number, base: number): void;
    rumble(dur: number, vol: number): void;
    heartbeat(vol: number): void;
    sting(): void;
    radio(): void;
  };
}

const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b0d0d, roughness: 1, flatShading: true });

/** The thing in the trench, seen from a distance: whale-shaped, rotten through. */
function buildLeviathan(len: number) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), darkMat);
  body.scale.set(len * 0.11, len * 0.09, len * 0.5);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(len * 0.12, len * 0.03, 4), darkMat);
  tail.scale.set(1, 1, 0.25);
  tail.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  tail.position.z = -len * 0.52;
  g.add(tail);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(len * 0.22, len * 0.008, len * 0.07), darkMat);
    fin.position.set(s * len * 0.13, -len * 0.04, len * 0.15);
    fin.rotation.z = s * 0.35;
    g.add(fin);
  }
  // Wet red patches where the rot shows through.
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), fleshMat);
    const a = Math.random() * Math.PI * 2;
    m.position.set(Math.cos(a) * len * 0.1, Math.sin(a) * len * 0.08, (Math.random() - 0.5) * len * 0.7);
    m.scale.setScalar(len * (0.015 + Math.random() * 0.025));
    g.add(m);
  }
  return g;
}

/** A drowned diver, slowly turning in the water. */
function buildDiver() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x26302f, roughness: 0.85 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x7a6a3a, roughness: 0.4, metalness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 10), suit);
  g.add(body);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), brass);
  helmet.position.y = 0.78;
  g.add(helmet);
  const plate = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), glass);
  plate.position.set(0, 0.8, 0.29);
  g.add(plate);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.75, 10), brass);
  tank.position.set(0, 0.15, -0.3);
  g.add(tank);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 3, 8), suit);
    arm.position.set(s * 0.38, 0.25, 0.1);
    arm.rotation.set(-0.9, 0, s * 0.5); // arms drifting up and forward
    g.add(arm);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.7, 3, 8), suit);
    leg.position.set(s * 0.14, -0.85, 0);
    leg.rotation.x = s * 0.25;
    g.add(leg);
  }
  // Antoplasm through the suit seams.
  for (const [x, y, z, r] of [[0.2, 0.1, 0.22, 0.12], [-0.15, -0.3, 0.2, 0.09], [0.05, 0.55, 0.2, 0.07], [-0.3, 0.3, 0.05, 0.08]]) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), fleshMat);
    m.position.set(x, y, z);
    m.scale.setScalar(r);
    g.add(m);
  }
  return g;
}

interface Running {
  t: number;
  dur: number;
  step(t: number, dt: number): void;
  end(): void;
}

export class HorrorEvents {
  private running: Running[] = [];

  constructor(private h: EventHooks) {}

  /** Stop everything mid-way (death, ending). The event stays marked as seen. */
  reset() {
    for (const r of this.running) r.end();
    this.running = [];
  }

  /** True while a scripted moment is playing (callers can hold off other scares). */
  get busy() {
    return this.running.length > 0;
  }

  update(dt: number, depth: number, playing: boolean) {
    for (const r of [...this.running]) {
      r.t += dt;
      r.step(r.t, dt);
      if (r.t >= r.dur) {
        r.end();
        this.running.splice(this.running.indexOf(r), 1);
      }
    }
    if (!playing || this.busy) return;
    const ids = EVENT_IDS;
    if (depth >= 140 && !this.h.seen(ids.shadow)) this.fire(ids.shadow, () => this.pass(55, 70, 14, 0, 'Something passed at the edge of the light. Something the size of a ferry.'));
    else if (depth >= 235 && !this.h.seen(ids.blackout)) this.fire(ids.blackout, () => this.blackout());
    else if (depth >= 330 && !this.h.seen(ids.radio)) this.fire(ids.radio, () => this.radio());
    else if (depth >= 420 && !this.h.seen(ids.beneath)) this.fire(ids.beneath, () => this.pass(0, 110, 16, -26, 'It went under me. It took a long time to go under me.'));
    else if (depth >= 520 && !this.h.seen(ids.eyes)) this.fire(ids.eyes, () => this.eyes());
  }

  /** Debug/QA: play one by id regardless of depth. */
  trigger(name: keyof typeof EVENT_IDS) {
    const map = { shadow: () => this.pass(55, 70, 14, 0, ''), blackout: () => this.blackout(), radio: () => this.radio(), beneath: () => this.pass(0, 110, 16, -26, ''), eyes: () => this.eyes() };
    map[name]();
  }

  private fire(id: number, run: () => void) {
    this.h.mark(id);
    run();
  }

  private basis() {
    const cam = this.h.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return { pos: cam.position.clone(), fwd, right };
  }

  /** The leviathan crosses the view: `ahead` metres in front, `dy` above/below, over `secs`. */
  private pass(ahead: number, len: number, secs: number, dy: number, text: string) {
    const { pos, fwd, right } = this.basis();
    const beast = buildLeviathan(len);
    const span = 150;
    const from = pos.clone().addScaledVector(fwd, ahead).addScaledVector(right, -span).add(new THREE.Vector3(0, dy, 0));
    const to = pos.clone().addScaledVector(fwd, ahead).addScaledVector(right, span).add(new THREE.Vector3(0, dy, 0));
    beast.position.copy(from);
    beast.lookAt(to);
    this.h.scene.add(beast);
    this.h.sound.whale(0.7, dy < 0 ? 45 : 55);
    this.h.sound.rumble(secs * 0.6, dy < 0 ? 1.0 : 0.6);
    let logged = false;
    this.running.push({
      t: 0,
      dur: secs,
      step: (t) => {
        const k = t / secs;
        beast.position.lerpVectors(from, to, k);
        beast.rotation.z = Math.sin(t * 0.7) * 0.06; // slow roll as it swims
        if (dy < 0) this.h.shake(0.35 * Math.sin(Math.PI * k));
        if (!logged && k > 0.55 && text) {
          logged = true;
          this.h.log(text, 7);
        }
      },
      end: () => beast.removeFromParent(),
    });
  }

  /** Lamp dies; when it comes back, a drowned diver is right in front of you. */
  private blackout() {
    const diver = buildDiver();
    diver.visible = false;
    this.h.scene.add(diver);
    let revealed = false;
    let beat = 0;
    this.running.push({
      t: 0,
      dur: 14,
      step: (t, dt) => {
        if (t < 3.2) {
          // Dead lamp with a couple of failing sputters.
          this.h.lamp(t > 1.1 && t < 1.25 ? 0.4 : 0);
          beat -= dt;
          if (beat <= 0) {
            this.h.sound.heartbeat(0.8);
            beat = 0.75;
          }
          return;
        }
        if (!revealed) {
          revealed = true;
          this.h.lamp(1);
          // Put it where the diver is looking now, not where they were.
          const b = this.basis();
          diver.position.copy(b.pos).addScaledVector(b.fwd, 3.2).add(new THREE.Vector3(0, -0.3, 0));
          diver.lookAt(b.pos);
          diver.visible = true;
          this.h.sound.sting();
          this.h.shake(0.5);
          this.h.log('A diver. The name on the suit reads TEODOROV. The tank is still half full.', 9);
        }
        diver.position.y -= dt * 0.15;
        diver.rotation.y += dt * 0.12;
      },
      end: () => {
        this.h.lamp(1);
        diver.removeFromParent();
      },
    });
  }

  private radio() {
    this.h.sound.radio();
    this.running.push({
      t: 0,
      dur: 1.2,
      step: () => {},
      end: () => this.h.log('RADIO: "...he went down for the big ones too. My boy. I told him what I told you — the prices are good deeper..." [static]', 10),
    });
  }

  /** A ring of red eyes in the dark that blink out one pair at a time. */
  private eyes() {
    const { pos } = this.basis();
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8, fog: false }) // eyeshine: pale gold, unlike the red flesh around;
    const pairs: THREE.Group[] = [];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const r = 13 + Math.random() * 8;
      const pair = new THREE.Group();
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), eyeMat);
        e.position.x = s * 0.8;
        pair.add(e);
      }
      pair.position.set(pos.x + Math.cos(a) * r, pos.y + (Math.random() - 0.5) * 10, pos.z + Math.sin(a) * r);
      pair.lookAt(pos);
      this.h.scene.add(pair);
      pairs.push(pair);
    }
    this.h.lamp(0.15);
    this.h.sound.whale(0.5, 90);
    const order = pairs.map((_, i) => i).sort(() => Math.random() - 0.5);
    this.h.log("They're all around me. Watching. Waiting for the light to go.", 7);
    this.running.push({
      t: 0,
      dur: 7,
      step: (t) => {
        // After 2.5 s, pairs blink out one by one.
        const gone = Math.floor(Math.max(0, t - 2.5) * 3.6);
        for (let i = 0; i < order.length; i++) pairs[order[i]].visible = i >= gone;
      },
      end: () => {
        for (const p of pairs) p.removeFromParent();
        this.h.lamp(1);
      },
    });
  }
}
