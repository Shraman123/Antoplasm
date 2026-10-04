import * as THREE from 'three';

// Detailed first-person speargun. Built at real scale (≈1.2 m) in gun-local space, -Z forward,
// origin at the top of the pistol grip. The look changes with the harpoon upgrade tier.

interface TierLook {
  wood: number;
  metal: number;
  band: number;
  bands: number; // rubber band pairs; 0 = pneumatic
  powerhead: boolean;
  bone: boolean;
  scatter?: boolean;
}
const LOOKS: TierLook[] = [
  { wood: 0x7a5232, metal: 0x9aa2a8, band: 0x2a2a2a, bands: 1, powerhead: false, bone: false }, // Sling Spear
  { wood: 0x6b4423, metal: 0xa8b0b6, band: 0x3f6fb8, bands: 1, powerhead: false, bone: false }, // Band Gun
  { wood: 0x5a3a20, metal: 0xa0a8ae, band: 0xd0a020, bands: 2, powerhead: false, bone: false }, // Twin-Band
  { wood: 0x3a3e44, metal: 0xb8c0c6, band: 0x000000, bands: 0, powerhead: false, bone: false }, // Pneumatic
  { wood: 0x4a2c18, metal: 0x707a84, band: 0xc04030, bands: 2, powerhead: false, bone: false }, // Barbed Railgun
  { wood: 0x3a2418, metal: 0x6a747c, band: 0x7a3fb0, bands: 3, powerhead: false, bone: false }, // Long Rail
  { wood: 0x23272b, metal: 0x5c646c, band: 0x2f8f4f, bands: 2, powerhead: true, bone: false }, // Powerhead
  { wood: 0x1e2226, metal: 0x4a5258, band: 0x000000, bands: 0, powerhead: true, bone: false }, // Gas Lance
  { wood: 0x2a1214, metal: 0x3a3034, band: 0x8a1020, bands: 3, powerhead: false, bone: true }, // Bone Splitter
  { wood: 0x1c0c0e, metal: 0x2e2628, band: 0x000000, bands: 0, powerhead: false, bone: true, scatter: true }, // Scattergun
];

const std = (color: number, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const boneMat = std(0xe0d6bf, 0.6);
const veinMat = new THREE.MeshStandardMaterial({ color: 0x8c1020, emissive: 0xff1a30, emissiveIntensity: 0.6, roughness: 0.3 });
const rubber = std(0x151515, 0.9);
const brass = std(0xc8a24a, 0.35, 0.8);

function tube(points: THREE.Vector3[], r: number, mat: THREE.Material) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, r, 6), mat);
}

/** Spear head + shaft, along +Z (so Object3D.lookAt aims it). Shared by the loaded spear and the fired one. */
export function buildSpear(tier: number, length = 1.15) {
  const look = LOOKS[tier];
  const g = new THREE.Group();
  const steel = std(look.bone ? 0xd8ccb4 : 0xd4d8dc, 0.25, look.bone ? 0 : 0.85);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, length, 6), steel);
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const front = length / 2;
  // Tip
  const tip = new THREE.Mesh(new THREE.ConeGeometry(look.bone ? 0.012 : 0.008, 0.07, 6), look.bone ? boneMat : steel);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = front + 0.035;
  g.add(tip);
  // Hinged flopper barb, angled back
  const flop = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.06), steel);
  flop.position.set(0, 0.008, front - 0.03);
  flop.rotation.x = -0.35;
  g.add(flop);
  // Side barbs
  for (const s of [-1, 1]) {
    const barb = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.035, 4), look.bone ? boneMat : steel);
    barb.position.set(s * 0.008, 0, front - 0.005);
    barb.rotation.set(-Math.PI / 2, 0, s * -0.5);
    g.add(barb);
  }
  if (look.bone) {
    // Serrated bone teeth along the first third, wrapped in a pulsing vein.
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.018, 4), boneMat);
      t.position.set((i % 2 ? 1 : -1) * 0.006, 0, front - 0.06 - i * 0.04);
      t.rotation.set(-Math.PI / 2, 0, (i % 2 ? -1 : 1) * 0.9);
      g.add(t);
    }
    const vein = tube([new THREE.Vector3(0.006, 0, front - 0.02), new THREE.Vector3(-0.006, 0.004, front - 0.15), new THREE.Vector3(0.006, -0.002, front - 0.3)], 0.0025, veinMat);
    g.add(vein);
  }
  if (look.powerhead) {
    const ph = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 10), std(0xb83a2a, 0.4, 0.4));
    ph.rotation.x = Math.PI / 2;
    ph.position.z = front - 0.08;
    g.add(ph);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.012, 10), brass);
    band.rotation.x = Math.PI / 2;
    band.position.z = front - 0.05;
    g.add(band);
  }
  // Notch fins at the tail where the wishbone catches
  for (const s of [-1, 1]) {
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.012, 0.02), steel);
    notch.position.set(0, s * 0.006, -front + 0.08);
    g.add(notch);
  }
  return g;
}

