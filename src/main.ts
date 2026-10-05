import * as THREE from 'three';
import { Audio } from './audio';
import { AIR, ARMOR, BOAT_POS, DEPTH_LOGS, ENDING_DEPTH, HARPOON, rollIndividual, SPECIES, Species } from './config';
import { Cutscene } from './cutscene';
import { Fish, FishManager, fleshMat, type Diver } from './fish';
import { decodeSave, encodeSave } from './savecode';
import { causticUniforms } from './fx';
import { EVENT_IDS, HorrorEvents } from './events';
const TEODOR_KNOWS = 10006;
import { BubbleTrail, buildFlechette, buildSpear, HarpoonGun } from './harpoon';
import { isTouchDevice, TouchControls } from './touch';
import { Vents } from './vents';
import { ACHIEVEMENTS, Achievement, Achievements, renderAchievements } from './achievements';
import { loadProfile, mergeProfiles, sanitizeProfile, storeProfile } from './profile';
import { Account, isFreshRun, type RunSave } from './online';
import { Coop, Lobby, type DiverState, type FishSpawn } from './coop';
import { RemoteDivers } from './divers';
import { OnlineUI } from './onlineui';
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
  harpoonV: number; // harpoon table version, for migrating old saves
}
const SAVE_KEY = 'morrow-lake-save-v1';
const fresh = (): Save => ({ money: 0, air: 0, harpoon: 0, armor: 0, journal: [], logs: [], caught: 0, earned: 0, deaths: 0, maxDepth: 0, playTime: 0, bandages: 0, harpoonV: 2 });
/** Saves arrive from storage, pasted codes and the cloud, so never trust one blindly. */
function normalizeSave(loaded: Record<string, unknown>): Save {
  const out: Save = { ...fresh(), ...(loaded as Partial<Save>) };
  // v1 had six harpoon tiers; v2 inserted new ones in between. Keep the same gun.
  if (!loaded.harpoonV) out.harpoon = [0, 1, 3, 4, 6, 8][Number(loaded.harpoon) || 0] ?? 0;
  out.harpoonV = 2;
  const tier = (v: unknown, n: number) => Math.max(0, Math.min(n - 1, Math.floor(Number(v)) || 0));
  out.air = tier(out.air, AIR.length);
  out.harpoon = tier(out.harpoon, HARPOON.length);
  out.armor = tier(out.armor, ARMOR.length);
  if (!Array.isArray(out.journal)) out.journal = [];
  if (!Array.isArray(out.logs)) out.logs = [];
  return out;
}
let save: Save = fresh();
let hasSave = false;
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    save = normalizeSave(JSON.parse(raw));
    hasSave = true;
  }
} catch { /* storage unavailable: play without saving */ }
// Lifetime record (achievements, bests): survives the ending's wipe and "New Game".
const profile = loadProfile();
const writeLocal = () => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ }
  storeProfile(profile);
};
/** Save locally now; the cloud copy (when signed in) follows a few seconds later. */
const persist = () => {
  writeLocal();
  account.touch();
};
const ach = new Achievements(profile, (a) => {
  achToast(a);
  storeProfile(profile);
  account.touch();
});
const wipe = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
};

// ---------- Three ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const TOUCH = isTouchDevice();
let touch: TouchControls | null = null;
if (TOUCH) document.body.classList.add('touch');
// Phones have dense screens but small GPUs: cap the render resolution harder.
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.25 : 1.75));
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
// Harpoon gun held in view, plus the spear that actually flies.
const gun = new HarpoonGun(camera);
/** Fit the view to the screen. On a tall (portrait) phone a fixed vertical FOV leaves a keyhole-thin
 * horizontal view, so widen it to keep ~60° across, and pull the gun in so it stays on screen. */
function fitView() {
  renderer.setSize(innerWidth, innerHeight);
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  const minHalfH = Math.tan(THREE.MathUtils.degToRad(30));
  camera.fov = Math.min(100, Math.max(72, THREE.MathUtils.radToDeg(2 * Math.atan(minHalfH / aspect))));
  camera.updateProjectionMatrix();
  const portrait = aspect < 1;
  gun.root.position.set(portrait ? 0.1 : 0.2, portrait ? -0.24 : -0.18, -0.4);
}
addEventListener('resize', fitView);
fitView();
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
// Scattergun flechettes: a small pool, no line attached.
interface Pellet { obj: THREE.Object3D; vel: THREE.Vector3; prev: THREE.Vector3; travelled: number; active: boolean }
const pellets: Pellet[] = [];
for (let i = 0; i < 16; i++) {
  const obj = buildFlechette(0.6);
  obj.scale.set(2.4, 2.4, 1.2);
  obj.visible = false;
  scene.add(obj);
  pellets.push({ obj, vel: new THREE.Vector3(), prev: new THREE.Vector3(), travelled: 0, active: false });
}
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
let diveMinAir = 1;
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
  diveMinAir = 1;
}
spawnAtBoat();

