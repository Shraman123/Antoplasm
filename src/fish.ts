import * as THREE from 'three';
import { rollIndividual, SPECIES, Species } from './config';
import { floorY, rng } from './world';

// Shared materials so dozens of fish don't each allocate their own.
export const boneMat = new THREE.MeshStandardMaterial({ color: 0xe0d6bf, roughness: 0.6 });
export const fleshMat = new THREE.MeshStandardMaterial({
  color: 0x8c1020,
  emissive: 0xff1a30,
  emissiveIntensity: 0.5,
  roughness: 0.3,
  flatShading: true,
});
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf2f2e8, roughness: 0.4 });
const deadEyeMat = new THREE.MeshStandardMaterial({ color: 0xd8c8c0, emissive: 0xff3040, emissiveIntensity: 0.6 });
const lureMat = new THREE.MeshStandardMaterial({ color: 0xff8070, emissive: 0xff2a3a, emissiveIntensity: 3 });
const stripeMat = new THREE.MeshStandardMaterial({ color: 0x3a3a1a });
const hitMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

const sphere = new THREE.SphereGeometry(1, 10, 8);
const lowSphere = new THREE.IcosahedronGeometry(1, 0);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 5);
const cone = new THREE.ConeGeometry(1, 1, 4);
const ribArc = new THREE.TorusGeometry(1, 0.07, 4, 10, Math.PI * 1.35);

const bodyMats = new Map<string, THREE.MeshStandardMaterial>();
function bodyMat(sp: Species, belly = false) {
  const key = sp.id + (belly ? 'b' : '') + Math.round(sp.infection * 10);
  let m = bodyMats.get(key);
  if (!m) {
    const c = new THREE.Color(belly ? sp.belly : sp.color);
    // Infection greys and bruises the skin.
    c.lerp(new THREE.Color(0x3a2a2a), sp.infection * 0.5);
    m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.15, flatShading: true });
    bodyMats.set(key, m);
  }
  return m;
}

interface Built {
  root: THREE.Group;
  segs: THREE.Group[];
  jaw?: THREE.Object3D;
  meshes: THREE.Mesh[];
  lure?: THREE.MeshStandardMaterial;
}

