import * as THREE from 'three';
import { buildBoat, buildDock, BOAT_HALF_LENGTH, BOAT_HALF_WIDTH, DOCK_HALF_WIDTH, DOCK_POST_OFFSET, DOCK_POST_RADIUS, DOCK_POST_SPACING, DOCK_TOP } from './boat';
import { BOAT_POS, LAKE_RADIUS, MAX_DEPTH } from './config';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic PRNG so the lake looks the same every run. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lake floor height (negative = below surface). Bowl with a deep trench at the origin. */
export function floorY(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let d: number;
  if (r <= 330) {
    const t = clamp((r - 20) / 310, 0, 1);
    d = 15 + (MAX_DEPTH - 15) * Math.pow(1 - t, 1.7);
  } else {
    d = 15 - ((r - 330) / 30) * 20;
  }
  const n = Math.sin(x * 0.05) + Math.cos(z * 0.043) + Math.sin((x + z) * 0.021) * 1.5 + Math.sin(x * 0.17 + z * 0.11) * 0.4;
  d += n * (2 + Math.min(Math.max(d, 0), 200) * 0.03) * smooth(12, 45, r);
  return Math.min(-d, 25);
}

// Fog/ambience keyframes by depth: [depth, fogColor, density, sun]
const ZONES: [number, number, number, number][] = [
  [0, 0x3f9ab8, 0.011, 1.0],
  [60, 0x2a6e72, 0.014, 0.6],
  [150, 0x173c40, 0.019, 0.25],
  [260, 0x0b1d20, 0.024, 0.08],
  [380, 0x07100f, 0.028, 0.02],
  [500, 0x0d0405, 0.03, 0],
  [640, 0x140306, 0.032, 0],
];

export const ZONE_NAMES: [number, string][] = [
  [0, 'Sunlit Shallows'],
  [60, 'Green Twilight'],
  [150, 'The Murk'],
  [260, 'Weeping Depths'],
  [380, 'The Rot'],
  [500, 'Antoplasm Trench'],
];

export function zoneName(depth: number) {
  let name = ZONE_NAMES[0][1];
  for (const [d, n] of ZONE_NAMES) if (depth >= d) name = n;
  return name;
}

function sampleZones(depth: number) {
  let i = 0;
  while (i < ZONES.length - 2 && depth > ZONES[i + 1][0]) i++;
  const a = ZONES[i];
  const b = ZONES[i + 1];
  const t = clamp((depth - a[0]) / (b[0] - a[0]), 0, 1);
  const col = new THREE.Color(a[1]).lerp(new THREE.Color(b[1]), t);
  return { col, density: lerp(a[2], b[2], t), sun: lerp(a[3], b[3], t) };
}

export class World {
  scene: THREE.Scene;
  fog: THREE.FogExp2;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  flashlight: THREE.SpotLight;
  terrain: THREE.Mesh;
  water: THREE.Mesh;
  lakeGroup = new THREE.Group();
  growthMat: THREE.MeshStandardMaterial;
  private kelpUniform = { value: 0 };
  private particles: THREE.Points;
  private particleBase: Float32Array;
  private particleMat: THREE.PointsMaterial;
  private flickerT = 0;
  private skyColor = new THREE.Color(0xa9d4e8);

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.fog = new THREE.FogExp2(0x3f9ab8, 0.011);
    scene.fog = this.fog;
    scene.background = new THREE.Color(0x3f9ab8);
    scene.add(this.lakeGroup);

