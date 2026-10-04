import * as THREE from 'three';
import type { Audio } from './audio';
import { boneMat, fleshMat } from './fish';
import { rng, World } from './world';

export interface CutsceneHooks {
  caption(text: string): void;
  fade(alpha: number): void;
  letterbox(on: boolean): void;
  shake(amount: number): void;
  onSwitchToCity(): void;
  onEnd(): void;
}

const CITY = new THREE.Vector3(0, -830, -90);

function buildCity(world: World) {
  const g = new THREE.Group();
  const r = rng(1337);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  const stone = new THREE.MeshStandardMaterial({ color: 0x6e665c, roughness: 0.95, flatShading: true });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 1, flatShading: true });

  // Ground with red veins.
  const gg = new THREE.CircleGeometry(520, 64, 0, Math.PI * 2);
  gg.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0x2a1515, roughness: 1 }));
  ground.position.copy(CITY);
  g.add(ground);

  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const towers = new THREE.InstancedMesh(box, stone, 420);
  const domeGeo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const domes = new THREE.InstancedMesh(domeGeo, darkStone, 60);
  const growGeo = new THREE.IcosahedronGeometry(1, 1);
  const grows = new THREE.InstancedMesh(growGeo, world.growthMat, 1600);
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x200000, emissive: 0xff2a20, emissiveIntensity: 1.4 });
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.6, 0.3), windowMat, 500);
  let ti = 0, di = 0, gi = 0, wi = 0;

  const addGrowth = (x: number, y: number, z: number, sc: number) => {
    if (gi >= 1600) return;
    e.set(r() * 3, r() * 3, r() * 3);
    m.compose(p.set(x, y, z), q.setFromEuler(e), s.set(sc, sc * (0.6 + r() * 0.8), sc));
    grows.setMatrixAt(gi++, m);
  };

  for (let i = 0; i < 300 && ti < 400; i++) {
    const a = r() * Math.PI * 2;
    const rad = 78 + Math.pow(r(), 0.7) * 250;
    const x = CITY.x + Math.cos(a) * rad;
    const z = CITY.z + Math.sin(a) * rad;
    const w = 7 + r() * 12;
    const d = 7 + r() * 12;
    const h = (18 + r() * 60) * (1 - rad / 480);
    const tilt = r() < 0.4 ? (r() - 0.5) * 0.5 : (r() - 0.5) * 0.08;
    e.set(tilt, r() * Math.PI, (r() - 0.5) * 0.2);
    q.setFromEuler(e);
    m.compose(p.set(x, CITY.y - 1, z), q, s.set(w, h, d));
    towers.setMatrixAt(ti++, m);
    // Broken crown
    if (r() < 0.6) {
      const ce = new THREE.Euler(tilt + (r() - 0.5) * 0.9, e.y + r(), (r() - 0.5) * 0.9);
      const top = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(new THREE.Vector3(x, CITY.y - 1, z));
      m.compose(top, new THREE.Quaternion().setFromEuler(ce), s.set(w * 0.7, 4 + r() * 8, d * 0.6));
      towers.setMatrixAt(ti++, m);
    } else if (di < 60) {
      const top = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(new THREE.Vector3(x, CITY.y - 1, z));
      m.compose(top, q, s.set(w * 0.55, w * 0.5, d * 0.55));
      domes.setMatrixAt(di++, m);
    }
    // Lit windows: the city's last lights are the infection itself.
    for (let k = 0; k < 3 && wi < 500; k++) {
      if (r() < 0.45) continue;
      const local = new THREE.Vector3((r() - 0.5) * w * 0.7, h * (0.2 + r() * 0.7), d * 0.51);
      const wp = local.applyQuaternion(q).add(new THREE.Vector3(x, CITY.y - 1, z));
      m.compose(wp, q, s.set(1.2, 1.2, 1));
      windows.setMatrixAt(wi++, m);
    }
    // Flesh climbing the walls.
    const n = 3 + Math.floor(r() * 9);
    for (let k = 0; k < n; k++) {
      const local = new THREE.Vector3((r() - 0.5) * w, r() * h * 0.9, (r() < 0.5 ? -1 : 1) * d * 0.5);
      const gp = local.applyQuaternion(q).add(new THREE.Vector3(x, CITY.y - 1, z));
      addGrowth(gp.x, gp.y, gp.z, 1.5 + r() * 4);
    }
  }

  // Central ziggurat temple.
  const T = new THREE.Vector3(CITY.x, CITY.y - 1, CITY.z);
  for (let k = 0; k < 6; k++) {
    const sz = 60 - k * 9;
    m.compose(p.set(T.x, T.y + k * 7, T.z), q.identity(), s.set(sz, 7, sz));
    towers.setMatrixAt(ti++, m);
  }
  m.compose(p.set(T.x + 3, T.y + 42, T.z), q.setFromEuler(e.set(0.12, 0.3, 0.1)), s.set(5, 38, 5));
  towers.setMatrixAt(ti++, m);
  for (let k = 0; k < 160; k++) {
    const a = r() * Math.PI * 2;
    const tier = Math.floor(r() * 6);
    const sz = (60 - tier * 9) / 2;
    addGrowth(T.x + Math.cos(a) * sz, T.y + tier * 7 + 7, T.z + Math.sin(a) * sz, 1.5 + r() * 3.5);
  }
  // Streets carpeted in growth.
  for (let k = 0; k < 900; k++) {
    const a = r() * Math.PI * 2;
    const rad = 20 + r() * 300;
    addGrowth(CITY.x + Math.cos(a) * rad, CITY.y, CITY.z + Math.sin(a) * rad, 1 + r() * r() * 6);
  }
  towers.count = ti;
  domes.count = di;
  grows.count = gi;
  windows.count = wi;
  g.add(towers, domes, grows, windows);

  // The heart on the temple.
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 2), fleshMat);
  heart.position.set(T.x, T.y + 48, T.z);
  g.add(heart);
  const heartLight = new THREE.PointLight(0xff2030, 600, 260, 1.4);
  heartLight.position.copy(heart.position);
  g.add(heartLight);

  // Colonnade and arches around the plaza.
  const colGeo = new THREE.CylinderGeometry(1.4, 1.7, 24, 8);
  colGeo.translate(0, 12, 0);
  const arcGeo = new THREE.TorusGeometry(10, 1.3, 6, 12, Math.PI);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = T.x + Math.cos(a) * 52;
    const z = T.z + Math.sin(a) * 52;
    const broken = r() < 0.35;
    const col = new THREE.Mesh(colGeo, stone);
    col.position.set(x, T.y, z);
    if (broken) col.scale.y = 0.3 + r() * 0.4;
    col.rotation.z = (r() - 0.5) * 0.15;
    g.add(col);
    if (!broken && k % 2 === 0) {
      const arc = new THREE.Mesh(arcGeo, stone);
      arc.position.set(T.x + Math.cos(a + 0.26) * 52, T.y + 24, T.z + Math.sin(a + 0.26) * 52);
      arc.rotation.y = -a - 0.26 + Math.PI / 2;
      g.add(arc);
    }
  }

  // Kneeling figures, overgrown. Whoever lived here prayed to it.
  const bodyGeo = new THREE.CapsuleGeometry(1.1, 2.2, 4, 8);
  const headGeo = new THREE.SphereGeometry(0.9, 8, 6);
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2;
    const x = T.x + Math.cos(a) * 38;
    const z = T.z + Math.sin(a) * 38;
    const fig = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, stone);
    body.position.y = 1.8;
    body.rotation.x = 0.6;
    const head = new THREE.Mesh(headGeo, stone);
    head.position.set(0, 3.6, 1.1);
    fig.add(body, head);
    if (r() < 0.7) {
      const blob = new THREE.Mesh(growGeo, world.growthMat);
      blob.position.set((r() - 0.5) * 1.5, 2 + r() * 2, (r() - 0.5) * 1.5);
      blob.scale.setScalar(0.9 + r() * 1.3);
      fig.add(blob);
    }
    fig.position.set(x, T.y, z);
    fig.lookAt(T.x, T.y, T.z);
    g.add(fig);
  }

  // Tendrils draped between towers.
  const tendrilMat = fleshMat;
  for (let k = 0; k < 30; k++) {
    const a1 = r() * Math.PI * 2;
    const a2 = a1 + (r() - 0.5) * 1.2;
    const r1 = 30 + r() * 200;
    const r2 = 30 + r() * 200;
    const pA = new THREE.Vector3(CITY.x + Math.cos(a1) * r1, CITY.y + 20 + r() * 40, CITY.z + Math.sin(a1) * r1);
    const pB = new THREE.Vector3(CITY.x + Math.cos(a2) * r2, CITY.y + 20 + r() * 40, CITY.z + Math.sin(a2) * r2);
    const mid = pA.clone().lerp(pB, 0.5);
    mid.y -= 15 + r() * 20;
    const curve = new THREE.CatmullRomCurve3([pA, mid, pB]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.6 + r() * 1.2, 5), tendrilMat));
  }

  // A few red lights scattered so silhouettes read.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    const L = new THREE.PointLight(0xff3020, 350, 200, 1.5);
    L.position.set(CITY.x + Math.cos(a) * 140, CITY.y + 12, CITY.z + Math.sin(a) * 140);
    g.add(L);
  }
  g.visible = false;
  return { group: g, heart };
}