/** Procedural fish: a spine of segments; antoplasm replaces eaten segments with bare ribs and red mass. */
export function buildFish(sp: Species, seed: number): Built {
  const r = rng(seed);
  const root = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const N = sp.shape === 'eel' ? 12 : sp.large ? 9 : 7;
  const L = sp.size;
  const segLen = L / N;
  const segs: THREE.Group[] = [];
  let lure: THREE.MeshStandardMaterial | undefined;
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, p: number[], s: number[], rot?: number[]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p[0], p[1], p[2]);
    m.scale.set(s[0], s[1], s[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(m);
    meshes.push(m);
    return m;
  };

  const heightK = sp.shape === 'round' ? 0.42 : sp.shape === 'deep' ? 0.3 : sp.shape === 'flat' ? 0.16 : sp.shape === 'eel' ? 0.07 : sp.shape === 'angler' ? 0.3 : 0.18;
  const widthK = sp.shape === 'flat' ? 0.24 : sp.shape === 'deep' ? 0.15 : sp.shape === 'eel' ? 0.07 : sp.shape === 'angler' ? 0.28 : 0.12;

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1); // 0 = head, 1 = tail
    const seg = new THREE.Group();
    seg.position.z = L / 2 - t * L;
    root.add(seg);
    segs.push(seg);
    let prof = sp.shape === 'eel' ? 1 - t * 0.6 : Math.pow(Math.sin(Math.PI * (0.18 + t * 0.78)), 0.7);
    if (sp.shape === 'angler') prof = i < 2 ? 1.25 : Math.pow(Math.sin(Math.PI * (0.18 + t * 0.78)), 0.7) * 0.8;
    const h = L * heightK * prof;
    const w = L * widthK * prof;
    const head = i === 0;
    const tail = i === N - 1;
    const eaten = !head && !tail && r() < sp.infection * 0.95;

    if (eaten) {
      // Flesh gone: vertebra, ribs, and antoplasm threads.
      add(seg, cyl, boneMat, [0, 0, 0], [w * 0.18 + 0.02, segLen * 1.05, w * 0.18 + 0.02], [Math.PI / 2, 0, 0]);
      // Two rib hoops per segment, open at the belly where the flesh is gone.
      for (const dz of [-0.25, 0.25]) {
        add(seg, ribArc, boneMat, [0, 0, dz * segLen], [w * 0.95, h * 0.7, Math.max(w, h) * 0.6], [0, 0, -Math.PI / 2 - Math.PI * 0.675 + Math.PI]);
      }
      if (r() < 0.8) add(seg, lowSphere, fleshMat, [(r() - 0.5) * w * 0.5, (r() - 0.5) * h * 0.3, 0], [w * 0.45, h * 0.35, segLen * 0.45]);
      if (r() < 0.6) add(seg, cyl, fleshMat, [0, -h * 0.35, 0], [0.008 + L * 0.003, h * 0.7, 0.008 + L * 0.003], [(r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6]);
    } else {
      add(seg, sphere, bodyMat(sp), [0, h * 0.08, 0], [w, h * 0.8, segLen * 1.1]);
      add(seg, sphere, bodyMat(sp, true), [0, -h * 0.25, 0], [w * 0.9, h * 0.55, segLen * 1.05]);
      const lesions = Math.floor(sp.infection * 4 * r() + (sp.infection > 0.04 && r() < sp.infection * 3 ? 1 : 0));
      for (let k = 0; k < lesions; k++) {
        const a = r() * Math.PI * 2;
        const ls = (0.15 + r() * 0.35) * Math.max(w, h * 0.5);
        add(seg, lowSphere, fleshMat, [Math.cos(a) * w * 0.85, Math.sin(a) * h * 0.6, (r() - 0.5) * segLen * 0.5], [ls, ls, ls]);
      }
      // Bony scutes in rows along the back and flanks.
      if (sp.features?.includes('scutes') && !head) {
        for (const [x, y] of [[0, 0.85], [-0.75, 0.25], [0.75, 0.25]]) {
          const sc = Math.max(w, h) * 0.18;
          add(seg, cone, boneMat, [x * w, y * h * 0.8, 0], [sc, sc * 1.4, sc], [0, 0, -x * 1.2]);
        }
      }
      // Stripes on perch.
      if (sp.id === 'perch' && i > 0 && i < N - 1) {
        add(seg, sphere, stripeMat, [0, h * 0.15, 0], [w * 1.03, h * 0.7, segLen * 0.18]);
      }
    }

    if (head) {
      const eyeR = Math.max(0.025, L * (sp.shape === 'angler' ? 0.035 : 0.045));
      for (const side of [-1, 1]) {
        const infectedEye = sp.infection > 0.4;
        add(seg, sphere, infectedEye ? deadEyeMat : eyeWhiteMat, [side * w * 0.8, h * 0.18, segLen * 0.15], [eyeR, eyeR, eyeR]);
        if (!infectedEye) add(seg, sphere, eyeMat, [side * (w * 0.8 + eyeR * 0.5), h * 0.18, segLen * 0.2], [eyeR * 0.6, eyeR * 0.6, eyeR * 0.6]);
      }
      if (sp.shape === 'angler' || sp.infection > 0.5) {
        // Gaping jaw with teeth.
        const jaw = new THREE.Group();
        jaw.position.set(0, -h * 0.25, segLen * 0.2);
        seg.add(jaw);
        add(jaw, sphere, bodyMat(sp, true), [0, 0, segLen * 0.35], [w * 0.9, h * 0.15, segLen * 0.55]);
        for (let k = 0; k < 6; k++) {
          const x = (k / 5 - 0.5) * w * 1.4;
          add(jaw, cone, boneMat, [x, h * 0.18, segLen * 0.7], [0.015 + L * 0.008, h * 0.35, 0.015 + L * 0.008]);
        }
        jawOf.set(root, jaw);
      }
      if (sp.shape === 'angler') {
        add(seg, cyl, bodyMat(sp), [0, h * 1.1, segLen * 0.4], [0.02, h * 1.3, 0.02], [0.6, 0, 0]);
        lure = lureMat.clone(); // own copy: it brightens as the diver drifts closer
        add(seg, sphere, lure, [0, h * 1.6, segLen * 1.2], [L * 0.05, L * 0.05, L * 0.05]);
        // No PointLight here: a light per spawned fish changes the scene's light count,
        // which recompiles every material and tanks the frame rate. The emissive lure is enough.
      }
      if (sp.features?.includes('snout')) {
        add(seg, sphere, sp.infection > 0.5 ? boneMat : bodyMat(sp), [0, h * 0.05, segLen * 0.5 + L * 0.17], [w * 0.75, h * 0.06, L * 0.18]);
      }
      if (sp.features?.includes('barbels')) {
        for (const [x, z] of [[-1, 0.6], [1, 0.6], [-0.5, 0.9], [0.5, 0.9]]) {
          add(seg, cyl, bodyMat(sp, true), [x * w * 0.5, -h * 0.4, segLen * z], [0.012 * L, L * 0.08, 0.012 * L], [0.5, 0, x * 0.3]);
        }
      }
      if (sp.shape === 'flat') {
        for (const side of [-1, 1]) add(seg, cyl, bodyMat(sp, true), [side * w * 0.7, -h * 0.2, segLen * 0.7], [0.01, L * 0.25, 0.01], [Math.PI / 2.5, side * 0.6, 0]);
      }
    }

    if (tail) {
      const tailMat = sp.infection > 0.75 ? boneMat : bodyMat(sp);
      add(seg, cone, tailMat, [0, 0, -segLen * 0.9], [0.02, segLen * 1.6, Math.max(h, L * 0.12) * 1.6], [Math.PI / 2, 0, 0]);
    }
    // Dorsal fin on the middle segments.
    if (sp.shape !== 'eel' && i > 1 && i < N - 2 && !eaten) {
      add(seg, cone, sp.infection > 0.6 ? boneMat : bodyMat(sp), [0, h * 0.75, 0], [0.01, h * 0.6, segLen * 0.8]);
    }
  }
  return { root, segs, jaw: jawOf.get(root), meshes, lure };
}
const jawOf = new WeakMap<THREE.Object3D, THREE.Object3D>();

