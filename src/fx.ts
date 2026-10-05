import * as THREE from 'three';

// Shader-only visual effects: no extra lights (a light-count change recompiles every
// material), no post-processing passes, so they stay cheap on an iGPU or a phone.

/** Where the sun sits in the sky picture (lower than the shading light, so it can be seen and glint off the water). */
export const SUN_DIR = new THREE.Vector3(80, 70, 60).normalize();

// ---------- Caustics: rippling sunlight on everything near the lakebed ----------

/** Shared by every material that receives caustics. k = strength (follows the sun as you descend). */
export const causticUniforms = { uCausT: { value: 0 }, uCausK: { value: 1 } };

const CAUSTIC_GLSL = /* glsl */ `
uniform float uCausT;
uniform float uCausK;
varying vec3 vCWorld;
// Tileable water caustic (iterated sine warp). Bright thin lines, ~0..1.
float caustic(vec2 uv, float t) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.005;
  for (int n = 0; n < 3; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 3.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
`;

/**
 * Patch a built-in lit material so it receives caustics (and, for the lakebed, sand ripples).
 * Works for plain and instanced meshes; chains any onBeforeCompile already set (e.g. kelp sway).
 */
let causticId = 0;
export function addCaustics(mat: THREE.Material, opts: { sand?: boolean } = {}) {
  const prev = mat.onBeforeCompile.bind(mat);
  const key = `caustics-${opts.sand ? 'sand-' : ''}${causticId++}`; // each patched material keeps its own program
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uCausT = causticUniforms.uCausT;
    sh.uniforms.uCausK = causticUniforms.uCausK;
    sh.vertexShader = 'varying vec3 vCWorld;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       vec4 cw = vec4(transformed, 1.0);
       #ifdef USE_INSTANCING
         cw = instanceMatrix * cw;
       #endif
       vCWorld = (modelMatrix * cw).xyz;`,
    );
    let frag = CAUSTIC_GLSL + sh.fragmentShader;
    if (opts.sand) {
      // Fine sand ripples + grain, faded out with distance so far terrain doesn't shimmer.
      frag = frag.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float rp = sin(vCWorld.x * 1.7 + sin(vCWorld.z * 0.9) * 1.6 + sin(vCWorld.z * 0.31) * 3.0);
         float grain = fract(sin(dot(floor(vCWorld.xz * 11.0), vec2(12.9898, 78.233))) * 43758.5453);
         float near = 1.0 - smoothstep(12.0, 50.0, distance(vCWorld, cameraPosition));
         diffuseColor.rgb *= 1.0 + (rp * 0.07 + (grain - 0.5) * 0.035) * near;`,
      );
    }
    sh.fragmentShader = frag.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
       {
         float cd = max(0.0, -vCWorld.y);
         float k = uCausK * exp(-cd / 30.0) * smoothstep(0.2, 2.0, cd)
               * (1.0 - smoothstep(40.0, 70.0, distance(vCWorld, cameraPosition))); // fog hides it past here
         if (k > 0.002) {
           vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
           float facing = max(0.0, dot(normal, upV)) * 0.8 + 0.2;
           vec2 cuv = vCWorld.xz * 0.075 + vCWorld.y * 0.01;
           float cs = caustic(cuv, uCausT * 0.45) * 1.5;
           reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 0.97, 0.86) * cs * k * facing * 2.6;
         }
       }`,
    );
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}

// ---------- Water surface ----------

const WAVES_GLSL = /* glsl */ `
// Analytic wave normal: a few travelling sines, no geometry needed.
vec3 waveNormal(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 d1 = normalize(vec2(1.0, 0.35)); float k1 = 0.21, a1 = 0.10;
  vec2 d2 = normalize(vec2(-0.6, 1.0)); float k2 = 0.37, a2 = 0.06;
  vec2 d3 = normalize(vec2(0.2, -1.0)); float k3 = 0.83, a3 = 0.025;
  vec2 d4 = normalize(vec2(-1.0, -0.4)); float k4 = 1.9, a4 = 0.010;
  g += d1 * k1 * a1 * cos(dot(d1, p) * k1 + t * 1.1);
  g += d2 * k2 * a2 * cos(dot(d2, p) * k2 + t * 1.5);
  g += d3 * k3 * a3 * cos(dot(d3, p) * k3 + t * 2.3);
  g += d4 * k4 * a4 * cos(dot(d4, p) * k4 + t * 3.4);
  return normalize(vec3(-g.x * 3.2, 1.0, -g.y * 3.2));
}
`;

export function waterMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSunDir: { value: SUN_DIR.clone() },
        uZenith: { value: new THREE.Color(0x5aa8d8) },
        uHorizon: { value: new THREE.Color(0xa9d4e8) },
        uDeep: { value: new THREE.Color(0x14506a) },
        uUnder: { value: new THREE.Color(0x3f9ab8) },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uSunDir, uZenith, uHorizon, uDeep, uUnder;
      varying vec3 vW;
      ${WAVES_GLSL}
      void main() {
        vec3 n = waveNormal(vW.xz, uTime);
        vec3 V = normalize(cameraPosition - vW);
        vec3 col;
        float alpha;
        if (cameraPosition.y >= 0.0) {
          // From above: deep water body, sky reflected by Fresnel, a hard sun glint.
          float ndv = max(dot(n, V), 0.0);
          float fres = (0.03 + 0.97 * pow(1.0 - ndv, 5.0)) * 0.8;
          vec3 R = reflect(-V, n);
          vec3 sky = mix(uHorizon, uZenith, clamp(R.y * 1.4, 0.0, 1.0));
          // A little scattered light in the wave faces.
          vec3 body = uDeep * (0.85 + 0.3 * clamp(n.x + n.z, -1.0, 1.0));
          col = mix(body, sky, fres);
          float s = max(dot(R, uSunDir), 0.0);
          col += vec3(1.0, 0.93, 0.8) * (pow(s, 700.0) * 8.0 + pow(s, 60.0) * 0.35);
          alpha = 1.0;
        } else {
          // From below: Snell's window. Inside ~48.6° of straight up you see the bright sky,
          // outside it the surface mirrors the dark water. Waves wobble the edge.
          vec3 up = -V;
          float cosT = up.y + (n.x * 0.6 + n.z * 0.4) * 0.35;
          float window = smoothstep(0.58, 0.76, cosT);
          // Linear-space colour (output encoding brightens it): reads as a clear sky-cyan.
          vec3 inside = vec3(0.12, 0.46, 0.66) * (1.0 + 0.25 * (n.x - n.z));
          vec3 outside = uUnder * 0.8;
          col = mix(outside, inside, window);
          // Sun seen through the window, smeared by the waves.
          float s = max(dot(normalize(up + vec3(n.x, 0.0, n.z) * 0.25), uSunDir), 0.0);
          col += vec3(1.0, 0.95, 0.82) * pow(s, 40.0) * 0.8 * window;
          alpha = mix(0.6, 0.85, window);
        }
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// ---------- Sky dome: gradient, sun, drifting clouds ----------

export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
      uZenith: { value: new THREE.Color(0x4f9fd6) },
      uHorizon: { value: new THREE.Color(0xa9d4e8) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir, uZenith, uHorizon;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
        float s = max(dot(d, uSunDir), 0.0);
        // Warm haze around the sun, then clouds, then the disc on top.
        col += vec3(1.0, 0.85, 0.6) * pow(s, 8.0) * 0.18;
        if (h > 0.0) {
          vec2 cuv = d.xz / (h + 0.15) * 1.3 + vec2(uTime * 0.006, uTime * 0.002);
          float c = fbm(cuv);
          float cover = smoothstep(0.5, 0.78, c) * smoothstep(0.0, 0.22, h);
          vec3 cloud = mix(vec3(0.82, 0.86, 0.9), vec3(1.0, 0.98, 0.95), smoothstep(0.5, 0.9, c)) ;
          cloud += vec3(1.0, 0.9, 0.7) * pow(s, 6.0) * 0.35; // sunlit edges
          col = mix(col, cloud, cover * 0.85);
        }
        col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, s) * 3.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

// ---------- God rays: light shafts slanting down from the surface ----------

export function buildGodRays(count = 22, span = 80) {
  const pos: number[] = [], uv: number[] = [], base: number[] = [], seed: number[] = [], nrm: number[] = [];
  const idx: number[] = [];
  let r = 1234567;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const bx = rand() * span, bz = rand() * span;
    const w = 2.5 + rand() * 6;
    const L = 35 + rand() * 30;
    const sd = rand();
    // Two crossed quads per shaft so it reads from any angle.
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      const o = pos.length / 3;
      for (const [u, v] of [[0, 1], [1, 1], [0, 0], [1, 0]]) {
        pos.push((u - 0.5) * w * ax, (v - 1) * L, (u - 0.5) * w * az);
        uv.push(u, v);
        base.push(bx, 0, bz);
        seed.push(sd);
        nrm.push(az, 0, ax); // quad's facing direction (ignoring the slant)
      }
      idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  geo.setAttribute('aN', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uStrength: { value: 0 },
      uColor: { value: new THREE.Color(0xd6f1ee) },
      uSunXZ: { value: new THREE.Vector2(SUN_DIR.x, SUN_DIR.z) },
      uSpan: { value: span },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aBase;
      attribute float aSeed;
      attribute vec3 aN;
      uniform vec3 uCam;
      uniform vec2 uSunXZ;
      uniform float uTime, uSpan;
      varying vec2 vUv;
      varying float vSeed, vDist, vView;
      void main() {
        // Shafts wrap around the diver so there are always some nearby; they sway slowly.
        vec2 root = mod(aBase.xz - uCam.xz, uSpan) - uSpan * 0.5 + uCam.xz;
        root += vec2(sin(uTime * 0.13 + aSeed * 40.0), cos(uTime * 0.11 + aSeed * 23.0)) * 2.0;
        vec3 p = position;
        vec3 w = vec3(root.x, -0.2, root.y) + p;
        w.xz += uSunXZ * p.y * 0.45; // slant away from the sun
        vUv = uv; vSeed = aSeed;
        // Additive quads blow out when seen edge-on or looking down a shaft's length: fade both.
        vec3 V = normalize(cameraPosition - w);
        vec3 axis = normalize(vec3(-uSunXZ.x * 0.45, 1.0, -uSunXZ.y * 0.45));
        vView = abs(dot(aN, V)) * (1.0 - pow(abs(dot(axis, V)), 3.0));
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uStrength;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vSeed, vDist, vView;
      void main() {
        float edge = sin(vUv.x * 3.14159); edge = edge * edge * edge;
        float along = pow(vUv.y, 1.8) * smoothstep(1.0, 0.9, vUv.y);
        float pulse = 0.5 + 0.5 * sin(uTime * (0.4 + vSeed * 0.5) + vSeed * 31.0);
        float fade = smoothstep(6.0, 22.0, vDist) * (1.0 - smoothstep(32.0, 60.0, vDist));
        float a = edge * along * (0.35 + 0.65 * pulse) * fade * vView * uStrength * 0.06;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

// ---------- Flashlight beam: a faint visible cone in dark water ----------

export function buildBeam(length = 26, angle = Math.PI / 6.5) {
  const radius = Math.tan(angle) * length * 0.8;
  const geo = new THREE.ConeGeometry(radius, length, 24, 1, true);
  geo.translate(0, -length / 2, 0); // apex at the origin
  geo.rotateX(-Math.PI / 2); // point down -Z, the camera's forward
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uStrength: { value: 0 }, uColor: { value: new THREE.Color(0xcfe6ff) }, uLen: { value: length } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying float vRim;
      uniform float uLen;
      void main() {
        vAlong = clamp(-position.z / uLen, 0.0, 1.0);
        vec3 nV = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vRim = abs(dot(nV, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uStrength;
      uniform vec3 uColor;
      varying float vAlong;
      varying float vRim;
      void main() {
        // Faces seen edge-on are the beam's soft outline; face-on is its hazy core.
        float a = pow(vRim, 1.5) * smoothstep(0.0, 0.12, vAlong) * pow(1.0 - vAlong, 1.6);
        gl_FragColor = vec4(uColor * a * uStrength * 0.05, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const beam = new THREE.Mesh(geo, mat);
  beam.frustumCulled = false;
  beam.renderOrder = 3;
  beam.position.set(0.15, -0.25, 0); // from the diver's lamp, slightly off-axis so it reads as a beam
  return beam;
}
