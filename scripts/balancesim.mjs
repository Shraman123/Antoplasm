// Progression simulator: plays the whole game on paper with the real balance tables from
// src/config.ts and the real movement/air rules from main.ts, using a sensible strategy.
// Reports the time to unlock each zone, dives per upgrade, and the total length.
//   node scripts/balancesim.mjs [--runs N]
// Assumptions (stated so they can be argued with) are in ASSUME below.
import { AIR, ARMOR, HARPOON, SPECIES, BOAT_POS, ENDING_DEPTH } from '../src/config.ts';

const ASSUME = {
  swim: 32 / 2.3, // terminal swim speed m/s (accel / drag in updatePlayer)
  airMargin: 0.2, // keep 20% of the tank in reserve for the trip up
  encounter: 6, // s to find and line up the next fish
  hitRate: 0.6, // fraction of spear shots that land
  aimOverhead: 0.6, // s per shot beyond the reload
  bitesPerAggressiveCatch: 0.45, // with the new tells, a careful player still takes some hits
  maxDiveDamage: 75, // a sensible player avoids depths where they'd expect to lose this much HP
  surfaceTime: 25, // s at the boat: selling, shopping, catching breath
  scatterPellets: 4.5, // flechettes that land per scattergun blast at fishing range
  ventAir: 35, // below 260 m, one stop at a hydrothermal vent tops the tank up this much...
  ventSecs: 10, // ...for this many seconds spent getting there and breathing
};

// Lake floor (same as world.ts floorY without the noise): radius at which the floor reaches depth d.
function radiusForDepth(d) {
  if (d <= 15) return 330;
  const t = 1 - Math.pow((d - 15) / (620 - 15), 1 / 1.7);
  return 20 + t * 310;
}
const boatR = Math.hypot(BOAT_POS.x, BOAT_POS.z);

/** Air-seconds and seconds for a swim to a spot `d` deep (one way). Before the skiff unlocks
 *  (first time below 150 m) you swim out from the jetty; after, Teodor drops you right above it. */
let skiff = false;
function trip(d) {
  const horiz = skiff ? 0 : Math.max(0, boatR - radiusForDepth(d + 10));
  const dist = Math.hypot(horiz, d);
  const secs = dist / ASSUME.swim;
  const air = secs * (1 + d / 2 / 350); // drain rises with depth; average over the descent
  return { secs, air };
}

const fishAt = (d) => SPECIES.filter((s) => d >= s.minDepth && d <= s.maxDepth);
function catchStats(d, harpoon) {
  const opts = fishAt(d);
  let w = 0, value = 0, time = 0, bites = 0, dmg = 0;
  for (const s of opts) {
    const wt = s.weight ?? 1;
    const infected = s.large ? Math.min(1, 0.06 + 0.9 * Math.min(1, Math.max(0, (d - 30) / 420))) : 0;
    const price = s.large ? s.price * (1 + infected * 0.9) : s.price;
    const hp = s.large ? s.hp * (1 + infected * 0.35) : s.hp;
    const perShot = harpoon.pellets ? harpoon.damage * ASSUME.scatterPellets : harpoon.damage;
    const shots = Math.ceil(hp / perShot) / ASSUME.hitRate;
    const t = ASSUME.encounter + shots * (harpoon.reload + ASSUME.aimOverhead);
    const aggressive = s.aggressive || (s.large && infected > 0.5);
    w += wt;
    value += wt * price;
    time += wt * t;
    if (aggressive) {
      bites += wt * ASSUME.bitesPerAggressiveCatch;
      dmg += wt * ASSUME.bitesPerAggressiveCatch * (s.damage || 20);
    }
  }
  return { value: value / w, time: time / w, dmgPerCatch: dmg / w };
}