    this.hemi = new THREE.HemisphereLight(0xcfeaf5, 0x34422c, 1.4);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.6);
    this.sun.position.set(80, 200, 60);
    scene.add(this.sun);

    this.flashlight = new THREE.SpotLight(0xe8f4ff, 0, 70, Math.PI / 6.5, 0.45, 1.2);
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.set(0, 0, -1);
    camera.add(this.flashlight);
    camera.add(this.flashlight.target);

    this.terrain = this.buildTerrain();
    this.lakeGroup.add(this.terrain);
    this.water = this.buildWater();
    scene.add(this.water);

    this.growthMat = new THREE.MeshStandardMaterial({
      color: 0x7a0f1c,
      emissive: 0xff2238,
      emissiveIntensity: 0.6,
      roughness: 0.35,
      flatShading: true,
    });
    this.buildScatter();
    this.buildBoat();
    const p = this.buildParticles();
    this.particles = p.points;
    this.particleBase = p.base;
    this.particleMat = p.mat;
    scene.add(this.particles);
  }

  private buildTerrain() {
    const geo = new THREE.PlaneGeometry(820, 820, 205, 205);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const stops: [number, THREE.Color][] = [
      [-25, new THREE.Color(0x5f8a3a)],
      [-1, new THREE.Color(0xb7a97a)],
      [10, new THREE.Color(0xc9b98a)],
      [80, new THREE.Color(0x6b6a4a)],
      [180, new THREE.Color(0x3d443a)],
      [300, new THREE.Color(0x2c2a28)],
      [430, new THREE.Color(0x2e1a1a)],
      [560, new THREE.Color(0x4a1016)],
      [640, new THREE.Color(0x5e0f18)],
    ];
    const c = new THREE.Color();
    const r = rng(7);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = floorY(x, z);
      pos.setY(i, y);
      const d = -y;
      let k = 0;
      while (k < stops.length - 2 && d > stops[k + 1][0]) k++;
      const t = clamp((d - stops[k][0]) / (stops[k + 1][0] - stops[k][0]), 0, 1);
      c.copy(stops[k][1]).lerp(stops[k + 1][1], t);
      c.offsetHSL(0, 0, (r() - 0.5) * 0.04);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    return new THREE.Mesh(geo, mat);
  }

  private buildWater() {
    const geo = new THREE.PlaneGeometry(900, 900, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7cc3d6,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      roughness: 0.15,
      metalness: 0.1,
      depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  private onFloor(r: () => number, minD: number, maxD: number, tries = 30): THREE.Vector3 | null {
    for (let i = 0; i < tries; i++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * 345;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const y = floorY(x, z);
      if (-y >= minD && -y <= maxD) return new THREE.Vector3(x, y, z);
    }
    return null;
  }

  private buildScatter() {
    const r = rng(42);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();

    // Kelp: swaying ribbons via an instanced vertex shader.
    const kelpGeo = new THREE.PlaneGeometry(0.7, 9, 1, 10);
    kelpGeo.translate(0, 4.5, 0);
    const kelpMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 });
    const uni = this.kelpUniform;
    kelpMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uni;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float h = position.y / 9.0;
         float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
         transformed.x += sin(uTime * 0.9 + ph + h * 2.5) * h * h * 1.6;
         transformed.z += cos(uTime * 0.7 + ph) * h * h * 0.8;`,
      );
    };
    const kelpCount = 900;
    const kelp = new THREE.InstancedMesh(kelpGeo, kelpMat, kelpCount);
    const kc = new THREE.Color();
    let n = 0;
    for (let i = 0; i < kelpCount * 2 && n < kelpCount; i++) {
      const p = this.onFloor(r, 4, 330, 6);
      if (!p) continue;
      const d = -p.y;
      if (d > 140 && r() < 0.7) continue;
      const h = d < 140 ? 0.6 + r() * 1.4 : 0.4 + r() * 0.6;
      e.set(0, r() * Math.PI, 0);
      m.compose(p, q.setFromEuler(e), s.set(1, h * Math.min(1, 0.3 + d / 20), 1));
      kelp.setMatrixAt(n, m);
      if (d < 140) kc.setHSL(0.22 + r() * 0.08, 0.5, 0.25 + r() * 0.1);
      else kc.setHSL(0.02, 0.15, 0.14 + r() * 0.06);
      kelp.setColorAt(n, kc);
      n++;
    }
    kelp.count = n;
    this.lakeGroup.add(kelp);

    // Rocks
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d6a60, roughness: 1, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 700);
    for (let i = 0; i < 700; i++) {
      const p = this.onFloor(r, 0, 650)!;
      const sc = 0.8 + r() * r() * 7;
      e.set(r() * 3, r() * 3, r() * 3);
      m.compose(p, q.setFromEuler(e), s.set(sc, sc * (0.5 + r() * 0.6), sc));
      rocks.setMatrixAt(i, m);
      kc.setHSL(0.08, 0.06, Math.max(0.06, 0.42 - (-p.y / 650) * 0.36));
      rocks.setColorAt(i, kc);
    }
    this.lakeGroup.add(rocks);

    // Antoplasm growths: denser the deeper you go.
    const growGeo = new THREE.IcosahedronGeometry(1, 1);
    const grows = new THREE.InstancedMesh(growGeo, this.growthMat, 1400);
    n = 0;
    for (let i = 0; i < 9000 && n < 1400; i++) {
      const p = this.onFloor(r, 230, 650, 4);
      if (!p) continue;
      if (r() > smooth(230, 560, -p.y) + 0.08) continue;
      const sc = 0.4 + r() * r() * 3.5;
      e.set(r() * 3, r() * 3, r() * 3);
      m.compose(p, q.setFromEuler(e), s.set(sc, sc * (0.5 + r()), sc));
      grows.setMatrixAt(n++, m);
    }
    grows.count = n;
    this.lakeGroup.add(grows);

    // Bones of things that died down here.
    const boneGeo = new THREE.CylinderGeometry(0.08, 0.05, 2.2, 5);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.7 });
    const bones = new THREE.InstancedMesh(boneGeo, boneMat, 500);
    n = 0;
    for (let i = 0; i < 4000 && n < 500; i++) {
      const p = this.onFloor(r, 180, 650, 4);
      if (!p) continue;
      const sc = 0.5 + r() * 2;
      e.set(Math.PI / 2 + (r() - 0.5), r() * 6, (r() - 0.5) * 0.8);
      m.compose(p, q.setFromEuler(e), s.set(sc, sc, sc));
      bones.setMatrixAt(n++, m);
    }
    bones.count = n;
    this.lakeGroup.add(bones);

    // Worked stone near the bottom: steps and column stubs. Foreshadowing.
    const stoneGeo = new THREE.BoxGeometry(1, 1, 1);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.9, flatShading: true });
    const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, 260);
    n = 0;
    for (let i = 0; i < 5000 && n < 260; i++) {
      const p = this.onFloor(r, 460, 650, 4);
      if (!p) continue;
      const column = r() < 0.4;
      e.set((r() - 0.5) * 0.4, Math.atan2(p.x, p.z), (r() - 0.5) * 0.4);
      if (column) s.set(1.6, 3 + r() * 9, 1.6);
      else s.set(5 + r() * 6, 1, 1.8);
      m.compose(p, q.setFromEuler(e), s);
      stones.setMatrixAt(n++, m);
    }
    stones.count = n;
    this.lakeGroup.add(stones);

    // Shore trees: the cosy postcard you start in.
    const treeGeo = new THREE.ConeGeometry(3, 11, 7);
    treeGeo.translate(0, 5.5, 0);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f5a32, flatShading: true });
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, 260);
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2;
      const rad = 372 + r() * 40;
      const p = new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      p.y = floorY(p.x, p.z) - 0.5;
      const sc = 0.7 + r() * 0.8;
      m.compose(p, q.identity(), s.set(sc, sc, sc));
      trees.setMatrixAt(i, m);
    }
    this.lakeGroup.add(trees);
  }

  boat = new THREE.Group();
  dock = { x: BOAT_POS.x + BOAT_HALF_WIDTH + 1.6, z0: BOAT_POS.z - 3, z1: BOAT_POS.z + 62 };
  private buildBoat() {
    this.boat = buildBoat();
    this.boat.position.set(BOAT_POS.x, 0, BOAT_POS.z);
    this.lakeGroup.add(this.boat);
    this.lakeGroup.add(buildDock(this.dock.z0, this.dock.z1, this.dock.x));
  }

  private buildParticles() {
    const N = 2400;
    const base = new Float32Array(N * 3);
    const r = rng(11);
    for (let i = 0; i < N * 3; i++) base[i] = r() * 60;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const g = dot.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, map: new THREE.CanvasTexture(dot), transparent: true, opacity: 0.7, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { points, base, mat };
  }

  /** Per-frame atmosphere: everything that makes deeper water feel worse. */
  update(dt: number, t: number, cam: THREE.Vector3) {
    const depth = Math.max(0, -cam.y);
    this.kelpUniform.value = t;
    // Gentle bob and roll on the swell.
    this.boat.position.y = Math.sin(t * 0.9) * 0.06;
    this.boat.rotation.z = Math.sin(t * 0.7) * 0.025;
    this.boat.rotation.x = Math.sin(t * 0.55 + 1) * 0.012;
    const above = cam.y > 0.05;

    // From above the lake reads as solid water; from below the surface stays translucent.
    const wm = this.water.material as THREE.MeshStandardMaterial;
    wm.opacity = above ? 1 : 0.55;
    wm.transparent = !above;
    wm.depthWrite = above;
    wm.color.set(above ? 0x2c7590 : 0x7cc3d6);
    if (above) {
      this.fog.color.copy(this.skyColor);
      this.fog.density = 0.0022;
      (this.scene.background as THREE.Color).copy(this.skyColor);
      this.hemi.intensity = 1.6;
      this.sun.intensity = 1.8;
      this.flashlight.intensity = 0;
    } else {
      const z = sampleZones(depth);
      this.fog.color.copy(z.col);
      this.fog.density = z.density;
      (this.scene.background as THREE.Color).copy(z.col);
      this.hemi.intensity = 0.15 + 1.25 * z.sun;
      this.hemi.color.setHSL(0.53, 0.5, 0.75).lerp(new THREE.Color(0x802030), smooth(380, 620, depth) * 0.6);
      this.sun.intensity = 1.6 * z.sun;
      // Flashlight takes over as the sun dies, and starts to misbehave in the Rot.
      let fl = 6 + 60 * smooth(30, 260, depth);
      if (depth > 380) {
        this.flickerT -= dt;
        if (this.flickerT < 0) this.flickerT = Math.random() < 0.06 ? 0.08 + Math.random() * 0.25 : 0.4 + Math.random() * 2.5;
        if (this.flickerT < 0.3 && Math.random() < smooth(380, 600, depth) * 0.7) fl *= Math.random() * 0.3;
      }
      this.flashlight.intensity = fl;
    }

    this.growthMat.emissiveIntensity = 0.45 + 0.35 * Math.sin(t * 1.7) + 0.15 * Math.sin(t * 4.3);

    // Marine snow → flakes of flesh.
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const b = this.particleBase;
    const drift = t * 0.4;
    for (let i = 0; i < b.length; i += 3) {
      arr[i] = cam.x + (((b[i] - cam.x + Math.sin(drift + i) * 0.3) % 60) + 60) % 60 - 30;
      arr[i + 1] = cam.y + (((b[i + 1] - cam.y - drift) % 60) + 60) % 60 - 30;
      arr[i + 2] = cam.z + (((b[i + 2] - cam.z) % 60) + 60) % 60 - 30;
      if (arr[i + 1] > -0.3) arr[i + 1] = -0.3 - Math.random() * 2;
    }
    pos.needsUpdate = true;
    this.particles.visible = !above;
    this.particleMat.color.setRGB(1, 1, 1).lerp(new THREE.Color(0xd0182c), smooth(220, 450, depth));
    this.particleMat.size = 0.14 + smooth(250, 600, depth) * 0.16;
  }

  /** Jetty collision: a solid deck slab (down to just under the waterline, so you can't surface
   *  beneath it) plus round posts that run all the way to the lakebed. Player radius ~0.45 m. */
  private collideDock(p: THREE.Vector3) {
    const R = 0.45;
    const d = this.dock;
    const lx = p.x - d.x;
    if (p.z > d.z0 - R && p.z < d.z1 + R) {
      // Deck slab
      const bottom = -0.5;
      if (Math.abs(lx) < DOCK_HALF_WIDTH + R && p.y > bottom - R && p.y < DOCK_TOP + R) {
        const pen = [
          ['x', DOCK_HALF_WIDTH + R - Math.abs(lx)],
          ['down', p.y - (bottom - R)],
          ['zlo', p.z - (d.z0 - R)],
          ['zhi', d.z1 + R - p.z],
        ] as const;
        let best: (typeof pen)[number] = pen[0];
        for (const q of pen) if (q[1] < best[1]) best = q;
        if (best[0] === 'x') p.x = d.x + Math.sign(lx || 1) * (DOCK_HALF_WIDTH + R);
        else if (best[0] === 'down') p.y = bottom - R;
        else if (best[0] === 'zlo') p.z = d.z0 - R;
        else p.z = d.z1 + R;
      }
      // Posts
      if (p.y < DOCK_TOP) {
        const k = Math.round((p.z - d.z0) / DOCK_POST_SPACING);
        const pz = d.z0 + k * DOCK_POST_SPACING;
        if (k >= 0 && pz <= d.z1) {
          for (const s of [-1, 1]) {
            const dx = p.x - (d.x + s * DOCK_POST_OFFSET);
            const dz = p.z - pz;
            const dist = Math.hypot(dx, dz);
            const min = DOCK_POST_RADIUS + R;
            if (dist < min) {
              const nx = dist > 1e-4 ? dx / dist : 1;
              const nz = dist > 1e-4 ? dz / dist : 0;
              p.x = d.x + s * DOCK_POST_OFFSET + nx * min;
              p.z = pz + nz * min;
            }
          }
        }
      }
    }
  }

  clampToLake(p: THREE.Vector3) {
    const r = Math.hypot(p.x, p.z);
    const max = LAKE_RADIUS - 8;
    if (r > max) {
      p.x *= max / r;
      p.z *= max / r;
    }
    // Don't swim through Teodor's boat.
    const bx = p.x - BOAT_POS.x;
    const bz = p.z - BOAT_POS.z;
    const hw = BOAT_HALF_WIDTH + 0.6;
    const hl = BOAT_HALF_LENGTH + 0.9;
    if (Math.abs(bx) < hw && Math.abs(bz) < hl && p.y > -1.8) {
      if (hw - Math.abs(bx) < hl - Math.abs(bz)) p.x = BOAT_POS.x + Math.sign(bx || 1) * hw;
      else p.z = BOAT_POS.z + Math.sign(bz || 1) * hl;
    }
    this.collideDock(p);
    const f = floorY(p.x, p.z) + 1.6;
    if (p.y < f) p.y = f;
  }
}