function buildWhale() {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x2c2628, roughness: 0.75, flatShading: true });
  const belly = new THREE.MeshStandardMaterial({ color: 0x4c3a3a, roughness: 0.8, flatShading: true });
  const throat = new THREE.MeshStandardMaterial({ color: 0x3a0508, emissive: 0x500010, emissiveIntensity: 0.6, side: THREE.BackSide });
  const sph = new THREE.SphereGeometry(1, 16, 12);
  const r = rng(99);
  const L = 90;
  const N = 12;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const seg = new THREE.Group();
    seg.position.z = L * 0.35 - t * L;
    root.add(seg);
    segs.push(seg);
    const prof = i < 2 ? 1 : Math.pow(Math.sin(Math.PI * (0.12 + t * 0.85)), 0.6);
    const R = 11 * prof + 1;
    const exposed = t > 0.45 && t < 0.85 && r() < 0.75;
    if (exposed) {
      // Flesh eaten away: a cathedral of ribs.
      const rib = new THREE.Mesh(new THREE.TorusGeometry(R * 0.95, 0.55, 6, 14, Math.PI * 1.4), boneMat);
      rib.rotation.set(0, Math.PI / 2, Math.PI * 1.2);
      seg.add(rib);
      const spine = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, L / N, 6), boneMat);
      spine.rotation.x = Math.PI / 2;
      spine.position.y = R * 0.6;
      seg.add(spine);
      const mass = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.5, 1), fleshMat);
      mass.position.y = -R * 0.2;
      seg.add(mass);
    } else if (i > 0) {
      const b = new THREE.Mesh(sph, skin);
      b.scale.set(R * 1.05, R * 0.9, (L / N) * 0.8);
      seg.add(b);
      const bl = new THREE.Mesh(sph, belly);
      bl.scale.set(R * 0.9, R * 0.55, (L / N) * 0.75);
      bl.position.y = -R * 0.4;
      seg.add(bl);
      for (let k = 0; k < 5; k++) {
        const a = r() * Math.PI * 2;
        const les = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), fleshMat);
        les.position.set(Math.cos(a) * R, Math.sin(a) * R * 0.85, (r() - 0.5) * 4);
        les.scale.setScalar(1 + r() * 3);
        seg.add(les);
      }
    }
  }
  // Head: upper jaw on the first segment, hinged lower jaw.
  const head = segs[0];
  const upper = new THREE.Mesh(sph, skin);
  upper.scale.set(12, 6, 14);
  upper.position.set(0, 4, 4);
  head.add(upper);
  const jaw = new THREE.Group();
  jaw.position.set(0, -2, -6);
  head.add(jaw);
  const lower = new THREE.Mesh(sph, belly);
  lower.scale.set(11, 3.5, 14);
  lower.position.set(0, -1, 10);
  jaw.add(lower);
  const mouth = new THREE.Mesh(sph, throat);
  mouth.scale.set(10, 8, 14);
  mouth.position.set(0, 0, 2);
  head.add(mouth);
  const tooth = new THREE.ConeGeometry(0.7, 4, 5);
  for (let k = 0; k < 18; k++) {
    const a = (k / 17) * Math.PI - Math.PI;
    const x = Math.cos(a) * 10.5;
    const z = 4 + Math.sin(-a) * 12 + 2;
    const t1 = new THREE.Mesh(tooth, boneMat);
    t1.position.set(x, -1, z);
    t1.rotation.x = Math.PI;
    upper.parent!.add(t1);
    const t2 = new THREE.Mesh(tooth, boneMat);
    t2.position.set(x * 0.95, 2, z + 6);
    jaw.add(t2);
  }
  // Antoplasm bursting through the skull.
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * (0.15 + r() * 0.7);
    const les = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), fleshMat);
    les.position.set(Math.cos(a) * 11, 4 + Math.sin(a) * 5.5, 2 + r() * 12);
    les.scale.setScalar(1.2 + r() * 2.2);
    head.add(les);
  }
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffe0d0, emissive: 0xff2030, emissiveIntensity: 4 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), eyeMat);
    eye.position.set(side * 11, 4, 0);
    head.add(eye);
  }
  const eyeLight = new THREE.PointLight(0xff2a30, 500, 120, 1.4);
  eyeLight.position.set(0, 6, 8);
  head.add(eyeLight);
  // Tail flukes
  const fluke = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, 9), skin);
  fluke.position.z = -6;
  segs[N - 1].add(fluke);
  // Pectoral fins
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(20, 0.8, 6), skin);
    fin.position.set(side * 18, -6, 0);
    fin.rotation.z = side * -0.4;
    segs[2].add(fin);
  }
  root.visible = false;
  return { root, segs, jaw };
}

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export class Cutscene {
  active = false;
  t = 0;
  private city: ReturnType<typeof buildCity>;
  private whale: ReturnType<typeof buildWhale>;
  private startPos = new THREE.Vector3();
  private startQuat = new THREE.Quaternion();
  private switched = false;
  private captions: [number, string][] = [
    [0.3, 'The floor gives way beneath you.'],
    [6, 'A city. Older than the lake. Older than the fishermen\'s grandfathers.'],
    [11, 'Every street, every tower — wrapped in the same red flesh.'],
    [15.5, 'Antoplasm did not come from the fish. It came from here.'],
    [20, 'Something vast rises from the ruins.'],
    [24.5, ''],
  ];
  private nextCaption = 0;
  private whaleCalled = false;
  private crunched = false;
  private camPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-90, -650, 220),
    new THREE.Vector3(-35, -668, 130),
    new THREE.Vector3(25, -684, 60),
    new THREE.Vector3(8, -690, 30),
  ]);

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private world: World, private audio: Audio, private hooks: CutsceneHooks) {
    this.city = buildCity(world);
    this.whale = buildWhale();
    scene.add(this.city.group, this.whale.root);
  }

  start() {
    this.active = true;
    this.t = 0;
    this.startPos.copy(this.camera.position);
    this.startQuat.copy(this.camera.quaternion);
    this.hooks.letterbox(true);
    this.audio.rumble(4, 1);
  }

  private switchToCity() {
    this.switched = true;
    this.world.lakeGroup.visible = false;
    this.world.water.visible = false;
    this.city.group.visible = true;
    this.whale.root.visible = true;
    this.whale.root.position.set(0, -900, -260);
    this.hooks.onSwitchToCity();
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t;
    const cam = this.camera;
    while (this.nextCaption < this.captions.length && t >= this.captions[this.nextCaption][0]) {
      this.hooks.caption(this.captions[this.nextCaption][1]);
      this.nextCaption++;
    }
    this.city.heart.scale.setScalar(1 + Math.sin(t * 2.2) * 0.06 + Math.sin(t * 5.1) * 0.03);
    fleshMat.emissiveIntensity = 0.6 + Math.sin(t * 2.2) * 0.3;

    if (t < 3.6) {
      // Sinking through the cracked floor, light dying.
      cam.position.copy(this.startPos).add(new THREE.Vector3(0, -ease(clamp01(t / 3.6)) * 8, 0));
      cam.quaternion.copy(this.startQuat);
      cam.rotateX(-ease(clamp01(t / 3)) * 0.7);
      this.world.flashlight.intensity = Math.random() < 0.3 ? 0 : 40 * (1 - t / 3.6);
      this.hooks.shake(0.25);
      this.hooks.fade(clamp01((t - 2.4) / 1.1));
      return;
    }
    if (!this.switched) this.switchToCity();
    this.world.flashlight.intensity = 0;
    this.world.hemi.intensity = 1.1;
    this.world.hemi.color.set(0xff8070);
    this.world.hemi.groundColor.set(0x400008);
    this.world.sun.intensity = 0;
    this.world.fog.color.set(0x2c0a0d);
    this.world.fog.density = 0.0032;
    (this.scene.background as THREE.Color).set(0x2c0a0d);

    const W = this.whale;
    const look = new THREE.Vector3();
    if (t < 20) {
      this.hooks.fade(1 - clamp01((t - 3.8) / 2.2));
      const k = ease(clamp01((t - 3.6) / 16.4));
      cam.position.copy(this.camPath.getPoint(k));
      look.copy(CITY).add(new THREE.Vector3(0, 30 - k * 10, 0));
      cam.lookAt(look);
      this.hooks.shake(0.02);
    }
    // The whale: rises behind the temple, then comes for you.
    if (t >= 17) {
      if (!this.whaleCalled) {
        this.whaleCalled = true;
        this.audio.whale(0.9, 48);
        setTimeout(() => this.audio.whale(0.7, 40), 4000);
      }
      const rise = ease(clamp01((t - 17) / 7));
      const camEnd = this.camPath.getPoint(1);
      const p0 = new THREE.Vector3(0, -900, -260);
      const p1 = new THREE.Vector3(0, -700, -150);
      W.root.position.copy(p0).lerp(p1, rise);
      if (t > 24) {
        const charge = clamp01((t - 24) / 4.6);
        W.root.position.copy(p1).lerp(camEnd, Math.pow(charge, 1.6));
      }
      W.root.lookAt(camEnd.x, camEnd.y - 4, camEnd.z);
      W.jaw.rotation.x = 0.1 + ease(clamp01((t - 21) / 6)) * 0.85;
      W.segs.forEach((s, i) => {
        s.position.x = Math.sin(t * 1.3 - i * 0.5) * i * 0.35;
        s.rotation.y = Math.cos(t * 1.3 - i * 0.5) * 0.04 * i;
      });
      if (t >= 20) {
        cam.position.copy(camEnd);
        // Turn from the city to the thing coming at you.
        const turn = ease(clamp01((t - 20) / 3));
        look.copy(CITY).add(new THREE.Vector3(0, 20, 0)).lerp(W.root.position.clone().add(new THREE.Vector3(0, 2, 0)), turn);
        cam.lookAt(look);
        const dist = W.root.position.distanceTo(camEnd);
        this.hooks.shake(Math.min(1.2, 30 / Math.max(dist, 10)));
        if (t > 26 && !this.crunched && dist < 45) {
          this.crunched = true;
          setTimeout(() => this.audio.crunch(), 900);
        }
      }
      if (t > 28.3) this.hooks.fade(1);
    }
    if (t > 31) {
      this.active = false;
      this.hooks.shake(0);
      this.hooks.onEnd();
    }
  }
}
