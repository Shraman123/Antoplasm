import * as THREE from 'three';
import { Audio } from './audio';
import { AIR, ARMOR, BOAT_POS, DEPTH_LOGS, ENDING_DEPTH, HARPOON, rollIndividual, SPECIES, Species } from './config';
import { Cutscene } from './cutscene';
import { Fish, FishManager, fleshMat } from './fish';
import { BubbleTrail, buildSpear, HarpoonGun } from './harpoon';
import { Vents } from './vents';
import { floorY, World, zoneName } from './world';

// ---------- DOM ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const ui = {
  hud: $('hud'), depth: $('depth').querySelector('b')!, zone: $('zone'), rating: $('rating'),
  air: $('air-fill'), hp: $('hp-fill'), reload: $('reload-fill'), money: $('money'), cargo: $('cargo'), bandages: $('bandages'),
  hint: $('hint'), log: $('log'), toasts: $('toasts'), crosshair: $('crosshair'),
  vignette: $('vignette'), grain: $('grain'), damage: $('damage'), pressure: $('pressure-warn'),
  title: $('title'), pause: $('pause'), shop: $('shop'), dead: $('dead'), ending: $('ending'),
  letterbox: $('letterbox'), caption: $('caption'), fade: $('fade'),
};

// ---------- Save ----------
interface Save {
  money: number;
  air: number;
  harpoon: number;
  armor: number;
  journal: string[];
  logs: number[];
  caught: number;
  earned: number;
  deaths: number;
  maxDepth: number;
  playTime: number;
  bandages: number;
}
const SAVE_KEY = 'morrow-lake-save-v1';
const fresh = (): Save => ({ money: 0, air: 0, harpoon: 0, armor: 0, journal: [], logs: [], caught: 0, earned: 0, deaths: 0, maxDepth: 0, playTime: 0, bandages: 0 });
let save: Save = fresh();
let hasSave = false;
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    save = { ...fresh(), ...JSON.parse(raw) };
    hasSave = true;
  }
} catch { /* storage unavailable: play without saving */ }
const persist = () => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ }
};
const wipe = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
};

// ---------- Three ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 1200);
scene.add(camera);
const world = new World(scene, camera);
const vents = new Vents(world.lakeGroup, world.growthMat);
let ventAir = 0;
const audio = new Audio();
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Harpoon gun held in view, plus the spear that actually flies.
const gun = new HarpoonGun(camera);
let spear = new THREE.Group();
let spearTier = -1;
function syncHarpoonLook() {
  const tier = save.harpoon;
  gun.setTier(tier);
  if (tier === spearTier) return;
  spearTier = tier;
  const vis = spear.visible;
  scene.remove(spear);
  spear = new THREE.Group();
  const model = buildSpear(tier, 1.4);
  model.scale.set(2.6, 2.6, 1.15); // chunkier than the view-model so it reads at range
  spear.add(model);
  spear.visible = vis;
  scene.add(spear);
}
const bubbles = new BubbleTrail(scene);
const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0xbbbbaa, transparent: true, opacity: 0.6 }));
rope.frustumCulled = false;
rope.visible = false;
scene.add(rope);

// ---------- Player ----------
type Mode = 'title' | 'play' | 'paused' | 'shop' | 'dead' | 'cutscene' | 'ending';
let mode: Mode = 'title';
const keys = new Set<string>();
let yaw = 0;
let pitch = 0;
const vel = new THREE.Vector3();
let air = 1;
let hp = 100;
let reloadT = 0;
let shake = 0;
let damageFlash = 0;
let cargo: Species[] = [];
const spearState = { active: false, vel: new THREE.Vector3(), travelled: 0, prev: new THREE.Vector3() };

const airMax = () => AIR[save.air].seconds;
const tierH = () => HARPOON[save.harpoon];
const tierA = () => ARMOR[save.armor];
const depthNow = () => Math.max(0, -camera.position.y);