const fishMgr = new FishManager(scene, {
  bite(f: Fish, diver: string) {
    if (diver !== localId()) return coop.send('bite', { to: diver, dmg: f.sp.damage });
    if (mode !== 'play') return;
    hurt(f.sp.damage * (1 - tierA().reduction));
  },
  cue(f, kind, diver) {
    if (diver !== localId()) return coop.send('cue', { to: diver, kind, k: f.key });
    if (mode !== 'play') return;
    // Louder the closer it is, so you can tell which one is coming.
    audio.cue(kind, Math.max(0.25, 1 - f.root.position.distanceTo(camera.position) / 40));
  },
  spawned(f) {
    if (coop.isHost) pendingSpawns.push(describeFish(f));
  },
});

const horror = new HorrorEvents({
  scene,
  camera,
  seen: (id) => save.logs.includes(id),
  mark: (id) => {
    save.logs.push(id);
    if (Object.values(EVENT_IDS).every((e) => save.logs.includes(e))) ach.unlock('all_scares');
    persist();
  },
  log: (text, secs) => showLog(text, secs),
  shake: (a) => (shake = Math.max(shake, a)),
  lamp: (m) => (world.lampMult = m),
  sound: audio,
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

function achToast(a: Achievement) {
  const el = document.createElement('div');
  el.className = 'toast ach';
  el.innerHTML = `<span class="ach-icon">${a.icon}</span><div><small>Achievement unlocked</small><b>${a.name}</b></div>`;
  ui.toasts.appendChild(el);
  setTimeout(() => el.remove(), 5200);
  audio.achievement();
  updateAchButtons();
}
const achProgress = (id: string) =>
  ({
    catch_50: profile.totalCaught,
    catch_200: profile.totalCaught,
    journal_all: save.journal.length,
    earn_10k: profile.totalEarned,
    all_scares: Object.values(EVENT_IDS).filter((e) => save.logs.includes(e)).length,
  })[id] ?? 0;
function updateAchButtons() {
  const label = `Achievements ${ach.count}/${ACHIEVEMENTS.length}`;
  $('btn-ach-title').textContent = label;
  $('btn-ach-pause').textContent = label;
}
function openAchievements() {
  renderAchievements($('ach-list'), profile.achievements, achProgress);
  $('ach-count').textContent = `${ach.count} of ${ACHIEVEMENTS.length} unlocked`;
  ui.pause.classList.add('hidden');
  $('achievements').classList.remove('hidden');
}
$('btn-ach-title').onclick = openAchievements;
$('btn-ach-pause').onclick = openAchievements;
$('btn-ach-back').onclick = () => {
  $('achievements').classList.add('hidden');
  if (mode === 'paused') ui.pause.classList.remove('hidden');
};
updateAchButtons();

// ---------- Harpoon ----------
function fire() {
  if (mode !== 'play' || reloadT > 0) return;
  if (tierH().pellets) return fireScatter();
  if (spearState.active) endSpear(); // a fresh shot cuts the line on the last one
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  spear.position.copy(camera.position).addScaledVector(dir, 0.6).add(new THREE.Vector3(0, -0.12, 0));
  spear.lookAt(spear.position.clone().add(dir));
  spearState.vel.copy(dir).multiplyScalar(tierH().speed).add(vel);
  spearState.active = true;
  spearState.travelled = 0;
  spear.visible = true;
  rope.visible = true;
  sendShot(spear.position, dir);
  gun.fire();
  reloadT = tierH().reload;
  audio.fire();
  shake = Math.max(shake, 0.12);
}

/** Shotgun: a cone of flechettes, each rolling its own direction inside the spread. */
function fireScatter() {
  const t = tierH();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const origin = camera.position.clone().addScaledVector(fwd, 0.7).addScaledVector(up, -0.12);
  let launched = 0;
  for (const p of pellets) {
    if (launched >= t.pellets!) break;
    if (p.active) continue;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * t.spread!;
    const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    p.obj.position.copy(origin);
    p.obj.lookAt(origin.clone().add(dir));
    p.vel.copy(dir).multiplyScalar(t.speed * (0.92 + Math.random() * 0.16)).add(vel);
    p.travelled = 0;
    p.active = true;
    p.obj.visible = true;
    launched++;
  }
  for (let i = 0; i < 18; i++) bubbles.emit(origin.clone().addScaledVector(fwd, Math.random() * 1.5)); // muzzle blast
  sendShot(origin, fwd);
  gun.fire();
  reloadT = t.reload;
  audio.blast();
  shake = Math.max(shake, 0.45);
}

function updatePellets(dt: number) {
  const t = tierH();
  for (const p of pellets) {
    if (!p.active) continue;
    p.prev.copy(p.obj.position);
    p.vel.multiplyScalar(Math.exp(-1.1 * dt));
    p.obj.position.addScaledVector(p.vel, dt);
    p.travelled += p.vel.length() * dt;
    if (Math.random() < 0.25) bubbles.emit(p.obj.position);
    let hit = false;
    for (const f of [...fishMgr.fish]) {
      if (!f.alive) continue;
      if (segClosest(p.prev, p.obj.position, f.root.position) < f.radius + 0.35 + p.travelled * 0.03) {
        hitFish(f, t.damage, p.vel, 0.03);
        hit = true;
        break;
      }
    }
    if (hit || p.travelled > (t.range ?? 32) || p.obj.position.y < floorY(p.obj.position.x, p.obj.position.z) || p.vel.length() < 10) {
      p.active = false;
      p.obj.visible = false;
    }
  }
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
      hitFish(f, tierH().damage, spearState.vel, 0.06);
      endSpear();
      return;
    }
  }
  if (spearState.travelled > 65 || spear.position.y < floorY(spear.position.x, spear.position.z) || spearState.vel.length() < 8) endSpear();
}
function endSpear() {
  for (const p of pellets) {
    p.active = false;
    p.obj.visible = false;
  }
  spearState.active = false;
  spear.visible = false;
  rope.visible = false;
}