/** Short barbed dart for the scattergun, along +Z. Bone tip wrapped in red. */
export function buildFlechette(length = 0.6) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, length, 5), std(0x3a3034, 0.3, 0.7));
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.05, 5), boneMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = length / 2 + 0.025;
  g.add(tip);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6), veinMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = length / 2 - 0.01;
  g.add(ring);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.016, 0.04), veinMat);
    fin.position.set(0, s * 0.006, -length / 2 + 0.02);
    g.add(fin);
  }
  return g;
}

export class HarpoonGun {
  root = new THREE.Group();
  private model = new THREE.Group();
  private loadedSpear?: THREE.Group;
  private bandsLoaded = new THREE.Group();
  private bandsSlack = new THREE.Group();
  private reel = new THREE.Group();
  private kick = 0;
  private tubeEnds: THREE.Vector3[] = [];
  private tier = -1;
  /** Gun-local point where the line leaves the reel. */
  readonly lineLocal = new THREE.Vector3(0, -0.035, -0.17);

  constructor(camera: THREE.Camera) {
    // Three-quarter view so the reel, bands and grip all read.
    this.root.position.set(0.2, -0.18, -0.4);
    this.root.rotation.set(0.08, 0.22, -0.3);
    this.root.scale.setScalar(0.5);
    this.root.add(this.model);
    // Small fill light so the gun's detail reads even in the black water of the Rot.
    const fill = new THREE.PointLight(0xfff2e0, 0.55, 1.6, 2);
    fill.position.set(-0.1, 0.25, 0.1);
    this.root.add(fill);
    camera.add(this.root);
    this.setTier(0);
  }