function spawnAtBoat() {
  camera.position.set(BOAT_POS.x - 4, 0.55, BOAT_POS.z - 9);
  yaw = 0;
  pitch = -0.15;
  vel.set(0, 0, 0);
  air = 1;
  hp = 100;
}
spawnAtBoat();

const fishMgr = new FishManager(scene, {
  bite(f: Fish) {
    if (mode !== 'play') return;
    const dmg = f.sp.damage * (1 - tierA().reduction);
    hurt(dmg);
  },
});

function hurt(dmg: number) {
  hp -= dmg;
  damageFlash = Math.min(1, 0.35 + dmg / 40);
  shake = Math.min(1, shake + dmg / 30);
  audio.hurt();
}

// ---------- Messages ----------
let logTimer = 0;
function showLog(text: string, secs = 7) {
  ui.log.textContent = text;
  ui.log.classList.add('show');
  logTimer = secs;
}
function toast(html: string, infected = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (infected ? ' infected' : '');
  el.innerHTML = html;
  ui.toasts.appendChild(el);
  setTimeout(() => el.remove(), 3600);
  while (ui.toasts.children.length > 4) ui.toasts.firstChild!.remove();
}

// ---------- Harpoon ----------
function fire() {
  if (mode !== 'play' || reloadT > 0) return;
  if (spearState.active) endSpear(); // a fresh shot cuts the line on the last one
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  spear.position.copy(camera.position).addScaledVector(dir, 0.6).add(new THREE.Vector3(0, -0.12, 0));
  spear.lookAt(spear.position.clone().add(dir));
  spearState.vel.copy(dir).multiplyScalar(tierH().speed).add(vel);
  spearState.active = true;
  spearState.travelled = 0;
  spear.visible = true;
  rope.visible = true;
  gun.fire();
  reloadT = tierH().reload;
  audio.fire();
  shake = Math.max(shake, 0.12);
}

const segClosest = (a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3) => {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-6)));
  return a.clone().addScaledVector(ab, t).distanceTo(p);
};

function updateSpear(dt: number) {
  if (!spearState.active) return;
  spearState.prev.copy(spear.position);
  spearState.vel.multiplyScalar(Math.exp(-0.4 * dt));
  spear.position.addScaledVector(spearState.vel, dt);
  spearState.travelled += spearState.vel.length() * dt;
  for (const f of fishMgr.fish) {
    if (segClosest(spearState.prev, spear.position, f.root.position) < f.radius + 0.35 + spearState.travelled * 0.05) {
      f.hp -= tierH().damage;
      f.flash();
      audio.hit();
      if (f.hp <= 0) catchFish(f);
      else f.vel.addScaledVector(spearState.vel, 0.06);
      endSpear();
      return;
    }
  }
  if (spearState.travelled > 65 || spear.position.y < floorY(spear.position.x, spear.position.z) || spearState.vel.length() < 8) endSpear();
}
function endSpear() {
  spearState.active = false;
  spear.visible = false;
  rope.visible = false;
}

function catchFish(f: Fish) {
  const sp = f.sp;
  fishMgr.remove(f);
  cargo.push(sp);
  save.caught++;
  const first = !save.journal.includes(sp.id);
  if (first) save.journal.push(sp.id);
  const inf = sp.infection >= 0.15;
  toast(`+ ${sp.name} <b>$${sp.price}</b>${first ? `<small>${sp.lore}</small>` : ''}`, inf);
  if (inf) audio.catchInfected(sp.infection);
  else audio.catchHealthy();
  persist();
}