/** Our spear/flechette hit a fish. In co-op the host owns every fish's health, so a guest just reports it. */
function hitFish(f: Fish, dmg: number, push: THREE.Vector3, kick: number) {
  f.flash();
  audio.hit();
  if (coop.active && !coop.isHost) {
    pendingHits.set(f.key, (pendingHits.get(f.key) ?? 0) + dmg);
    return;
  }
  f.hp -= dmg;
  f.hitBy.add(localId());
  if (f.hp <= 0) killFish(f, localId());
  else f.vel.addScaledVector(push, kick);
}
/** Host/offline: a fish died. Whoever landed the killing shot gets the catch. */
function killFish(f: Fish, by: string) {
  const assist = [...f.hitBy].some((id) => id !== by);
  if (coop.active) coop.send('kill', { k: f.key, by, sp: f.sp, assist });
  fishMgr.remove(f);
  if (by === localId()) landCatch(f.sp, assist);
}
function landCatch(sp: Species, assist: boolean) {
  if (assist) ach.unlock('coop_catch');
  cargo.push(sp);
  save.caught++;
  profile.totalCaught++;
  const first = !save.journal.includes(sp.id);
  if (first) save.journal.push(sp.id);
  ach.unlock('first_catch');
  if (profile.totalCaught >= 50) ach.unlock('catch_50');
  if (profile.totalCaught >= 200) ach.unlock('catch_200');
  if (save.journal.length >= SPECIES.length) ach.unlock('journal_all');
  if (sp.large) ach.unlock('big_game');
  if (sp.large && sp.name.startsWith('Infected')) ach.unlock('rotten_trophy');
  if (sp.id === 'cathedral') ach.unlock('cathedral');
  const inf = sp.infection >= 0.15;
  toast(`+ ${sp.name} <b>$${sp.price}</b>${first ? `<small>${sp.lore}</small>` : ''}`, inf);
  if (inf) audio.catchInfected(sp.infection);
  else audio.catchHealthy();
  persist();
}