export class Fish {
  sp: Species;
  root: THREE.Group;
  segs: THREE.Group[];
  jaw?: THREE.Object3D;
  meshes: THREE.Mesh[];
  origMats: THREE.Material[];
  hp: number;
  vel = new THREE.Vector3();
  target = new THREE.Vector3();
  phase = Math.random() * 10;
  biteCd = 0;
  hitFlash = 0;
  retarget = 0;
  alive = true;
  radius: number;
  lure?: THREE.MeshStandardMaterial;
  /** Behaviour state machine (see FishManager.behave). */
  state = 'idle';
  stateT = 0;
  dir = new THREE.Vector3();
  orbit = Math.random() * Math.PI * 2;
  /** 0..1: how hard the body is shuddering, the visible tell before an attack. */
  agitate = 0;
  /** Network id in co-op (also used offline, harmlessly). */
  key = '';
  /** Co-op: divers who have hit this fish, for assist credit. */
  hitBy = new Set<string>();
  /** Co-op puppet: last position received from the host. */
  netPos?: THREE.Vector3;
  /** Seed its look was built from, so other players build the same fish. */
  seed: number;

  constructor(sp: Species, pos: THREE.Vector3, seed: number) {
    this.sp = sp;
    this.seed = seed;
    const b = buildFish(sp, seed);
    this.root = b.root;
    this.segs = b.segs;
    this.jaw = b.jaw;
    this.meshes = b.meshes;
    this.lure = b.lure;
    this.origMats = b.meshes.map((m) => m.material as THREE.Material);
    this.root.position.copy(pos);
    this.hp = sp.hp;
    this.radius = Math.max(0.45, sp.size * 0.45);
    this.target.copy(pos);
  }

  flash() {
    this.hitFlash = 0.12;
    for (const m of this.meshes) m.material = hitMat;
  }

  dispose() {
    // Geometries/materials are shared; only per-fish stripe materials leak, which is negligible.
    this.root.removeFromParent();
  }
}

export type CueKind = 'dart' | 'charge' | 'lunge' | 'shriek' | 'stalk';