// ---------- Input ----------
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyM') audio.muted = !audio.muted;
  if (e.code === 'KeyH' && mode === 'play') useBandage();
  if (e.code === 'KeyE') {
    if (mode === 'play' && nearBoat()) openShop();
    else if (mode === 'shop') closeShop();
  }
  if (e.code === 'Space' || e.code === 'ControlLeft') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('mousemove', (e) => {
  if (mode !== 'play' || document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0022;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0022));
});
addEventListener('mousedown', (e) => {
  if (mode === 'play' && e.button === 0) {
    if (document.pointerLockElement !== canvas) lock();
    else fire();
  }
});
const lock = () => {
  const r = canvas.requestPointerLock() as unknown;
  if (r instanceof Promise) r.catch(() => {});
};
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && mode === 'play' && !(window as any).__noPause) {
    mode = 'paused';
    ui.pause.classList.remove('hidden');
  }
});

$('btn-start').onclick = () => startGame();
$('btn-new').onclick = () => {
  wipe();
  save = fresh();
  startGame();
};
if (hasSave) {
  $('btn-start').textContent = 'Continue';
  $('btn-new').classList.remove('hidden');
}
$('btn-resume').onclick = () => {
  ui.pause.classList.add('hidden');
  mode = 'play';
  lock();
};
$('btn-close').onclick = () => closeShop();
$('btn-sell').onclick = () => sellAll();
$('btn-respawn').onclick = () => {
  ui.dead.classList.add('hidden');
  spawnAtBoat();
  mode = 'play';
  lock();
};
$('btn-again').onclick = () => {
  wipe();
  location.reload();
};

function startGame() {
  audio.start();
  audio.splash();
  ui.title.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  mode = 'play';
  lock();
  if (!save.logs.length) showLog('Morrow Lake. Teodor says the big ones are further out, where the bottom drops away.', 8);
}

// ---------- Bandages ----------
const BANDAGE_COST = 20;
const BANDAGE_HEAL = 10; // % of max health
function useBandage() {
  if (save.bandages <= 0) return toast("No bandages — buy them at Teodor's boat");
  if (hp >= 100) return toast('Already at full health');
  save.bandages--;
  hp = Math.min(100, hp + BANDAGE_HEAL);
  audio.bandage();
  toast(`Bandaged +${BANDAGE_HEAL}% health <small>${save.bandages} left</small>`);
  persist();
}

// ---------- Shop ----------
const nearBoat = () => Math.hypot(camera.position.x - BOAT_POS.x, camera.position.z - BOAT_POS.z) < 15 && camera.position.y > -2.5;

function teodorLine() {
  const d = save.maxDepth;
  if (d > 480) return '"You went to the bottom-steps. I can smell it on you. Sell it and don\'t tell me what you saw."';
  if (d > 360) return '"My father said there was a town here, before the water. I never believed him. Don\'t look at me like that."';
  if (d > 240) return '"Gloves. Always gloves with the red ones. The buyers in the city don\'t ask where they come from — and they pay."';
  if (d > 120) return '"Spots on the trout, eh? It\'s nothing. Probably nothing. Prices are good though!"';
  return '"Fine morning for it! Bring me bluegill and perch and I\'ll keep you in air."';
}

