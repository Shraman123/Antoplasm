// Other co-op divers: a simple suited figure with a tank, fins, a fake headlamp beam (no real
// light — per-entity lights force shader recompiles) and a floating name tag. Positions are
// buffered and drawn ~120 ms in the past so 8 Hz updates look smooth.
import * as THREE from 'three';
import type { DiverState } from './coop';

interface Sample { t: number; s: DiverState }
interface Avatar { root: THREE.Group; body: THREE.Group; fins: THREE.Mesh[]; tag: THREE.Sprite; beam: THREE.Mesh; buf: Sample[]; name: string; color: number; shown: DiverState | null }

const DELAY = 120;

function nameTag(name: string, color: number) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '600 30px "IBM Plex Mono", monospace';
  const w = Math.min(244, g.measureText(name).width + 28);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 8, w, 46, 14);
  g.fill();
  g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 128, 32, 230);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.4, 0.6, 1);
  sp.renderOrder = 10;
  return sp;
}

function buildDiver(color: number) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const suit = new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a9399, metalness: 0.6, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fe6ff, emissive: 0x4ab8e0, emissiveIntensity: 0.6, roughness: 0.1 });
  // The figure swims face-down along -Z, like the player does.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.75, 4, 10), suit);
  torso.rotation.x = Math.PI / 2;
  body.add(torso);
  const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.29, 0.2, 4, 10), accent);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.z = 0.05;
  body.add(stripe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), suit);
  head.position.set(0, 0.05, -0.68);
  body.add(head);
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  mask.rotation.x = -Math.PI / 2;
  mask.position.set(0, 0.02, -0.82);
  body.add(mask);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 10), metal);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0, 0.32, 0.05);
  body.add(tank);
  const fins: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.55, 3, 8), suit);
    leg.rotation.x = Math.PI / 2;
    leg.position.set(side * 0.13, -0.02, 0.85);
    body.add(leg);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.5), accent);
    fin.position.set(side * 0.13, -0.02, 1.3);
    body.add(fin);
    fins.push(fin);
  }
  // Fake lamp beam: additive cone, brightest at the head.
  const beamGeo = new THREE.ConeGeometry(2.2, 14, 20, 1, true);
  beamGeo.translate(0, -7, 0);
  beamGeo.rotateX(Math.PI / 2);
  beamGeo.rotateX(Math.PI);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(0, 0.05, -0.8);
  root.add(beam);
  return { root, body, fins, beam };
}

const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * t;

export class RemoteDivers {
  private avatars = new Map<string, Avatar>();
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  /** Make sure the set of avatars matches the room. */
  sync(peers: { id: string; name: string; color: number }[]) {
    const keep = new Set(peers.map((p) => p.id));
    for (const [id, a] of this.avatars) if (!keep.has(id)) {
      a.root.removeFromParent();
      this.avatars.delete(id);
    }
    for (const p of peers) {
      const a = this.avatars.get(p.id);
      if (a && a.name === p.name && a.color === p.color) continue;
      if (a) a.root.removeFromParent();
      const d = buildDiver(p.color);
      const tag = nameTag(p.name, p.color);
      tag.position.set(0, 1.1, 0);
      d.root.add(tag);
      d.root.visible = false;
      this.group.add(d.root);
      this.avatars.set(p.id, { ...d, tag, buf: a?.buf ?? [], name: p.name, color: p.color, shown: null });
    }
  }

  push(id: string, s: DiverState) {
    const a = this.avatars.get(id);
    if (!a) return;
    a.buf.push({ t: performance.now(), s });
    if (a.buf.length > 20) a.buf.shift();
  }

  /** Interpolated state of every diver, for fish AI and the HUD. */
  states() {
    return [...this.avatars.entries()].filter(([, a]) => a.shown).map(([id, a]) => ({ id, s: a.shown!, pos: a.root.position }));
  }

  update(dt: number, time: number) {
    const now = performance.now() - DELAY;
    for (const a of this.avatars.values()) {
      if (!a.buf.length) continue;
      let i = a.buf.length - 1;
      while (i > 0 && a.buf[i - 1].t > now) i--;
      const b = a.buf[i];
      const prev = a.buf[i - 1] ?? b;
      const k = b.t === prev.t ? 1 : THREE.MathUtils.clamp((now - prev.t) / (b.t - prev.t), 0, 1);
      const s: DiverState = {
        ...b.s,
        x: THREE.MathUtils.lerp(prev.s.x, b.s.x, k),
        y: THREE.MathUtils.lerp(prev.s.y, b.s.y, k),
        z: THREE.MathUtils.lerp(prev.s.z, b.s.z, k),
        yaw: lerpAngle(prev.s.yaw, b.s.yaw, k),
        pitch: THREE.MathUtils.lerp(prev.s.pitch, b.s.pitch, k),
      };
      const moving = a.shown ? Math.hypot(s.x - a.shown.x, s.y - a.shown.y, s.z - a.shown.z) / Math.max(dt, 1e-3) : 0;
      a.shown = s;
      a.root.position.set(s.x, s.y - 0.25, s.z);
      a.root.rotation.set(0, s.yaw, 0, 'YXZ');
      a.body.rotation.x = s.pitch * 0.8;
      a.beam.rotation.x = s.pitch;
      a.root.visible = !s.hidden;
      // Fin kick speeds up with swimming.
      const kick = Math.sin(time * (3 + Math.min(moving, 12) * 0.6));
      a.fins[0].rotation.x = kick * 0.35;
      a.fins[1].rotation.x = -kick * 0.35;
      a.tag.material.opacity = s.hidden ? 0 : 1;
    }
  }

  private tracers: { obj: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private tracerGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.6, 5).rotateX(Math.PI / 2);
  private tracerMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ee });

  /** Another diver fired: show their spear / flechettes flying. */
  shot(o: number[], d: number[], speed: number, pellets = 1) {
    const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    for (let i = 0; i < pellets; i++) {
      const spread = pellets > 1 ? 0.12 : 0;
      const v = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)).normalize();
      const obj = new THREE.Mesh(this.tracerGeo, this.tracerMat);
      obj.position.set(o[0], o[1], o[2]);
      obj.lookAt(obj.position.clone().add(v));
      this.group.add(obj);
      this.tracers.push({ obj, vel: v.multiplyScalar(speed), life: pellets > 1 ? 0.35 : 0.9 });
    }
  }

  updateTracers(dt: number) {
    for (const t of [...this.tracers]) {
      t.life -= dt;
      t.obj.position.addScaledVector(t.vel, dt);
      t.vel.multiplyScalar(Math.exp(-0.6 * dt));
      if (t.life <= 0) {
        t.obj.removeFromParent();
        this.tracers.splice(this.tracers.indexOf(t), 1);
      }
    }
  }

  clear() {
    this.sync([]);
  }
}
