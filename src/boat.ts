import * as THREE from 'three';

// Teodor's fishing boat: a lofted hull (white topsides, blue sheer stripe, red antifouling
// below the waterline), wheelhouse with a painted sign, lantern, fenders, outboard and a dock.
// Local axes: +Z = bow, waterline at y = 0.

const LENGTH = 10;
export const BOAT_HALF_WIDTH = 2.3;
export const BOAT_HALF_LENGTH = LENGTH / 2;

/** Half-beam, sheer height and keel depth at t ∈ [0 stern, 1 bow]. */
function station(t: number) {
  const bowTaper = t > 0.62 ? Math.sqrt(Math.max(0, 1 - (t - 0.62) / 0.38)) : 1;
  const sternTaper = 0.86 + 0.14 * Math.min(1, t / 0.2);
  return {
    w: t >= 1 ? 0 : BOAT_HALF_WIDTH * bowTaper * sternTaper, // sides meet at the stem: no gap
    top: 1.05 + 0.55 * t * t,
    keel: 1.15 * (0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.1))),
  };
}

function hullGeometry() {
  const stations = 24;
  // Cross-section from port gunwale → keel → starboard gunwale, as (xFactor of w, y) pairs.
  // Extra rows sit exactly on the stripe and waterline so no quad straddles two paint colours.
  const section = (s: ReturnType<typeof station>): [number, number][] => [
    [-s.w, s.top],
    [-s.w * 0.99, s.top - 0.32],
    [-s.w * 0.97, 0.35],
    [-s.w * 0.92, 0.06],
    [-s.w * 0.85, -0.25],
    [-s.w * 0.55, -0.75 * s.keel],
    [-s.w * 0.12, -s.keel],
    [s.w * 0.12, -s.keel],
    [s.w * 0.55, -0.75 * s.keel],
    [s.w * 0.85, -0.25],
    [s.w * 0.92, 0.06],
    [s.w * 0.97, 0.35],
    [s.w * 0.99, s.top - 0.32],
    [s.w, s.top],
  ];
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const z = -LENGTH / 2 + t * LENGTH;
    rings.push(section(station(t)).map(([x, y]) => new THREE.Vector3(x, y, z)));
  }
  const pos: number[] = [];
  const col: number[] = [];
  const red = new THREE.Color(0xa8392a);
  const white = new THREE.Color(0xeee8d8);
  const blue = new THREE.Color(0x2f6f8f);
  const paint = (y: number, topY: number) => (y < 0.06 ? red : y > topY - 0.33 ? blue : white);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, k: THREE.Color) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b);
  };
  for (let i = 0; i < stations; i++) {
    const A = rings[i];
    const B = rings[i + 1];
    const topY = station((i + 0.5) / stations).top;
    for (let j = 0; j < A.length - 1; j++) {
      // One colour per quad, from the quad's mid-height.
      const k = paint((A[j].y + A[j + 1].y + B[j].y + B[j + 1].y) / 4, topY);
      tri(A[j], B[j], B[j + 1], k);
      tri(A[j], B[j + 1], A[j + 1], k);
    }
  }
  // Transom (flat stern) as a fan.
  const T = rings[0];
  const c = new THREE.Vector3(0, 0.2, T[0].z);
  const sternTop = station(0).top;
  for (let j = 0; j < T.length - 1; j++) tri(c, T[j + 1], T[j], paint((T[j].y + T[j + 1].y) / 2, sternTop));
  tri(T[T.length - 1], T[0], c, blue);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2f6f8f';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#f2e6c8';
  g.lineWidth = 8;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#f7e9c4';
  g.font = 'bold 54px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText("TEODOR'S", 256, 52);
  g.font = '28px Georgia, serif';
  g.fillText('FISH BOUGHT · GEAR SOLD', 256, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildBoat() {
  const boat = new THREE.Group();
  const flat = (color: number, rough = 0.75, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true });
  const darkWood = flat(0x6b4526);
  const paint = flat(0xeee8d8, 0.6);
  const red = flat(0xb8402e, 0.6);
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d3540, roughness: 0.1, metalness: 0.4 });
  const metal = flat(0x8a9399, 0.4, 0.7);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, p: number[], r: number[] = [0, 0, 0], parent: THREE.Object3D = boat) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p[0], p[1], p[2]);
    m.rotation.set(r[0], r[1], r[2]);
    parent.add(m);
    return m;
  };

  add(hullGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true, side: THREE.DoubleSide }), [0, 0, 0]);

  // Stem post: a wooden bar down the bow seam, from the gunwale to the keel.
  const bowTop = station(1).top;
  const bowKeel = station(1).keel;
  const stem = add(new THREE.BoxGeometry(0.14, bowTop + bowKeel + 0.1, 0.14), darkWood, [0, (bowTop - bowKeel) / 2, LENGTH / 2 + 0.03]);
  stem.rotation.x = 0.04;

  // Deck follows the hull outline, just below the gunwale.
  const deckShape = new THREE.Shape();
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = -LENGTH / 2 + t * LENGTH;
    const w = station(t).w * 0.95;
    if (i === 0) deckShape.moveTo(-w, z);
    else deckShape.lineTo(-w, z);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    deckShape.lineTo(station(t).w * 0.95, -LENGTH / 2 + t * LENGTH);
  }
  const deckGeo = new THREE.ShapeGeometry(deckShape);
  deckGeo.rotateX(Math.PI / 2);
  add(deckGeo, new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.85, side: THREE.DoubleSide }), [0, 0.8, 0]);
  // Plank seams
  for (let x = -1.8; x <= 1.8; x += 0.45) add(new THREE.BoxGeometry(0.02, 0.01, 8.6), darkWood, [x, 0.81, -0.4]);
  // Gunwale cap rail
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const st = station(t);
      pts.push(new THREE.Vector3(s * st.w, st.top + 0.04, -LENGTH / 2 + t * LENGTH));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.07, 5), darkWood, [0, 0, 0]);
  }

  // Wheelhouse (aft of midships), facing the bow.
  const wh = new THREE.Group();
  wh.position.set(0, 0.8, -1.4);
  boat.add(wh);
  add(new THREE.BoxGeometry(2.7, 2.1, 2.6), paint, [0, 1.05, 0], [0, 0, 0], wh);
  add(new THREE.BoxGeometry(3.1, 0.18, 3.0), red, [0, 2.2, 0], [0, 0, 0], wh);
  add(new THREE.BoxGeometry(2.76, 0.14, 2.66), red, [0, 0.07, 0], [0, 0, 0], wh); // kick band
  // Windows: front pair and one each side, with frames.
  for (const x of [-0.65, 0.65]) {
    add(new THREE.BoxGeometry(1.0, 0.7, 0.05), glass, [x, 1.45, 1.31], [0, 0, 0], wh);
    add(new THREE.BoxGeometry(1.08, 0.78, 0.03), darkWood, [x, 1.45, 1.3], [0, 0, 0], wh);
  }
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.6, 1.2), glass, [s * 1.36, 1.5, 0.2], [0, 0, 0], wh);
    add(new THREE.BoxGeometry(0.03, 0.68, 1.28), darkWood, [s * 1.355, 1.5, 0.2], [0, 0, 0], wh);
  }
  // Door at the back
  add(new THREE.BoxGeometry(0.85, 1.6, 0.05), darkWood, [0.5, 0.82, -1.31], [0, 0, 0], wh);
  add(new THREE.SphereGeometry(0.04, 6, 4), metal, [0.2, 0.85, -1.35], [0, 0, 0], wh);
  // Sign board on both sides of the cabin roof edge
  const signMat = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.7 });
  for (const s of [-1, 1]) {
    const sign = add(new THREE.PlaneGeometry(2.4, 0.6), signMat, [s * 1.38, 2.6, 0], [0, s * Math.PI / 2, 0], wh);
    sign.scale.x = 1;
    add(new THREE.BoxGeometry(0.06, 0.7, 2.5), darkWood, [s * 1.34, 2.6, 0], [0, 0, 0], wh);
  }
  // Mast with lantern and a little pennant
  add(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), darkWood, [0.9, 3.1, -0.6], [0, 0, 0], wh);
  add(new THREE.BoxGeometry(0.3, 0.06, 0.06), metal, [0.75, 3.75, -0.6], [0, 0, 0], wh);
  add(new THREE.CylinderGeometry(0.11, 0.09, 0.26, 8), metal, [0.6, 3.6, -0.6], [0, 0, 0], wh);
  add(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb340, emissiveIntensity: 2.5 }), [0.6, 3.6, -0.6], [0, 0, 0], wh);
  add(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshStandardMaterial({ color: 0xd8b040, side: THREE.DoubleSide }), [1.2, 3.75, -0.6], [0, 0, 0], wh);

  // Bow: anchor winch + coiled rope; fish crates and a net heap on deck.
  add(new THREE.CylinderGeometry(0.18, 0.18, 0.6, 10), metal, [0, 1.15, 3.3], [0, 0, Math.PI / 2]);
  add(new THREE.TorusGeometry(0.35, 0.08, 6, 14), flat(0xc9b27a, 0.9), [-0.7, 0.88, 2.6], [Math.PI / 2, 0, 0]);
  add(new THREE.TorusGeometry(0.22, 0.07, 6, 12), flat(0xc9b27a, 0.9), [-0.7, 0.98, 2.6], [Math.PI / 2, 0, 0]);
  for (const [x, z, h] of [[1.1, 1.0, 0], [1.1, 1.65, 0], [1.1, 1.3, 0.45]]) {
    add(new THREE.BoxGeometry(0.8, 0.42, 0.6), flat(0x7a8a5a, 0.85), [x, 1.02 + h, z]);
  }
  add(new THREE.IcosahedronGeometry(0.55, 0), flat(0x3f6a5a, 0.95), [-0.9, 0.95, 0.9]);

  // Fenders (orange buoys) hanging off both sides.
  const buoy = flat(0xe86a2a, 0.5);
  for (const s of [-1, 1]) {
    for (const t of [0.25, 0.45, 0.62]) {
      const st = station(t);
      const z = -LENGTH / 2 + t * LENGTH;
      add(new THREE.CylinderGeometry(0.003, 0.003, 0.5, 3), darkWood, [s * (st.w + 0.08), st.top - 0.2, z]);
      add(new THREE.CapsuleGeometry(0.16, 0.35, 4, 8), buoy, [s * (st.w + 0.12), st.top - 0.65, z]);
    }
  }

  // Outboard motor on the transom.
  const ob = new THREE.Group();
  ob.position.set(0, 0.9, -LENGTH / 2 - 0.25);
  boat.add(ob);
  add(new THREE.BoxGeometry(0.55, 0.6, 0.6), flat(0x2a2a2a, 0.5), [0, 0.35, -0.1], [0, 0, 0], ob);
  add(new THREE.BoxGeometry(0.58, 0.12, 0.64), red, [0, 0.62, -0.1], [0, 0, 0], ob);
  add(new THREE.BoxGeometry(0.16, 1.4, 0.2), flat(0x2a2a2a, 0.5), [0, -0.6, -0.15], [0, 0, 0], ob);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), metal, [0, -1.25, -0.3], [Math.PI / 2, 0, 0], ob);
  for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.04, 0.32, 0.1), metal, [0, -1.25, -0.5], [0, 0, (k * Math.PI * 2) / 3], ob);

  return boat;
}

/** Wooden jetty from the boat's side to the shore. */
export function buildDock(fromZ: number, toZ: number, x: number) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6038, roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5e3e22, roughness: 0.95, flatShading: true });
  const plank = new THREE.BoxGeometry(2.6, 0.14, 0.42);
  let i = 0;
  for (let z = fromZ; z <= toZ; z += 0.46, i++) {
    const p = new THREE.Mesh(plank, wood);
    p.position.set(x + ((i * 37) % 7) * 0.006, 0.95, z);
    p.rotation.y = (((i * 13) % 5) - 2) * 0.004;
    g.add(p);
  }
  // Stringers under the planks, and posts every 3.5 m that run down into the lakebed.
  for (const s of [-1, 1]) {
    const len = toZ - fromZ;
    const str = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, len), dark);
    str.position.set(x + s * 1.05, 0.78, fromZ + len / 2);
    g.add(str);
    for (let z = fromZ; z <= toZ; z += 3.5) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 30, 7), dark);
      post.position.set(x + s * 1.2, 1.4 - 15, z);
      g.add(post);
    }
  }
  return g;
}