// ---------- Input ----------
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLTextAreaElement) return; // typing a save code, not playing
  keys.add(e.code);
  if (e.code === 'KeyM') audio.muted = !audio.muted;
  if (e.code === 'KeyH' && mode === 'play') useBandage();
  if (e.code === 'KeyE') {
    if (mode === 'play') shopHere();
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
  if (TOUCH) return;
  if (mode === 'play' && e.button === 0) {
    if (document.pointerLockElement !== canvas) lock();
    else fire();
  }
});
const lock = () => {
  if (TOUCH) return; // touch uses drag-to-look, no pointer lock
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
// ---------- Save code (move progress between devices) ----------
const codeOut = $<HTMLTextAreaElement>('code-out');
const codeIn = $<HTMLTextAreaElement>('code-in');
const codeMsg = $('code-msg');
const say = (text: string, kind: 'ok' | 'err' | '' = '') => {
  codeMsg.textContent = text;
  codeMsg.className = `code-msg ${kind}`;
};
function openSaveCode() {
  persist();
  codeOut.value = encodeSave({ ...save, profile });
  codeIn.value = '';
  say('');
  ui.pause.classList.add('hidden');
  $('savecode').classList.remove('hidden');
}
$('btn-code-title').onclick = openSaveCode;
$('btn-code-pause').onclick = openSaveCode;
$('btn-code-back').onclick = () => {
  $('savecode').classList.add('hidden');
  if (mode === 'paused') ui.pause.classList.remove('hidden');
};
$('btn-code-copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(codeOut.value);
  } catch {
    codeOut.focus();
    codeOut.select();
    document.execCommand('copy');
  }
  say('Copied. Paste it into Morrow Lake on your other device.', 'ok');
};
$('btn-code-load').onclick = () => {
  const r = decodeSave(codeIn.value);
  if (!r.ok) return say(r.error, 'err');
  try {
    const { profile: carried, ...run } = r.save;
    localStorage.setItem(SAVE_KEY, JSON.stringify(run));
    if (carried) storeProfile(mergeProfiles(profile, sanitizeProfile(carried)));
  } catch {
    return say("This browser won't let the game save (private browsing?).", 'err');
  }
  say(`Loaded: $${Number(r.save.money) || 0}, ${Number(r.save.caught) || 0} fish caught. Restarting…`, 'ok');
  setTimeout(() => location.reload(), 900);
};

// ---------- Keep the save safe: persistent storage + installable app ----------
// Ask the browser not to evict our storage. Granted silently on most browsers once the
// site is installed or used a lot; harmless if refused.
navigator.storage?.persist?.().catch(() => {});
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
let installPrompt: (Event & { prompt: () => Promise<void> }) | null = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // show our own button instead of the browser's mini-bar
  installPrompt = e as typeof installPrompt;
  $('btn-install').classList.remove('hidden');
});
$('btn-install').onclick = async () => {
  if (!installPrompt) return;
  await installPrompt.prompt().catch(() => {});
  installPrompt = null;
  $('btn-install').classList.add('hidden');
};
addEventListener('appinstalled', () => $('btn-install').classList.add('hidden'));
// iPhone/iPad Safari has no install prompt, and evicts a plain site's storage after
// ~7 days away; a home-screen app keeps it. So tell iOS players how to add it.
const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (iOS && !standalone) $('ios-tip').classList.remove('hidden');
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

$('btn-resume').onclick = () => {
  ui.pause.classList.add('hidden');
  mode = 'play';
  lock();
};
$('btn-close').onclick = () => closeShop();
$('btn-close-top').onclick = () => closeShop();
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
  if (TOUCH) {
    // Best effort: fullscreen hides browser chrome. Both orientations are playable, so no lock.
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.();
      Promise.resolve(p).catch(() => {});
    } catch { /* not supported (e.g. iPhone Safari) */ }
  }
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
  ach.unlock('bandage');
  audio.bandage();
  toast(`Bandaged +${BANDAGE_HEAL}% health <small>${save.bandages} left</small>`);
  persist();
}

// ---------- Shop ----------
const nearBoat = () => Math.hypot(camera.position.x - BOAT_POS.x, camera.position.z - BOAT_POS.z) < 15 && camera.position.y > -2.5;
// Teodor's skiff: once you've been deep, surface anywhere and he comes to you. The deep water is
// ~230 m out from the jetty; without this every deep dive starts and ends with a long empty swim.
const SKIFF_DEPTH = 150;
const SKIFF_LOG = 10007;
const skiffReady = () => save.maxDepth >= SKIFF_DEPTH;
const canCallSkiff = () => skiffReady() && camera.position.y > -2.5 && !nearBoat();
const canShop = () => nearBoat() || canCallSkiff();
let skiffT = 0;
function callSkiff() {
  if (mode !== 'play' || skiffT > 0) return;
  skiffT = 1.4;
  ach.unlock('skiff');
  mode = 'paused'; // hold still while he rows over
  ui.fade.style.transition = 'opacity 0.5s';
  ui.fade.style.opacity = '0.85';
  audio.splash();
  setTimeout(() => {
    ui.fade.style.opacity = '0';
    mode = 'play';
    skiffT = 0;
    openShop();
    toast('Teodor rows out to meet you.');
  }, 900);
}
function shopHere() {
  if (mode !== 'play') return;
  if (nearBoat()) openShop();
  else if (canCallSkiff()) callSkiff();
}