export interface FishEvents {
  /** A fish bit a diver ('local' or a co-op player's id). */
  bite(fish: Fish, diver: string): void;
  /** An attack on that diver is about to land: play its warning sound. */
  cue?(fish: Fish, kind: CueKind, diver: string): void;
  /** Host: a fish was spawned (so it can be announced to other players). */
  spawned?(fish: Fish): void;
}

/** Someone in the water. Offline there is exactly one: the local player. */
export interface Diver {
  id: string;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  /** Paused, in the shop, dead: fish ignore them. */
  hidden: boolean;
}

/** Behaviour states, indexed for compact network snapshots. */
export const STATES = ['idle', 'tell', 'dart', 'tired', 'lurk', 'retreat', 'seen', 'creep', 'charge', 'recover', 'circle', 'lunge', 'hang', 'attack', 'orbit'];

/** Spawns species appropriate to the player's depth and runs their behaviour. */
export class FishManager {
  fish: Fish[] = [];
  group = new THREE.Group();
  private seed = 1;
  enabled = true;
  /** Co-op: false on non-host clients, whose fish are puppets driven by host snapshots. */
  authority = true;
  /** Prefix for fish keys, unique per host so keys never collide after a host change. */
  keyPrefix = 'f';
  private nextKey = 1;
  /** Id of the diver the fish being updated is hunting. */
  private target = 'local';
  /** QA: stop ambient spawning so a test controls exactly which fish exist. */
  spawning = true;
  /** Husk packs attack one at a time; this is the one currently allowed to. */
  private packAttacker: Fish | null = null;
  private packCd = 2;

  constructor(scene: THREE.Scene, private events: FishEvents) {
    scene.add(this.group);
  }

  speciesAt(depth: number) {
    return SPECIES.filter((s) => depth >= s.minDepth && depth <= s.maxDepth);
  }