function simulate() {
  const st = { money: 0, air: 0, harpoon: 0, armor: 0, t: 0, dives: 0, deaths: 0, maxDepth: 0 };
  const firstAt = {};
  const buys = [];
  let divesSinceBuy = 0;
  while (st.t < 6 * 3600) {
    const tank = AIR[st.air].seconds;
    const armor = ARMOR[st.armor];
    const hp = HARPOON[st.harpoon];
    // Can we finish? Need the suit rating and enough air to reach 600 m one way.
    if (armor.rating >= ENDING_DEPTH && trip(ENDING_DEPTH).air < tank * 0.95) {
      st.t += trip(ENDING_DEPTH).secs;
      firstAt[600] = st.t;
      break;
    }
    // Pick the most profitable depth that air, the suit and expected damage allow.
    let best = null;
    for (let d = 10; d <= armor.rating - 8; d += 5) {
      const tr = trip(d);
      const vent = d >= 270 ? ASSUME.ventAir - ASSUME.ventSecs * (1 + d / 350) : 0;
      const huntAir = tank * (1 - ASSUME.airMargin) - 2 * tr.air + vent;
      if (huntAir <= 5) continue;
      const huntSecs = huntAir / (1 + d / 350);
      const cs = catchStats(d, hp);
      const catches = Math.floor(huntSecs / cs.time);
      const dmg = catches * cs.dmgPerCatch * (1 - armor.reduction);
      if (process.env.SIM_TABLE && armor.rating === 525 && d % 20 === 0 && d >= 360 && st.dives % 3 === 0) console.log(`   cand ${d} m: catches ${catches}, dmg ${dmg.toFixed(0)}, $/min ${((catches * cs.value) / ((2 * tr.secs + huntSecs + ASSUME.surfaceTime) / 60)).toFixed(0)}, hunt ${huntSecs.toFixed(0)}s, trip ${tr.secs.toFixed(0)}s`);
      if (dmg > ASSUME.maxDiveDamage) continue;
      const income = catches * cs.value;
      const rate = income / (2 * tr.secs + huntSecs + ASSUME.surfaceTime);
      if (!best || rate > best.rate) best = { d, rate, income, secs: 2 * tr.secs + huntSecs + ASSUME.surfaceTime, catches };
    }
    if (!best) throw new Error(`stuck: no viable depth (air ${st.air} armor ${st.armor})`);
    if (process.env.SIM_TRACE) console.log(`dive ${st.dives + 1}: ${best.d} m, ${best.catches} fish, $${Math.round(best.income)} (suit ${ARMOR[st.armor].rating} m, tank ${tank}s, ${HARPOON[st.harpoon].label})`);
    st.t += best.secs;
    st.money += best.income;
    st.dives++;
    divesSinceBuy++;
    st.maxDepth = Math.max(st.maxDepth, best.d);
    if (st.maxDepth >= 150) skiff = true;
    for (const z of [100, 200, 300, 400, 500]) if (best.d >= z && firstAt[z] === undefined) firstAt[z] = st.t;
    // Shop: suit first (it gates depth), then air if it limits the suit, then harpoon.
    let bought = true;
    while (bought) {
      bought = false;
      const na = ARMOR[st.armor + 1], nair = AIR[st.air + 1], nh = HARPOON[st.harpoon + 1];
      // Air is limiting if the tank can't give ~90 s of hunting at the suit's rated depth.
      const rd = Math.min(ARMOR[st.armor].rating, ENDING_DEPTH);
      const airLimits = nair && 2 * trip(rd).air + 90 * (1 + rd / 350) > AIR[st.air].seconds * (1 - ASSUME.airMargin);
      for (const [kind, item] of [['armor', na], ['air', airLimits ? nair : null], ['harpoon', nh]]) {
        if (item && st.money >= item.cost) {
          st.money -= item.cost;
          st[kind]++;
          buys.push({ kind, label: item.label, t: st.t, dives: divesSinceBuy });
          divesSinceBuy = 0;
          bought = true;
          break;
        }
      }
    }
  }
  return { st, firstAt, buys };
}

const r = simulate();
const mm = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;
console.log('Upgrades (time, dives since previous purchase):');
for (const b of r.buys) console.log(`  ${mm(b.t).padStart(7)}  ${b.kind.padEnd(8)} ${b.label.padEnd(24)} after ${b.dives} dive(s)`);
console.log('\nFirst reached:');
for (const [z, t] of Object.entries(r.firstAt)) console.log(`  ${String(z).padStart(3)} m  at ${mm(t)}`);
console.log(`\nTotal: ${mm(r.st.t)} over ${r.st.dives} dives; longest gap between purchases: ${Math.max(...r.buys.map((b) => b.dives))} dives`);