function openShop() {
  mode = 'shop';
  document.exitPointerLock();
  ui.shop.classList.remove('hidden');
  air = 1;
  hp = 100;
  renderShop();
}
function closeShop() {
  ui.shop.classList.add('hidden');
  mode = 'play';
  lock();
}
function sellAll() {
  if (!cargo.length) return;
  const total = cargo.reduce((s, f) => s + f.price, 0);
  save.money += total;
  save.earned += total;
  cargo = [];
  audio.sell();
  persist();
  renderShop();
}
function renderShop() {
  $('shop-money').textContent = `$${save.money}`;
  $('teodor').textContent = teodorLine();
  // Group identical catches; infected big game rolls its own price, so key on name + price.
  const counts = new Map<string, [Species, number]>();
  for (const f of cargo) {
    const k = f.name + f.price;
    counts.set(k, [f, (counts.get(k)?.[1] ?? 0) + 1]);
  }
  const list = $('catch-list');
  list.innerHTML = cargo.length
    ? [...counts.values()].map(([sp, n]) => `<li class="${sp.infection >= 0.15 ? 'infected' : ''}"><span>${n}× ${sp.name}</span><span>$${sp.price * n}</span></li>`).join('')
    : '<li><span style="opacity:.6">Nothing yet. Go catch something!</span></li>';
  ($('btn-sell') as HTMLButtonElement).disabled = !cargo.length;
  $('btn-sell').textContent = cargo.length ? `Sell all — $${cargo.reduce((s, f) => s + f.price, 0)}` : 'Sell all';

  const rows: [keyof Save, string, { cost: number; label: string }[], (i: number) => string][] = [
    ['air', 'Air tank', AIR, (i) => `${AIR[i].seconds}s of air`],
    ['harpoon', 'Harpoon', HARPOON, (i) => `${HARPOON[i].damage} dmg · ${HARPOON[i].reload}s reload`],
    ['armor', 'Armour', ARMOR, (i) => `-${Math.round(ARMOR[i].reduction * 100)}% dmg · rated ${ARMOR[i].rating} m`],
  ];
  const up = $('upgrades');
  up.innerHTML = '';
  const band = document.createElement('div');
  band.className = 'upg';
  band.innerHTML = `
    <div class="row"><span class="name">Bandages</span><span class="stat">You have ${save.bandages}</span></div>
    <div class="stat">Heals ${BANDAGE_HEAL}% health. Press <kbd>H</kbd> underwater to use one.</div>
    <div class="row"><span class="stat">$${BANDAGE_COST} each</span><span><button data-n="1" ${save.money < BANDAGE_COST ? 'disabled' : ''}>Buy 1</button> <button data-n="5" ${save.money < BANDAGE_COST * 5 ? 'disabled' : ''}>Buy 5 · $${BANDAGE_COST * 5}</button></span></div>`;
  band.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      const n = Number(b.dataset.n);
      if (save.money < BANDAGE_COST * n) return;
      save.money -= BANDAGE_COST * n;
      save.bandages += n;
      audio.buy();
      persist();
      renderShop();
    };
  });
  up.appendChild(band);
  for (const [key, name, tiers, stat] of rows) {
    const cur = save[key] as number;
    const next = tiers[cur + 1];
    const div = document.createElement('div');
    div.className = 'upg';
    div.innerHTML = `
      <div class="row"><span class="name">${name}: ${tiers[cur].label}</span><span class="pips">${tiers.map((_, i) => `<i class="${i <= cur ? 'on' : ''}"></i>`).join('')}</span></div>
      <div class="stat">${stat(cur)}</div>
      ${next ? `<div class="row"><span class="stat">Next: ${next.label} — ${stat(cur + 1)}</span><button ${save.money < next.cost ? 'disabled' : ''}>$${next.cost}</button></div>` : '<div class="stat">Maxed out.</div>'}`;
    const btn = div.querySelector('button');
    if (btn && next)
      btn.onclick = () => {
        if (save.money < next.cost) return;
        save.money -= next.cost;
        (save[key] as number) = cur + 1;
        audio.buy();
        persist();
        renderShop();
      };
    up.appendChild(div);
  }
  $('journal').innerHTML = SPECIES.map((sp) =>
    save.journal.includes(sp.id)
      ? `<li class="${sp.infection >= 0.15 ? 'infected' : ''}"><b>${sp.name} · $${sp.price} · ${sp.minDepth}–${sp.maxDepth} m</b><span>${sp.lore}</span></li>`
      : `<li class="unknown"><b>??? · ${sp.minDepth}–${sp.maxDepth} m</b></li>`,
  ).join('');
}

// ---------- Death / ending ----------
function die(reason: string) {
  mode = 'dead';
  document.exitPointerLock();
  const lost = cargo.length;
  cargo = [];
  save.deaths++;
  persist();
  endSpear();
  $('dead-title').textContent = reason;
  $('dead-text').textContent = `Teodor hauled you up by the line.${lost ? ` Your catch (${lost} fish) sank with you.` : ''}`;
  ui.dead.classList.remove('hidden');
}