  private spawnNear(player: THREE.Vector3) {
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 34;
      const x = player.x + Math.cos(a) * dist;
      const z = player.z + Math.sin(a) * dist;
      if (Math.hypot(x, z) > 345) continue;
      const floor = floorY(x, z);
      const y = Math.min(-1.5, Math.max(floor + 1.5, player.y + (Math.random() - 0.5) * 50));
      if (y <= floor + 1) continue;
      const opts = this.speciesAt(-y);
      if (!opts.length) continue;
      // Rarer (deeper-ranged) species within a band are less common.
      let total = 0;
      for (const o of opts) total += o.weight ?? 1;
      let pick = Math.random() * total;
      let sp = opts[0];
      for (const o of opts) {
        pick -= o.weight ?? 1;
        if (pick <= 0) {
          sp = o;
          break;
        }
      }
      sp = rollIndividual(sp, -y);
      const f = this.add(sp, new THREE.Vector3(x, y, z), this.seed++ * 977);
      this.events.spawned?.(f);
      return;
    }
  }

  add(sp: Species, pos: THREE.Vector3, seed: number, key?: string) {
    const f = new Fish(sp, pos, seed);
    f.key = key ?? `${this.keyPrefix}${this.nextKey++}`;
    this.fish.push(f);
    this.group.add(f.root);
    return f;
  }

  byKey(key: string) {
    return this.fish.find((f) => f.key === key);
  }

  remove(f: Fish) {
    if (!f.alive) return;
    if (this.packAttacker === f) this.packAttacker = null;
    f.alive = false;
    f.dispose();
    this.fish.splice(this.fish.indexOf(f), 1);
  }

  clear() {
    for (const f of [...this.fish]) this.remove(f);
  }

  update(dt: number, t: number, player: THREE.Vector3, playerHidden: boolean, look = new THREE.Vector3(0, 0, -1)) {
    this.updateAll(dt, t, [{ id: 'local', pos: player, look, hidden: playerHidden }]);
  }

  /** Run every fish against the nearest visible diver. divers[0] is the local player. */
  updateAll(dt: number, t: number, divers: Diver[]) {
    if (!this.enabled) return;
    if (!this.authority) return this.updatePuppets(dt, t, divers[0].pos);
    // Each diver keeps a school around them; a diver deep below shares nothing with one at the surface.
    if (this.spawning && this.fish.length < 22 * divers.length && Math.random() < 0.5) {
      const d = divers[Math.floor(Math.random() * divers.length)];
      const near = this.fish.filter((f) => f.root.position.distanceTo(d.pos) < 60).length;
      const want = d.pos.y > -1 ? 10 : -d.pos.y > 300 ? 16 : 22;
      if (near < want) this.spawnNear(d.pos);
    }

    const toP = new THREE.Vector3();
    const desired = new THREE.Vector3();
    this.packCd -= dt;
    const pa = this.packAttacker;
    if (pa && (!pa.alive || (pa.state !== 'attack' && pa.state !== 'tell'))) this.packAttacker = null;
    for (const f of [...this.fish]) {
      const p = f.root.position;
      // Hunt / flee whoever is closest, preferring divers who are actually in the water.
      let diver = divers[0];
      let best = Infinity;
      let anyDist = Infinity;
      for (const d of divers) {
        const dd = p.distanceTo(d.pos);
        anyDist = Math.min(anyDist, dd);
        const score = d.hidden ? dd + 1000 : dd;
        if (score < best) {
          best = score;
          diver = d;
        }
      }
      if (anyDist > 95) {
        this.remove(f);
        continue;
      }
      const player = diver.pos;
      const playerHidden = diver.hidden;
      const look = diver.look;
      const dist = p.distanceTo(player);
      this.target = diver.id;
      const sp = f.sp;
      f.biteCd -= dt;
      f.retarget -= dt;
      if (f.hitFlash > 0) {
        f.hitFlash -= dt;
        if (f.hitFlash <= 0) f.meshes.forEach((m, i) => (m.material = f.origMats[i]));
      }
      toP.subVectors(player, p);
      let speed = sp.speed * 0.45;
      const aggro = 16 + sp.infection * 26;
      f.stateT -= dt;
      f.agitate = Math.max(0, f.agitate - dt * 2);
      const special = sp.aggressive && sp.behavior && !playerHidden ? this.behave(f, dt, t, dist, toP, look, desired) : null;
      if (special !== null) {
        speed = special;
      } else if (sp.aggressive && dist < aggro && !playerHidden && f.biteCd < 0.6) {
        desired.copy(toP).normalize();
        speed = sp.speed * (1.1 + sp.infection * 0.5);
        const reach = f.radius + 1.1;
        if (dist < reach && f.biteCd <= 0) {
          this.events.bite(f, this.target);
          f.biteCd = 1.5 - sp.infection * 0.4;
          f.vel.copy(toP).normalize().multiplyScalar(-sp.speed * 1.5); // recoil
        }
      } else if (!sp.aggressive && dist < 9) {
        desired.copy(toP).normalize().negate();
        speed = sp.speed * 1.4;
      } else {
        if (f.retarget <= 0 || p.distanceTo(f.target) < 2) {
          f.retarget = 3 + Math.random() * 5;
          const mid = -(sp.minDepth + sp.maxDepth) / 2;
          f.target.set(
            p.x + (Math.random() - 0.5) * 30,
            p.y + (Math.random() - 0.5) * 8 + (mid - p.y) * 0.1,
            p.z + (Math.random() - 0.5) * 30,
          );
        }
        desired.subVectors(f.target, p).normalize();
      }
      // Infected fish twitch.
      if (sp.infection > 0.3 && Math.random() < sp.infection * 0.04) {
        f.vel.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(sp.speed * 1.6));
      }
      // Attacks snap to full speed, and a wind-up stops dead (so its aim line holds); everything else eases.
      const burst = f.state === 'dart' || f.state === 'charge' || f.state === 'lunge' || f.state === 'attack' || f.state === 'tell';
      f.vel.lerp(desired.multiplyScalar(speed), Math.min(1, dt * (burst ? 7 : 1.6)));
      p.addScaledVector(f.vel, dt);
      const floor = floorY(p.x, p.z) + 0.8;
      if (p.y < floor) p.y = floor;
      if (p.y > -1) p.y = -1;
      this.animate(f, dt, t, dist, player);
    }
  }

  /** Orientation, swim wiggle, jaw and lure: everything visual, shared by host fish and puppets. */
  private animate(f: Fish, dt: number, t: number, dist: number, player: THREE.Vector3) {
      const p = f.root.position;
      const sp = f.sp;
      if (f.state === 'tell') {
        // Wind-up: point down the locked attack line so it's readable (husks home in instead).
        const q0 = f.root.quaternion.clone();
        f.root.lookAt(f.sp.behavior === 'pack' || !f.dir.lengthSq() ? player : p.clone().add(f.dir));
        f.root.quaternion.copy(q0.slerp(f.root.quaternion, Math.min(1, dt * 8)));
      } else if (f.vel.lengthSq() > 0.01) {
        const look = p.clone().add(f.vel);
        const q0 = f.root.quaternion.clone();
        f.root.lookAt(look);
        f.root.quaternion.copy(q0.slerp(f.root.quaternion, Math.min(1, dt * 5)));
      }
      // Swim wiggle down the spine.
      const freq = 4 + f.vel.length() * 1.5 + f.agitate * 22;
      f.phase += dt * freq;
      const amp = (sp.shape === 'eel' ? 0.35 : 0.22) * (1 + f.agitate * 1.2);
      f.segs.forEach((s, i) => {
        const k = i / (f.segs.length - 1);
        s.position.x = Math.sin(f.phase - i * 0.9) * amp * k * k * sp.size * 0.5;
        s.rotation.y = Math.cos(f.phase - i * 0.9) * amp * k;
      });
      const gape = f.state === 'tell' || f.state === 'lunge' ? 0.7 : 0;
      if (f.jaw) f.jaw.rotation.x = 0.15 + Math.max(0, Math.sin(t * 3 + f.phase)) * 0.35 + (f.biteCd > 1 ? 0.5 : 0) + gape;
      if (f.lure) {
        const glow = f.state === 'tell' ? 9 + Math.sin(t * 40) * 3 : 2 + 5 * Math.max(0, 1 - dist / 22);
        f.lure.emissiveIntensity = glow * (0.85 + 0.15 * Math.sin(t * 2.3 + f.phase));
      }
  }

  /** Non-host: glide each fish toward the host's last reported position, then animate it. */
  private updatePuppets(dt: number, t: number, me: THREE.Vector3) {
    for (const f of this.fish) {
      if (f.hitFlash > 0) {
        f.hitFlash -= dt;
        if (f.hitFlash <= 0) f.meshes.forEach((m, i) => (m.material = f.origMats[i]));
      }
      const p = f.root.position;
      if (f.netPos) {
        f.netPos.addScaledVector(f.vel, dt); // extrapolate between snapshots
        p.lerp(f.netPos, Math.min(1, dt * 8));
      }
      f.agitate = Math.max(0, f.agitate - dt * 0.5);
      this.animate(f, dt, t, p.distanceTo(me), me);
    }
  }

  /** Host: compact state of every fish for other players. */
  snapshot(): (string | number)[][] {
    const r = (v: number) => Math.round(v * 100) / 100;
    return this.fish.map((f) => {
      const p = f.root.position;
      return [f.key, r(p.x), r(p.y), r(p.z), r(f.vel.x), r(f.vel.y), r(f.vel.z), STATES.indexOf(f.state), Math.round(f.agitate * 9), r(f.dir.x), r(f.dir.y), r(f.dir.z)];
    });
  }

  /** Non-host: apply a snapshot. Returns keys we don't have yet (ask the host to describe them). */
  applySnapshot(rows: (string | number)[][]): string[] {
    const seen = new Set<string>();
    const missing: string[] = [];
    for (const row of rows) {
      const [key, x, y, z, vx, vy, vz, st, ag, dx, dy, dz] = row as [string, ...number[]];
      seen.add(key);
      const f = this.byKey(key);
      if (!f) {
        missing.push(key);
        continue;
      }
      if (!f.netPos) {
        f.netPos = new THREE.Vector3(x, y, z);
        f.root.position.set(x, y, z);
      } else f.netPos.set(x, y, z);
      f.vel.set(vx, vy, vz);
      f.state = STATES[st] ?? 'idle';
      f.agitate = Math.max(f.agitate, ag / 9);
      f.dir.set(dx ?? 0, dy ?? 0, dz ?? 0);
    }
    for (const f of [...this.fish]) if (!seen.has(f.key)) this.remove(f);
    return missing;
  }

  /** Host handover: puppets become real fish (their AI restarts from a calm state). */
  takeAuthority(prefix: string) {
    this.authority = true;
    this.keyPrefix = prefix;
    for (const f of this.fish) {
      f.netPos = undefined;
      f.state = 'idle';
      f.target.copy(f.root.position);
    }
  }

  private bite(f: Fish, dist: number, extraReach = 0) {
    if (dist < f.radius + 1.1 + extraReach && f.biteCd <= 0) {
      this.events.bite(f, this.target);
      f.biteCd = 1.5 - f.sp.infection * 0.4;
      return true;
    }
    return false;
  }

  private go(f: Fish, state: string, secs: number, aimAt?: THREE.Vector3) {
    f.state = state;
    f.stateT = secs;
    // The attack line is fixed when the tell starts, so the tell shows exactly where it will
    // go and moving off that line during the wind-up dodges it.
    if (aimAt) f.dir.copy(aimAt);
  }

  /**
   * Species-specific hunting. Writes the swim direction into `desired` and returns the speed,
   * or null to fall back to the default chase/wander. Every attack has a tell first:
   * a shudder (agitate), an open jaw or a brightening lure, plus a sound cue.
   */
  private behave(f: Fish, dt: number, t: number, dist: number, toP: THREE.Vector3, look: THREE.Vector3, desired: THREE.Vector3): number | null {
    const sp = f.sp;
    const dirP = toP.clone().normalize();
    const hurt = f.hp < sp.hp;
    const cue = (k: CueKind) => this.events.cue?.(f, k, this.target);
    switch (sp.behavior) {
      case 'ambush': {
        // Lurks almost still; flexes, then darts in a straight line. Tired afterwards: shoot it then.
        if (f.state === 'tell') {
          f.agitate = 1;
          desired.copy(f.dir).negate();
          if (f.stateT <= 0) {
            this.go(f, 'dart', 1.0);
            cue('dart');
          }
          return sp.speed * 0.3;
        }
        if (f.state === 'dart') {
          desired.copy(f.dir);
          if (this.bite(f, dist, 0.4) || f.stateT <= 0) this.go(f, 'tired', 2.2);
          return sp.speed * 3.4;
        }
        if (f.state === 'tired') {
          if (f.stateT <= 0) this.go(f, 'lurk', 0);
          desired.copy(dirP);
          return sp.speed * 0.25;
        }
        if (dist < 30) {
          if (f.state !== 'lurk') this.go(f, 'lurk', 0);
          if ((dist < 15 || hurt) && f.biteCd <= 0) {
            this.go(f, 'tell', 0.5, dirP);
            return 0;
          }
          desired.copy(dirP);
          return sp.speed * 0.12;
        }
        return null;
      }
      case 'weave': {
        // Snakes in on a side-to-side line (hard to hit), bites, then backs off to come again.
        if (f.state === 'retreat') {
          if (f.stateT <= 0) this.go(f, 'idle', 0);
          desired.copy(dirP).negate();
          return sp.speed * 1.3;
        }
        if (dist < 30) {
          const side = new THREE.Vector3(-dirP.z, 0, dirP.x);
          desired.copy(dirP).addScaledVector(side, Math.sin(t * 2.6 + f.orbit) * 1.4).normalize();
          if (this.bite(f, dist)) this.go(f, 'retreat', 2.5);
          return sp.speed * 1.25;
        }
        return null;
      }
      case 'stalk': {
        // Only moves in while you aren't looking at it. Face it and it backs off into the dark.
        if (dist > 34) return null;
        if (f.state === 'retreat') {
          if (f.stateT <= 0) this.go(f, 'idle', 0);
          desired.copy(dirP).negate();
          return sp.speed * 1.2;
        }
        const seen = -look.dot(dirP) > 0.8 && dist < 30;
        if (seen) {
          if (f.state !== 'seen') this.go(f, 'seen', 0);
          desired.copy(dirP).negate();
          return dist < 14 ? sp.speed * 0.7 : sp.speed * 0.05;
        }
        if (f.state !== 'creep') {
          this.go(f, 'creep', 0);
          if (dist < 20) cue('stalk');
        }
        desired.copy(dirP);
        if (this.bite(f, dist)) this.go(f, 'retreat', 3);
        return sp.speed * (dist < 8 ? 1.6 : 1.1);
      }
      case 'charge': {
        // Circles, stops and shudders (growl), then rams in a straight line and overshoots.
        if (f.state === 'tell') {
          f.agitate = 1;
          desired.copy(dirP).multiplyScalar(0.01);
          if (f.stateT <= 0) {
            this.go(f, 'charge', 1.8);
          }
          return 0.05;
        }
        if (f.state === 'charge') {
          desired.copy(f.dir);
          this.bite(f, dist, 0.6);
          // Overshoot: keep going until well past the diver, then recover.
          if (f.stateT <= 0 || (f.dir.dot(dirP) < -0.3 && dist > 9)) this.go(f, 'recover', 1.6);
          return sp.speed * 3.6;
        }
        if (f.state === 'recover') {
          if (f.stateT <= 0) this.go(f, 'circle', 3 + Math.random() * 3);
          desired.copy(f.dir).lerp(dirP, 0.3).normalize();
          return sp.speed * 0.5;
        }
        if (dist < 36) {
          if (f.state !== 'circle') this.go(f, 'circle', 2.5 + Math.random() * 3);
          const tangent = new THREE.Vector3(-dirP.z, 0, dirP.x);
          desired.copy(tangent).addScaledVector(dirP, (dist - 17) * 0.3).normalize();
          if ((f.stateT <= 0 || hurt) && dist < 34) {
            this.go(f, 'tell', 0.9, dirP);
            cue('charge');
          }
          return sp.speed * 0.9;
        }
        return null;
      }
      case 'lure': {
        // Hangs in the dark, lure brightening as you come close. Get within ~8 m and it lunges.
        if (f.state === 'tell') {
          desired.copy(dirP).multiplyScalar(0.01);
          if (f.stateT <= 0) {
            this.go(f, 'lunge', 0.7);
            cue('lunge');
          }
          return 0.05;
        }
        if (f.state === 'lunge') {
          desired.copy(f.dir);
          if (this.bite(f, dist, 0.9) || f.stateT <= 0) this.go(f, 'retreat', 2.4);
          return sp.speed * 4.2;
        }
        if (f.state === 'retreat') {
          if (f.stateT <= 0) this.go(f, 'hang', 0);
          desired.copy(dirP).negate();
          return sp.speed * 0.6;
        }
        if (dist < 40) {
          if (f.state !== 'hang') this.go(f, 'hang', 0);
          if ((dist < 8 || hurt) && f.biteCd <= 0) {
            this.go(f, 'tell', 0.35, dirP);
            return 0;
          }
          desired.copy(dirP); // just turns to face you
          return 0.08;
        }
        return null;
      }
      case 'pack': {
        // Circles with the others; one at a time breaks off (with a shriek) to attack.
        if (f.state === 'tell') {
          f.agitate = 1;
          desired.copy(dirP);
          if (f.stateT <= 0) this.go(f, 'attack', 2.2);
          return sp.speed * 0.2;
        }
        if (f.state === 'attack') {
          desired.copy(dirP);
          if (this.bite(f, dist) || f.stateT <= 0) {
            this.go(f, 'orbit', 0);
            this.packAttacker = null;
            this.packCd = 1.6 + Math.random() * 1.8;
          }
          return sp.speed * 2.2;
        }
        if (dist < 40) {
          if (f.state !== 'orbit') this.go(f, 'orbit', 0);
          f.orbit += dt * 0.5;
          const ring = 11 + Math.sin(f.orbit * 1.7 + f.phase * 0.01) * 2;
          const tangent = new THREE.Vector3(-dirP.z, 0, dirP.x);
          desired.copy(tangent).addScaledVector(dirP, (dist - ring) * 0.15);
          desired.y += Math.sin(f.orbit * 2.3) * 0.2;
          desired.normalize();
          if (!this.packAttacker && this.packCd <= 0 && dist < 22 && f.biteCd <= 0) {
            this.packAttacker = f;
            this.go(f, 'tell', 0.6);
            cue('shriek');
          }
          return sp.speed * 0.8;
        }
        return null;
      }
    }
    return null;
  }
}