function teodorLine() {
  const d = save.maxDepth;
  // He says this once, the first time you come back after finding the diver.
  if (save.logs.includes(EVENT_IDS.blackout) && !save.logs.includes(TEODOR_KNOWS)) {
    save.logs.push(TEODOR_KNOWS);
    persist();
    return `"...You found him. Didn't you. Don't — don't tell me how he looked. Just sell your fish."`;
  }
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
  profile.totalEarned += total;
  if (profile.totalEarned >= 10000) ach.unlock('earn_10k');
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
    ['harpoon', 'Harpoon', HARPOON, (i) => (HARPOON[i].pellets ? `shotgun: ${HARPOON[i].pellets} × ${HARPOON[i].damage} dmg flechettes · ${HARPOON[i].reload}s` : `${HARPOON[i].damage} dmg · ${HARPOON[i].reload}s reload`)],
    ['armor', 'Armour', ARMOR, (i) => `-${Math.round(ARMOR[i].reduction * 100)}% dmg · rated ${ARMOR[i].rating} m`],
  ];
  const up = $('upgrades');
  up.innerHTML = '';
  const band = document.createElement('div');
  band.className = 'upg';
  band.innerHTML = `
    <div class="row"><span class="name">Bandages</span><span class="stat">You have ${save.bandages}</span></div>
    <div class="stat">Heals ${BANDAGE_HEAL}% health. ${TOUCH ? 'Tap ✚' : 'Press <kbd>H</kbd>'} underwater to use one.</div>
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
        if (key === 'harpoon' && HARPOON[cur + 1].pellets) ach.unlock('scattergun');
        if (save.air === AIR.length - 1 && save.harpoon === HARPOON.length - 1 && save.armor === ARMOR.length - 1) ach.unlock('fully_kitted');
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
  horror.reset();
  document.exitPointerLock();
  const lost = cargo.length;
  cargo = [];
  save.deaths++;
  ach.unlock(reason.includes('drowned') ? 'die_drown' : reason.includes('pressure') ? 'die_pressure' : 'die_eaten');
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
    profile.endings++;
    profile.bestEnding = profile.bestEnding === null ? save.playTime : Math.min(profile.bestEnding, save.playTime);
    ach.unlock('ending');
    if (save.deaths === 0) ach.unlock('no_deaths');
    if (save.playTime < 40 * 60) ach.unlock('speedrun');
    storeProfile(profile);
    // The run is over: the cloud copy starts fresh too (records keep every best).
    save = fresh();
    account.touch();
    void account.flush();
    wipe();
  },
});

function triggerEnding() {
  if (mode === 'cutscene' || mode === 'ending') return;
  coop.leave(); // the bottom of the lake is a solo trip
  mode = 'cutscene';
  (window as any).__noPause = true;
  document.exitPointerLock();
  ui.hud.classList.add('hidden');
  ui.pressure.style.display = 'none';
  endSpear();
  gun.root.visible = false;
  horror.reset();
  cutscene.start();
}

// ---------- Loop ----------
const clock = new THREE.Clock();
const lookDir = new THREE.Vector3();
let time = 0;
let lastDepthShown = -1;
let hudNetT = 0;

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
  if (touch) acc.addScaledVector(fwd, touch.move.y).addScaledVector(right, touch.move.x);
  // Analog: a half-pushed stick swims at half speed; keys are always full speed.
  const mag = Math.min(1, acc.length());
  if (mag > 0) acc.normalize().multiplyScalar((sprint ? 50 : 32) * mag);
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
  profile.deepest = Math.max(profile.deepest, depth);
  for (const d of [100, 250, 400, 550]) if (depth >= d) ach.unlock(`depth_${d}`);
  // Close call: track the lowest air on this dive, judge it when you break the surface.
  if (above) {
    if (diveMinAir < 0.05) ach.unlock('close_call');
    diveMinAir = 1;
  } else diveMinAir = Math.min(diveMinAir, air);
  if (above) {
    air = Math.min(1, air + dt * 0.5);
    hp = Math.min(100, hp + dt * 6);
  } else {
    air -= (dt * (1 + depth / 350) * (sprint ? 1.5 : 1)) / airMax();
    if (ventAir > 0) {
      air = Math.min(1, air + ventAir / airMax());
      ach.unlock('vent');
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

  // Teodor's outboard: announced the first time you surface after going deep enough.
  if (skiffReady() && !save.logs.includes(SKIFF_LOG) && camera.position.y > -2.5 && !nearBoat()) {
    save.logs.push(SKIFF_LOG);
    persist();
    showLog(`RADIO: "Got the old outboard running. Surface anywhere and I'll come to you — ${TOUCH ? 'tap SHOP' : 'press E'}."`, 9);
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
  const shopHint = nearBoat() ? "Teodor's boat (sell & upgrade)" : canCallSkiff() ? "call Teodor's skiff (sell & upgrade)" : '';
  const hint = shopHint ? `${TOUCH ? 'Tap SHOP' : 'Press E'} — ${shopHint}` : ventHint ? ventHint : air < 0.25 && depth > 2 ? 'Air low — surface!' : '';
  ui.hint.textContent = hint;
  ui.hint.classList.toggle('show', !!hint);
  if (touch) {
    touch.setShopAvailable(canShop());
    touch.setBandages(save.bandages);
  }
  hudNetT -= dt;
  if (hudNetT <= 0) {
    hudNetT = 0.25;
    onlineUI?.hud(depth);
  }
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

// QA: fast-forward runs the simulation several steps per rendered frame; a bot can steer each step.
let timeScale = 1;
let botStep: ((dt: number) => void) | null = null;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  for (let i = 0; i < timeScale; i++) tick(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function tick(dt: number) {
  time += dt;
  if (botStep && mode === 'play') botStep(dt);
  syncHarpoonLook();
  ventAir = mode === 'cutscene' || mode === 'ending' ? 0 : vents.update(dt, time, mode === 'play' ? camera.position : new THREE.Vector3(0, 1e4, 0));
  document.body.classList.toggle('on-title', mode === 'title');
  if (touch) {
    touch.setVisible(mode === 'play');
    if (mode === 'play') {
      const l = touch.consumeLook();
      yaw += l.yaw;
      pitch = Math.max(-1.5, Math.min(1.5, pitch + l.pitch));
      if (touch.fireHeld) fire(); // hold to keep firing as fast as the reload allows
    }
  }
  if (mode === 'play') {
    save.playTime += dt;
    updatePlayer(dt);
    reloadT -= dt;
    updateSpear(dt);
    updatePellets(dt);
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
  // In co-op the lake never pauses for one player: the host keeps the fish going from the shop too.
  const coopLive = coop.active && mode !== 'cutscene' && mode !== 'ending';
  fishMgr.updateAll(playing || mode === 'cutscene' || coopLive ? dt : 0, time, divers());
  if (coop.active) netTick(dt);
  remote.update(dt, time);
  remote.updateTracers(dt);
  if (!manualCut) cutscene.update(dt);
  if (mode !== 'cutscene' && mode !== 'ending') world.update(dt, time, camera.position);
  horror.update(mode === 'play' ? dt : 0, depthNow(), mode === 'play'); // frozen while paused/in the shop
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
}
requestAnimationFrame(frame);

// ---------- Touch ----------
function pauseGame() {
  if (mode !== 'play') return;
  mode = 'paused';
  ui.pause.classList.remove('hidden');
}
touch = TOUCH
  ? new TouchControls(keys, {
      onBandage: () => mode === 'play' && useBandage(),
      onShop: () => shopHere(),
      onPause: pauseGame,
    })
  : null;
if (TOUCH) {
  gun.root.position.set(0.15, -0.2, -0.42);
  gun.root.scale.setScalar(0.4);
  $('controls-desktop').classList.add('hidden');
  $('controls-touch').classList.remove('hidden');
}
// Phones: going to the background pauses instead of drowning you.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

// ---------- Online: accounts, cloud saves, co-op ----------
const localId = () => (coop.active ? account.userId ?? 'local' : 'local');
const remote = new RemoteDivers(scene);
let pendingSpawns: FishSpawn[] = [];
const pendingHits = new Map<string, number>();
let netT = 0;
let fishNetT = 0;
let lastNeed = 0;
const describeFish = (f: Fish): FishSpawn => ({ k: f.key, sp: f.sp, seed: f.seed, p: [f.root.position.x, f.root.position.y, f.root.position.z] });
const lookOf = (yw: number, pt: number) => new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pt, yw, 0, 'YXZ'));
const divers = (): Diver[] => {
  const list: Diver[] = [{ id: localId(), pos: camera.position, look: camera.getWorldDirection(lookDir), hidden: mode !== 'play' }];
  if (coop.active) for (const r of remote.states()) list.push({ id: r.id, pos: new THREE.Vector3(r.s.x, r.s.y, r.s.z), look: lookOf(r.s.yaw, r.s.pitch), hidden: r.s.hidden });
  return list;
};
const myState = (): DiverState => ({
  x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw, pitch,
  hidden: mode !== 'play', live: !document.hidden && ['play', 'paused', 'shop', 'dead'].includes(mode), hp: Math.round(hp), tier: save.harpoon,
});
function sendShot(o: THREE.Vector3, d: THREE.Vector3) {
  if (!coop.active) return;
  const r = (v: number) => Math.round(v * 100) / 100;
  coop.send('shot', { id: localId(), o: [r(o.x), r(o.y), r(o.z)], d: [r(d.x), r(d.y), r(d.z)], tier: save.harpoon });
}
function netTick(dt: number) {
  coop.live = myState().live;
  netT += dt;
  fishNetT += dt;
  if (netT >= 1 / 8) {
    netT = 0;
    coop.send('p', { id: localId(), s: myState() });
    if (pendingHits.size) {
      coop.send('hit', { hits: [...pendingHits.entries()], by: localId() });
      pendingHits.clear();
    }
  }
  if (coop.isHost && fishNetT >= 0.2) {
    fishNetT = 0;
    if (pendingSpawns.length) coop.send('spawn', { list: pendingSpawns.splice(0) });
    coop.send('fs', { rows: fishMgr.snapshot() });
  }
  // Co-op achievements.
  if (mode === 'play' && depthNow() > 5 && coop.peers.size >= 2) ach.unlock('coop_dive');
  if (coop.peers.size >= 4) ach.unlock('coop_full');
}

const coop = new Coop(() => ({ id: account.userId ?? 'local', name: account.me?.display_name ?? 'Diver' }), {
  peersChanged(peers) {
    remote.sync(peers.filter((p) => p.id !== account.userId));
    if (!coop.active) {
      // Back to solo: our own game owns the fish again.
      fishMgr.authority = true;
      remote.clear();
    }
    onlineUI?.render();
  },
  hostChanged(isHost) {
    if (isHost) {
      fishMgr.takeAuthority(`${(account.userId ?? 'x').slice(0, 4)}${(Date.now() % 1e5).toString(36)}-`);
      pendingSpawns = fishMgr.fish.map(describeFish); // let everyone (re)build what we have
      if (coop.active) toast('You are running the lake for this room.');
    } else if (coop.active) {
      fishMgr.authority = false;
    }
  },
  peerState(id, s) {
    remote.push(id, s);
  },
  fishSnapshot(rows) {
    const missing = fishMgr.applySnapshot(rows);
    if (missing.length && performance.now() - lastNeed > 1000) {
      lastNeed = performance.now();
      coop.send('need', { keys: missing });
    }
  },
  fishSpawn(list) {
    for (const f of list) if (!fishMgr.byKey(f.k)) fishMgr.add(f.sp, new THREE.Vector3(...f.p), f.seed, f.k);
  },
  fishNeed(keys) {
    for (const k of keys) {
      const f = fishMgr.byKey(k);
      if (f && !pendingSpawns.some((p) => p.k === k)) pendingSpawns.push(describeFish(f));
    }
  },
  fishHit(hits, by) {
    for (const [k, dmg] of hits) {
      const f = fishMgr.byKey(k);
      if (!f || !f.alive) continue;
      f.hp -= dmg;
      f.hitBy.add(by);
      f.flash();
      if (f.hp <= 0) killFish(f, by);
    }
  },
  fishKill(k, by, sp, assist) {
    const f = fishMgr.byKey(k);
    if (f) fishMgr.remove(f);
    if (by === account.userId) landCatch(sp, assist);
  },
  bitten(dmg) {
    if (mode === 'play') hurt(dmg * (1 - tierA().reduction));
  },
  cue(kind, k) {
    if (mode !== 'play') return;
    const f = fishMgr.byKey(k);
    audio.cue(kind as Parameters<typeof audio.cue>[0], Math.max(0.25, 1 - (f ? f.root.position.distanceTo(camera.position) : 20) / 40));
  },
  shot(id, o, d, tier) {
    const h = HARPOON[tier] ?? HARPOON[0];
    remote.shot(o, d, h.speed, h.pellets ?? 1);
    if (new THREE.Vector3(o[0], o[1], o[2]).distanceTo(camera.position) < 30) audio.hit();
    void id;
  },
  problem(msg) {
    toast(msg);
  },
});

const lobby = new Lobby(() => onlineUI?.render());
let onlineUI: OnlineUI | null = null;
const account = new Account({
  getSave: () => save as unknown as RunSave,
  getRecord: () => profile,
  applyRecord(r) {
    Object.assign(profile, mergeProfiles(profile, sanitizeProfile(r)));
    storeProfile(profile);
    updateAchButtons();
  },
  applySave(s) {
    save = normalizeSave(s);
    writeLocal();
    if (mode === 'title') {
      hasSave = !isFreshRun(s);
      $('btn-start').textContent = hasSave ? 'Continue' : 'Start Fishing';
      $('btn-new').classList.toggle('hidden', !hasSave);
    } else {
      // Swapped mid-game (another device won a conflict): wake up on the boat with that run.
      cargo = [];
      spawnAtBoat();
      toast('Loaded your cloud save.');
    }
  },
  chooseRun: (local, cloud) => onlineUI!.chooseRun(local, cloud),
  changed() {
    if (account.me) {
      ach.unlock('signed_in');
      lobby.start(account.me.id, account.me.display_name, coop.code);
      lobby.set(account.me.display_name, coop.code); // picks up renames
    }
    onlineUI?.render();
  },
});
onlineUI = new OnlineUI({
  account,
  coop,
  lobby,
  mode: () => mode,
  dive() {
    if (mode === 'title') startGame();
    else if (mode === 'paused') {
      mode = 'play';
      lock();
    }
  },
  toast,
  unlock: (id) => ach.unlock(id),
});
void account.init().then(() => {
  // Invite links: ?room=CODE opens the co-op tab and joins.
  const room = new URLSearchParams(location.search).get('room');
  if (!room || !account.enabled) return;
  history.replaceState(null, '', location.pathname);
  if (mode !== 'title') return;
  onlineUI!.open('title', account.me ? 'coop' : 'account');
  if (account.me) void onlineUI!.joinRoom(room);
  else toast('Sign in to join your friend’s room.');
});
addEventListener('pagehide', () => void account.flush());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) void account.flush();
});

// QA / debug hooks.
(window as any).__game = {
  get mode() { return mode; },
  get save() { return save; },
  get fish() { return fishMgr.fish.length; },
  get hp() { return hp; },
  get profile() { return profile; },
  account,
  coop,
  get fishAuthority() { return fishMgr.authority; },
  get remoteDivers() { return remote.states().map((r) => ({ id: r.id, ...r.s })); },
  get myId() { return localId(); },
  persist: () => persist(),
  spawnAt(id: string, x: number, y: number, z: number) {
    const f = fishMgr.add(SPECIES.find((s) => s.id === id)!, new THREE.Vector3(x, y, z), 1234);
    if (coop.isHost) pendingSpawns.push(describeFish(f));
    return f.key;
  },
  get cargoCount() { return cargo.length; },
  unlock: (id: string) => ach.unlock(id),
  get air() { return air; },
  get fov() { return camera.fov; },
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
  get world() { return world; },
  caustics: causticUniforms,
  shop: openShop,
  spawn(id: string, dist = 5, dx = 0, depthRoll?: number) {
    let sp = SPECIES.find((s) => s.id === id)!;
    if (depthRoll !== undefined) sp = rollIndividual(sp, depthRoll);
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const f = fishMgr.add(sp, camera.position.clone().addScaledVector(dir, dist).addScaledVector(right, dx), Math.floor(Math.random() * 1e6));
    f.root.lookAt(f.root.position.clone().add(right));
    if (coop.isHost) pendingSpawns.push(describeFish(f));
    return f;
  },
  clearFish() { fishMgr.clear(); },
  scare(name: 'shadow' | 'blackout' | 'radio' | 'beneath' | 'eyes') { horror.trigger(name); },
  get scareBusy() { return horror.busy; },
  set spawning(v: boolean) { fishMgr.spawning = v; },
  get fishes() { return fishMgr.fish.map((f) => ({ id: f.sp.id, state: f.state, dist: f.root.position.distanceTo(camera.position), hp: f.hp })); },
  move(dx: number, dy: number, dz: number) { camera.position.x += dx; camera.position.y += dy; camera.position.z += dz; },
  setAir(a: number) { air = a; },
  setHp(h: number) { hp = h; },
  get pos() { return camera.position; },
  get view() { return { yaw, pitch }; },
  get dock() { return world.dock; },
  place(x: number, y: number, z: number, p = 0, yw = 0) { vel.set(0, 0, 0); camera.position.set(x, y, z); pitch = p; yaw = yw; },
  vents,
  gun,
  freeze(on: boolean) { fishMgr.enabled = !on; },
  keys,
  set speed(n: number) { timeScale = Math.max(1, Math.floor(n)); },
  set bot(fn: ((dt: number) => void) | null) { botStep = fn; },
  trigger() { fire(); }, // a real trigger pull: respects reload, unlike fire()
  get reloading() { return reloadT > 0 || spearState.active; },
  get cargo() { return cargo.map((f) => ({ id: f.id, price: f.price })); },
  get rating() { return tierA().rating; },
  get airSeconds() { return airMax(); },
  get fishList() { return fishMgr.fish.map((f) => ({ id: f.sp.id, x: f.root.position.x, y: f.root.position.y, z: f.root.position.z, r: f.radius, aggressive: f.sp.aggressive, state: f.state, hp: f.hp, price: f.sp.price })); },
  bandage() { if (mode === 'play') useBandage(); },
  give(id: string) { const sp = SPECIES.find((s) => s.id === id)!; cargo.push(sp); },
};
