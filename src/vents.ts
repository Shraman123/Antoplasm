import * as THREE from 'three';
import { floorY, rng } from './world';

// Hydrothermal vents from the Weeping Depths down. Their bubble columns are breathable:
// swim into one to top up your tank. Each vent holds a limited reserve that slowly recovers.

export const VENT_MIN_DEPTH = 260;
const COLUMN_HEIGHT = 32; // how far above the chimney the bubbles stay breathable
const COLUMN_RADIUS = 5;
const RESERVE = 45; // air-seconds a full vent can give
const RECHARGE = 0.6; // air-seconds per second
const FLOW = 16; // air-seconds per second while breathing
const BUBBLES_PER_VENT = 60;

interface Vent {
  top: THREE.Vector3;
  reserve: number;
  glow: THREE.Sprite;
  mouth: THREE.MeshStandardMaterial;
}

function radialTexture(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Vents {
  list: Vent[] = [];
  group = new THREE.Group();
  private bubbles: THREE.Points;
  private bubbleBase: Float32Array; // per bubble: phase, speed, angle, radius
  /** Vent the player is currently breathing from (null if none). */
  active: Vent | null = null;

  constructor(parent: THREE.Object3D, growthMat: THREE.Material) {
    parent.add(this.group);
    const r = rng(2024);
    const basalt = new THREE.MeshStandardMaterial({ color: 0x2a2522, roughness: 1, flatShading: true });
    const crust = new THREE.MeshStandardMaterial({ color: 0x7a6a3a, roughness: 0.9, flatShading: true });
    const glowTex = radialTexture('rgba(255,150,60,0.9)', 'rgba(255,60,20,0)');
    const sph = new THREE.IcosahedronGeometry(1, 1);

    // Scatter vents over the deep floor, kept apart so each feels like a landmark.
    const spots: THREE.Vector3[] = [];
    for (let i = 0; i < 4000 && spots.length < 16; i++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * 200;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const y = floorY(x, z);
      if (-y < VENT_MIN_DEPTH || -y > 612) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 28)) continue;
      spots.push(new THREE.Vector3(x, y, z));
    }

    for (const base of spots) {
      const v = new THREE.Group();
      v.position.copy(base);
      const mound = new THREE.Mesh(new THREE.ConeGeometry(4.5, 3, 9), basalt);
      mound.position.y = 1;
      v.add(mound);
      // Chimney: stacked, tapering, slightly crooked sections with mineral bands.
      let y = 2.2;
      let rad = 1.6;
      const sections = 3 + Math.floor(r() * 3);
      const lean = new THREE.Vector2((r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
      for (let s = 0; s < sections; s++) {
        const h = 1.8 + r() * 1.6;
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.8, rad, h, 8), basalt);
        seg.position.set(lean.x * y * 0.3, y + h / 2, lean.y * y * 0.3);
        v.add(seg);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.86, rad * 0.9, 0.25, 8), crust);
        band.position.set(seg.position.x, y + 0.15, seg.position.z);
        v.add(band);
        y += h;
        rad *= 0.82;
      }
      const top = new THREE.Vector3(lean.x * y * 0.3, y, lean.y * y * 0.3);
      const mouthMat = new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff6a20, emissiveIntensity: 2.2 });
      const mouth = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.65, rad * 0.65, 0.2, 8), mouthMat);
      mouth.position.copy(top);
      v.add(mouth);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.position.copy(top).y += 1;
      glow.scale.setScalar(14);
      v.add(glow);
      // Antoplasm clusters around the warmth.
      for (let k = 0; k < 6; k++) {
        const blob = new THREE.Mesh(sph, growthMat);
        const a = r() * Math.PI * 2;
        blob.position.set(Math.cos(a) * (2.5 + r() * 2.5), 0.6 + r() * 1.5, Math.sin(a) * (2.5 + r() * 2.5));
        blob.scale.setScalar(0.5 + r() * 1.2);
        v.add(blob);
      }
      this.group.add(v);
      this.list.push({ top: top.add(base), reserve: RESERVE, glow, mouth: mouthMat });
    }

    // One Points cloud for every vent's bubble column.
    const n = this.list.length * BUBBLES_PER_VENT;
    this.bubbleBase = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) this.bubbleBase.set([r(), 0.6 + r() * 0.8, r() * Math.PI * 2, r()], i * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({
      size: 0.35,
      map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      color: 0xffe2c8,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.bubbles = new THREE.Points(geo, mat);
    this.bubbles.frustumCulled = false;
    this.group.add(this.bubbles);
  }

  /** Returns air-seconds gained this frame from any vent the player is inside. */
  update(dt: number, t: number, player: THREE.Vector3): number {
    let gained = 0;
    this.active = null;
    for (const v of this.list) {
      v.reserve = Math.min(RESERVE, v.reserve + RECHARGE * dt);
      const fullness = v.reserve / RESERVE;
      v.mouth.emissiveIntensity = 0.6 + 1.8 * fullness + Math.sin(t * 3 + v.top.x) * 0.3;
      v.glow.material.opacity = 0.25 + 0.75 * fullness;
      const dy = player.y - v.top.y;
      if (dy > -2 && dy < COLUMN_HEIGHT && Math.hypot(player.x - v.top.x, player.z - v.top.z) < COLUMN_RADIUS) {
        this.active = v;
        const take = Math.min(v.reserve, FLOW * dt);
        v.reserve -= take;
        gained += take;
      }
    }

    // Bubbles spiral up the column; a spent vent only trickles.
    const pos = this.bubbles.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const b = this.bubbleBase;
    for (let vi = 0; vi < this.list.length; vi++) {
      const v = this.list[vi];
      const flow = 0.25 + 0.75 * (v.reserve / RESERVE);
      for (let k = 0; k < BUBBLES_PER_VENT; k++) {
        const i = vi * BUBBLES_PER_VENT + k;
        const h = ((b[i * 4] + t * 0.05 * b[i * 4 + 1] * (0.5 + flow)) % 1);
        const spread = 0.3 + h * 2.2;
        const a = b[i * 4 + 2] + t * 0.8 + h * 6;
        const show = b[i * 4 + 3] < flow;
        arr[i * 3] = v.top.x + Math.cos(a) * spread * b[i * 4 + 3];
        arr[i * 3 + 1] = show ? v.top.y + h * COLUMN_HEIGHT : -9999;
        arr[i * 3 + 2] = v.top.z + Math.sin(a) * spread * b[i * 4 + 3];
      }
    }
    pos.needsUpdate = true;
    return gained;
  }

  reserveOf(v: Vent) {
    return v.reserve / RESERVE;
  }
}