  setTier(tier: number) {
    if (tier === this.tier) return;
    this.tier = tier;
    this.model.clear();
    this.bandsLoaded = new THREE.Group();
    this.bandsSlack = new THREE.Group();
    this.reel = new THREE.Group();
    const L = LOOKS[tier];
    const wood = std(L.wood, 0.75);
    const metal = std(L.metal, 0.3, 0.75);
    const m = this.model;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, p: number[], r: number[] = [0, 0, 0], parent: THREE.Object3D = m) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p[0], p[1], p[2]);
      mesh.rotation.set(r[0], r[1], r[2]);
      parent.add(mesh);
      return mesh;
    };

    // Handle housing + butt pad
    add(new THREE.BoxGeometry(0.046, 0.05, 0.36), wood, [0, 0, 0.05]);
    add(new THREE.BoxGeometry(0.05, 0.016, 0.3), metal, [0, 0.03, 0.03]); // top rail plate
    add(new THREE.BoxGeometry(0.052, 0.062, 0.03), rubber, [0, -0.004, 0.245]);
    // Pistol grip with finger grooves
    const grip = add(new THREE.BoxGeometry(0.038, 0.14, 0.055), wood, [0, -0.085, 0.03], [0.28, 0, 0]);
    for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8), rubber, [0, 0.035 - i * 0.035, -0.028], [0, 0, Math.PI / 2], grip);
    add(new THREE.BoxGeometry(0.04, 0.012, 0.065), rubber, [0, -0.072, 0], [0, 0, 0], grip); // grip foot
    // Trigger + guard
    add(new THREE.TorusGeometry(0.03, 0.0045, 6, 14, Math.PI), metal, [0, -0.028, -0.045], [Math.PI, Math.PI / 2, 0]);
    add(new THREE.BoxGeometry(0.007, 0.032, 0.01), metal, [0, -0.035, -0.035], [0.25, 0, 0]);
    // Safety lever
    add(new THREE.BoxGeometry(0.004, 0.012, 0.022), std(0xd04030, 0.5), [0.025, 0.01, 0.02]);

    const muzzleZ = -0.99;
    if (L.scatter) {
      // Scattergun: seven short tubes in a hex bundle, collared, over a ribbed pump and a drum.
      this.tubeEnds = [];
      for (let k = 0; k < 7; k++) {
        const a = (k / 6) * Math.PI * 2;
        const r = k === 6 ? 0 : 0.026;
        const x = Math.cos(a) * r;
        const y = 0.012 + Math.sin(a) * r;
        add(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 10), metal, [x, y, -0.62], [Math.PI / 2, 0, 0]);
        this.tubeEnds.push(new THREE.Vector3(x, y, -0.93));
      }
      for (const z of [-0.38, -0.66, -0.9]) add(new THREE.CylinderGeometry(0.044, 0.044, 0.03, 14), std(0x5a1a1e, 0.5, 0.5), [0, 0.012, z], [Math.PI / 2, 0, 0]);
      const pump = add(new THREE.BoxGeometry(0.05, 0.04, 0.22), wood, [0, -0.045, -0.55]);
      for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.054, 0.006, 0.01), rubber, [0, -0.02, -0.09 + k * 0.035], [0, 0, 0], pump);
      add(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 16), std(0x3a2a2c, 0.4, 0.6), [0, -0.05, -0.22], [0, 0, Math.PI / 2]);
      add(new THREE.TorusGeometry(0.056, 0.006, 6, 18), veinMat, [0, -0.05, -0.22], [0, Math.PI / 2, 0]);
    } else {
      // Barrel
      add(new THREE.CylinderGeometry(0.017, 0.017, 0.86, 14), metal, [0, 0.008, -0.56], [Math.PI / 2, 0, 0]);
      add(new THREE.BoxGeometry(0.01, 0.008, 0.84), metal, [0, 0.028, -0.55]); // spear track
      // Barrel clamps
      for (const z of [-0.3, -0.62]) add(new THREE.CylinderGeometry(0.02, 0.02, 0.018, 12), rubber, [0, 0.008, z], [Math.PI / 2, 0, 0]);
    }

    if (L.bands === 0 && !L.scatter) {
      // Pneumatic: air chamber under the barrel with a gauge.
      add(new THREE.CylinderGeometry(0.024, 0.024, 0.5, 14), std(0x2c5f8a, 0.35, 0.6), [0, -0.03, -0.42], [Math.PI / 2, 0, 0]);
      add(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 14), brass, [0.02, -0.005, -0.2], [0, 0, Math.PI / 2]);
      add(new THREE.CircleGeometry(0.012, 14), std(0xf4f0e0, 0.5), [0.026, -0.005, -0.2], [0, Math.PI / 2, 0]);
    }

    // Muzzle with band holes and a sight
    if (!L.scatter) {
      add(new THREE.BoxGeometry(0.075, 0.04, 0.045), metal, [0, 0.008, muzzleZ]);
      for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.008, 0.003, 6, 10), metal, [s * 0.034, 0.01, muzzleZ], [0, Math.PI / 2, 0]);
    }
    add(new THREE.BoxGeometry(0.004, 0.02, 0.012), std(0xf2c040, 0.4), [0, L.scatter ? 0.07 : 0.04, muzzleZ - 0.005]);

    // Rubber bands: stretched back to the spear notch when loaded, hanging slack when fired.
    const bandMat = std(L.band, 0.55);
    const wish = std(0xcfd4d8, 0.3, 0.8);
    for (let b = 0; b < L.bands; b++) {
      const off = b * 0.01;
      const notchZ = -0.2 + b * 0.05;
      for (const s of [-1, 1]) {
        this.bandsLoaded.add(tube([
          new THREE.Vector3(s * 0.034, 0.01 + off, muzzleZ),
          new THREE.Vector3(s * 0.03, 0.02 + off, (muzzleZ + notchZ) / 2),
          new THREE.Vector3(s * 0.006, 0.036, notchZ),
        ], 0.0055, bandMat));
        this.bandsSlack.add(tube([
          new THREE.Vector3(s * 0.034, 0.01 + off, muzzleZ),
          new THREE.Vector3(s * 0.03, -0.01 - off, muzzleZ - 0.05),
          new THREE.Vector3(s * 0.008, -0.02 - off, muzzleZ - 0.09),
        ], 0.0055, bandMat));
      }
      const wb = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0018, 4, 8, Math.PI), wish);
      wb.position.set(0, 0.036, notchZ);
      wb.rotation.set(Math.PI / 2, 0, 0);
      this.bandsLoaded.add(wb);
      const wbs = wb.clone();
      wbs.position.set(0, -0.022 - off, muzzleZ - 0.09);
      this.bandsSlack.add(wbs);
    }
    m.add(this.bandsLoaded, this.bandsSlack);

    // Line reel under the barrel (the scattergun has no line)
    this.reel.position.copy(this.lineLocal);
    this.reel.visible = !L.scatter;
    add(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 18), metal, [-0.011, 0, 0], [0, 0, Math.PI / 2], this.reel);
    add(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 18), metal, [0.011, 0, 0], [0, 0, Math.PI / 2], this.reel);
    add(new THREE.CylinderGeometry(0.028, 0.028, 0.017, 18), std(0xd8d0a0, 0.8), [0, 0, 0], [0, 0, Math.PI / 2], this.reel);
    add(new THREE.BoxGeometry(0.004, 0.006, 0.03), metal, [0.016, 0, 0.015], [0, 0, 0], this.reel);
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.014, 6), rubber, [0.023, 0, 0.028], [0, 0, Math.PI / 2], this.reel);
    m.add(this.reel);
    add(new THREE.BoxGeometry(0.006, 0.035, 0.012), metal, [0.0, -0.02, -0.17]); // reel bracket

    if (L.bone) {
      // The last gun Teodor sells is grown, not made.
      for (let i = 0; i < 5; i++) {
        add(new THREE.ConeGeometry(0.006, 0.03, 4), boneMat, [(i % 2 ? 1 : -1) * 0.02, 0.028, -0.35 - i * 0.11], [0, 0, (i % 2 ? -1 : 1) * 0.7]);
      }
      m.add(tube([new THREE.Vector3(0.018, 0.0, -0.15), new THREE.Vector3(-0.012, 0.022, -0.45), new THREE.Vector3(0.016, 0.0, -0.75), new THREE.Vector3(-0.01, 0.02, -0.95)], 0.004, veinMat));
    }

    if (L.scatter) {
      // Loaded: a flechette tip poking out of every tube.
      this.loadedSpear = new THREE.Group();
      for (const e of this.tubeEnds) {
        const tip = buildFlechette(0.12);
        tip.position.copy(e);
        tip.rotation.y = Math.PI;
        this.loadedSpear.add(tip);
      }
      m.add(this.loadedSpear);
      return;
    }
    this.loadedSpear = buildSpear(tier, 1.0);
    this.loadedSpear.position.set(0, 0.036, -0.67);
    m.add(this.loadedSpear);
    // buildSpear points +Z; flip so the tip faces the muzzle.
    this.loadedSpear.rotation.y = Math.PI;
  }

  setLoaded(loaded: boolean) {
    if (this.loadedSpear) this.loadedSpear.visible = loaded;
    this.bandsLoaded.visible = loaded;
    this.bandsSlack.visible = !loaded;
  }

  fire() {
    this.kick = 1;
  }

  lineOrigin(target: THREE.Vector3) {
    this.root.updateWorldMatrix(true, true);
    return target.copy(this.lineLocal).applyMatrix4(this.model.matrixWorld);
  }

  update(dt: number, time: number, reeling: boolean) {
    this.kick = Math.max(0, this.kick - dt * 5);
    const k = this.kick * this.kick;
    this.model.position.set(0, Math.sin(time * 2) * 0.012, k * 0.12);
    this.model.rotation.x = k * 0.18 + Math.sin(time * 1.3) * 0.01;
    if (reeling) this.reel.rotation.x -= dt * 25;
  }
}

/** Pooled bubbles that trail behind a flying spear. */
export class BubbleTrail {
  private pool: { m: THREE.Mesh; life: number; v: number }[] = [];
  private next = 0;
  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1, 6, 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.5, roughness: 0.1, depthWrite: false });
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, life: 0, v: 0 });
    }
  }
  emit(p: THREE.Vector3) {
    const b = this.pool[this.next++ % this.pool.length];
    b.m.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1));
    b.m.scale.setScalar(0.015 + Math.random() * 0.03);
    b.life = 1.2 + Math.random();
    b.v = 0.6 + Math.random() * 0.8;
    b.m.visible = true;
  }
  update(dt: number) {
    for (const b of this.pool) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.m.position.y += b.v * dt;
      b.m.position.x += Math.sin(b.life * 9) * 0.004;
      if (b.life <= 0 || b.m.position.y > -0.1) {
        b.life = 0;
        b.m.visible = false;
      }
    }
  }
}