let shakeOverride = -1;
let manualCut = false; // QA: cutscene clock driven by __game.stepCut
const cutscene = new Cutscene(scene, camera, world, audio, {
  caption(text) {
    ui.caption.textContent = text;
    ui.caption.classList.toggle('show', !!text);
  },
  fade(a) {
    ui.fade.style.opacity = String(a);
  },
  letterbox(on) {
    ui.letterbox.classList.toggle('on', on);
  },
  shake(a) {
    shakeOverride = a;
  },
  onSwitchToCity() {
    fishMgr.clear();
    fishMgr.enabled = false;
  },
  onEnd() {
    mode = 'ending';
    ui.caption.classList.remove('show');
    ui.letterbox.classList.remove('on');
    const mins = Math.floor(save.playTime / 60);
    $('stats').innerHTML = [
      ['Deepest dive', `${Math.round(Math.max(save.maxDepth, ENDING_DEPTH))} m`],
      ['Fish caught', save.caught],
      ['Money earned', `$${save.earned}`],
      ['Times drowned', save.deaths],
      ['Species logged', `${save.journal.length}/${SPECIES.length}`],
      ['Time in the lake', `${mins} min`],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    ui.ending.classList.remove('hidden');
    document.title = 'ANTOPLASM';
    wipe();
  },
});

function triggerEnding() {
  if (mode === 'cutscene' || mode === 'ending') return;
  mode = 'cutscene';
  (window as any).__noPause = true;
  document.exitPointerLock();
  ui.hud.classList.add('hidden');
  ui.pressure.style.display = 'none';
  endSpear();
  gun.root.visible = false;
  cutscene.start();
}

// ---------- Loop ----------
const clock = new THREE.Clock();
let time = 0;
let lastDepthShown = -1;

function updatePlayer(dt: number) {
  const pos = camera.position;
  const k = (c: string) => (keys.has(c) ? 1 : 0);
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const look = new THREE.Euler(pitch, yaw, 0, 'YXZ');
  const fwd = new THREE.Vector3(0, 0, -1).applyEuler(look);
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const acc = new THREE.Vector3()
    .addScaledVector(fwd, k('KeyW') - k('KeyS'))
    .addScaledVector(right, k('KeyD') - k('KeyA'))
    .add(new THREE.Vector3(0, k('Space') - k('KeyC') - k('ControlLeft'), 0));
  if (acc.lengthSq() > 0) acc.normalize().multiplyScalar(sprint ? 50 : 32);
  const above = pos.y > -0.4;
  vel.addScaledVector(acc, dt);
  vel.multiplyScalar(Math.exp(-2.3 * dt));
  // Floating at the surface unless actively diving.
  if (pos.y > -1.5 && acc.y >= -0.01 && !keys.has('KeyC') && !keys.has('ControlLeft')) vel.y += (0.55 - pos.y) * 8 * dt;
  pos.addScaledVector(vel, dt);
  if (pos.y > 0.9) {
    pos.y = 0.9;
    vel.y = Math.min(vel.y, 0);
  }
  world.clampToLake(pos);

  const depth = depthNow();
  save.maxDepth = Math.max(save.maxDepth, depth);
  if (above) {
    air = Math.min(1, air + dt * 0.5);
    hp = Math.min(100, hp + dt * 6);
  } else {
    air -= (dt * (1 + depth / 350) * (sprint ? 1.5 : 1)) / airMax();
    if (ventAir > 0) {
      air = Math.min(1, air + ventAir / airMax());
      if (!save.logs.includes(9999)) {
        save.logs.push(9999);
        showLog("The vent's bubbles are breathable. Warm. They taste of iron, and something sweeter.");
      }
    }
    if (air <= 0) {
      air = 0;
      hp -= 12 * dt;
      damageFlash = Math.max(damageFlash, 0.4);
    }
  }
  const over = depth - tierA().rating;
  ui.pressure.style.display = over > 0 ? 'block' : 'none';
  if (over > 0) {
    hp -= (6 + over * 0.35) * dt;
    damageFlash = Math.max(damageFlash, 0.3);
    shake = Math.max(shake, Math.min(0.4, over / 60));
  }
  if (hp <= 0) {
    die(air <= 0 ? 'You drowned' : over > 0 ? 'The pressure crushed your suit' : 'Something ate you');
    return;
  }

  for (const log of DEPTH_LOGS) {
    if (depth >= log.depth && !save.logs.includes(log.depth)) {
      save.logs.push(log.depth);
      showLog(log.text);
      persist();
      if (log.depth >= 300) audio.whale(0.35, 60);
    }
  }
  if (depth >= ENDING_DEPTH) triggerEnding();
}

function updateHud(dt: number) {
  const depth = depthNow();
  const d = Math.round(depth);
  if (d !== lastDepthShown) {
    ui.depth.textContent = String(d);
    lastDepthShown = d;
  }
  ui.zone.textContent = camera.position.y > -0.4 ? 'Surface' : zoneName(depth);
  ui.rating.textContent = `Suit rated to ${tierA().rating} m`;
  ui.rating.classList.toggle('danger', depth > tierA().rating - 20);
  ui.air.style.width = `${air * 100}%`;
  ui.air.classList.toggle('low', air < 0.25);
  ui.hp.style.width = `${Math.max(0, hp)}%`;
  ui.reload.style.width = `${(1 - Math.max(0, reloadT) / tierH().reload) * 100}%`;
  ui.money.textContent = `$${save.money}`;
  ui.cargo.textContent = `Catch: ${cargo.length} fish · $${cargo.reduce((s, f) => s + f.price, 0)}`;
  ui.bandages.textContent = `Bandages: ${save.bandages}${save.bandages && hp < 100 ? ' · H to use' : ''}`;
  const vent = vents.active;
  const ventHint = vent ? (vents.reserveOf(vent) > 0.02 ? `Breathing vent gas — reserve ${Math.round(vents.reserveOf(vent) * 100)}%` : 'Vent spent — it needs time to recover') : '';
  const hint = nearBoat() ? "Press E — Teodor's boat (sell & upgrade)" : ventHint ? ventHint : air < 0.25 && depth > 2 ? 'Air low — surface!' : '';
  ui.hint.textContent = hint;
  ui.hint.classList.toggle('show', !!hint);
  ui.vignette.style.setProperty('--v', String(0.25 + Math.min(1, depth / 550) * 0.7 + (air < 0.25 ? 0.2 : 0)));
  ui.grain.style.opacity = String(Math.max(0, (depth - 250) / 350) * 0.35);
  damageFlash = Math.max(0, damageFlash - dt * 1.6);
  ui.damage.style.opacity = String(damageFlash);
  if (logTimer > 0) {
    logTimer -= dt;
    if (logTimer <= 0) ui.log.classList.remove('show');
  }
  // Crosshair lights up when a fish is in line.
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const far = camera.position.clone().addScaledVector(dir, 60);
  ui.crosshair.classList.toggle('target', fishMgr.fish.some((f) => {
    const d = f.root.position.distanceTo(camera.position);
    return d < 60 && segClosest(camera.position, far, f.root.position) < f.radius + 0.35 + d * 0.05;
  }));
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  syncHarpoonLook();
  ventAir = mode === 'cutscene' || mode === 'ending' ? 0 : vents.update(dt, time, mode === 'play' ? camera.position : new THREE.Vector3(0, 1e4, 0));
  if (mode === 'play') {
    save.playTime += dt;
    updatePlayer(dt);
    reloadT -= dt;
    updateSpear(dt);
    gun.setLoaded(reloadT <= 0);
  }
  if (mode === 'play' || mode === 'title' || mode === 'paused' || mode === 'shop' || mode === 'dead') {
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    if (mode === 'title') {
      yaw = Math.sin(time * 0.05) * 0.4;
      pitch = -0.05;
    }
  }
  const playing = mode === 'play';
  fishMgr.update(playing ? dt : mode === 'cutscene' ? dt : 0, time, camera.position, mode !== 'play');
  if (!manualCut) cutscene.update(dt);
  if (mode !== 'cutscene' && mode !== 'ending') world.update(dt, time, camera.position);
  fleshMat.emissiveIntensity = 0.45 + Math.sin(time * 2.1) * 0.25;
  if (playing) updateHud(dt);
  if (spearState.active) {
    const muzzle = gun.lineOrigin(new THREE.Vector3());
    if (Math.random() < 0.7) bubbles.emit(spear.position);
    ropeGeo.attributes.position.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
    ropeGeo.attributes.position.setXYZ(1, spear.position.x, spear.position.y, spear.position.z);
    ropeGeo.attributes.position.needsUpdate = true;
  }
  // Gun bob + camera shake.
  gun.update(dt, time, spearState.active);
  bubbles.update(dt);
  const sh = shakeOverride >= 0 && mode === 'cutscene' ? shakeOverride : shake;
  if (sh > 0) {
    camera.rotateX((Math.random() - 0.5) * sh * 0.03);
    camera.rotateY((Math.random() - 0.5) * sh * 0.03);
  }
  shake = Math.max(0, shake - dt * 2);
  audio.update(dt, mode === 'cutscene' ? 650 : depthNow(), Math.max(air < 0.25 ? 1 - air * 4 : 0, hp < 40 ? 1 - hp / 40 : 0), camera.position.y > 0.05, mode === 'cutscene' || mode === 'ending');
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// QA / debug hooks.
(window as any).__game = {
  get mode() { return mode; },
  get save() { return save; },
  get fish() { return fishMgr.fish.length; },
  get hp() { return hp; },
  get air() { return air; },
  teleport(depth: number, x = 0, z = 0) {
    camera.position.set(x, -depth, z);
    world.clampToLake(camera.position);
  },
  look(p: number, y = yaw) { pitch = p; yaw = y; },
  setSave(s: Partial<Save>) { Object.assign(save, s); },
  play() { (window as any).__noPause = true; startGame(); },
  fire() { reloadT = 0; fire(); },
  ending: triggerEnding,
  stepCut(sec: number) { manualCut = true; for (let i = 0; i < sec * 30; i++) cutscene.update(1 / 30); },
  get calls() { return renderer.info.render.calls; },
  shop: openShop,
  spawn(id: string, dist = 5, dx = 0, depthRoll?: number) {
    let sp = SPECIES.find((s) => s.id === id)!;
    if (depthRoll !== undefined) sp = rollIndividual(sp, depthRoll);
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const f = new Fish(sp, camera.position.clone().addScaledVector(dir, dist).addScaledVector(right, dx), Math.floor(Math.random() * 1e6));
    f.root.lookAt(f.root.position.clone().add(right));
    fishMgr.fish.push(f);
    fishMgr.group.add(f.root);
    return f;
  },
  clearFish() { fishMgr.clear(); },
  setAir(a: number) { air = a; },
  setHp(h: number) { hp = h; },
  get pos() { return camera.position; },
  get dock() { return world.dock; },
  place(x: number, y: number, z: number, p = 0, yw = 0) { vel.set(0, 0, 0); camera.position.set(x, y, z); pitch = p; yaw = yw; },
  vents,
  gun,
  freeze(on: boolean) { fishMgr.enabled = !on; },
  give(id: string) { const sp = SPECIES.find((s) => s.id === id)!; cargo.push(sp); },
};
