// Achievements: unlocked by game events, stored in the save (so they travel with save codes and cloud saves).

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  /** Hidden until unlocked: name and description show as ??? */
  secret?: boolean;
  /** Counted towards progress shown on the card, e.g. 37/50 fish. */
  goal?: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_catch', name: 'First Bite', desc: 'Spear your first fish.', icon: '🐟' },
  { id: 'catch_50', name: 'Regular', desc: 'Catch 50 fish.', icon: '🎣', goal: 50 },
  { id: 'catch_200', name: 'Lake Legend', desc: 'Catch 200 fish.', icon: '🏆', goal: 200 },
  { id: 'journal_all', name: 'Field Naturalist', desc: 'Log every species in the field journal.', icon: '📖', goal: 15 },
  { id: 'big_game', name: 'Big Game', desc: 'Land one of the lake\'s giants.', icon: '🐋' },
  { id: 'rotten_trophy', name: 'Rotten Trophy', desc: 'Land an infected giant.', icon: '🦠' },
  { id: 'cathedral', name: 'Cathedral', desc: 'Land a Cathedral Sturgeon.', icon: '⛪', secret: true },
  { id: 'depth_100', name: 'Green Twilight', desc: 'Dive to 100 m.', icon: '🌊' },
  { id: 'depth_250', name: 'Weeping Depths', desc: 'Dive to 250 m.', icon: '🌑' },
  { id: 'depth_400', name: 'The Rot', desc: 'Dive to 400 m.', icon: '🩸' },
  { id: 'depth_550', name: 'Bottom-Steps', desc: 'Dive to 550 m.', icon: '🏛', secret: true },
  { id: 'ending', name: 'ANTOPLASM', desc: 'Reach the bottom of Morrow Lake.', icon: '👁', secret: true },
  { id: 'no_deaths', name: 'Nobody Drowned', desc: 'Reach the bottom without dying once.', icon: '🫧', secret: true },
  { id: 'speedrun', name: 'Riptide', desc: 'Reach the bottom in under 40 minutes of dive time.', icon: '⏱', secret: true },
  { id: 'earn_10k', name: 'Market Day', desc: 'Earn $10,000 in total.', icon: '💰', goal: 10000 },
  { id: 'scattergun', name: 'Overkill', desc: 'Buy the Antoplasm Scattergun.', icon: '💥' },
  { id: 'fully_kitted', name: 'Fully Kitted', desc: 'Max out air, harpoon and armour.', icon: '🛡' },
  { id: 'skiff', name: 'Room Service', desc: "Call Teodor's skiff out to you.", icon: '🚤' },
  { id: 'vent', name: 'Iron Breath', desc: 'Breathe from a hydrothermal vent.', icon: '♨' },
  { id: 'bandage', name: 'Field Medic', desc: 'Patch yourself up underwater.', icon: '✚' },
  { id: 'close_call', name: 'Close Call', desc: 'Surface with less than 5% air left.', icon: '😮‍💨' },
  { id: 'die_drown', name: 'Lungful', desc: 'Drown.', icon: '💧' },
  { id: 'die_pressure', name: 'Crumpled', desc: 'Let the pressure crush your suit.', icon: '🥫' },
  { id: 'die_eaten', name: 'Food Chain', desc: 'Get eaten.', icon: '🦷' },
  { id: 'all_scares', name: 'Something Below', desc: 'Witness everything the lake has to show you.', icon: '🕯', secret: true, goal: 5 },
  // Online
  { id: 'signed_in', name: 'Signed the Logbook', desc: 'Sign in to keep your dives in the cloud.', icon: '✍' },
  { id: 'friend', name: 'Dive Buddy', desc: 'Add a friend.', icon: '🤝' },
  { id: 'coop_dive', name: 'Shared Waters', desc: 'Dive with another player in a co-op room.', icon: '👥' },
  { id: 'coop_catch', name: 'Assist', desc: 'Land a fish another diver already hit.', icon: '🎯' },
  { id: 'coop_full', name: 'Expedition', desc: 'Dive in a full room of four.', icon: '🧭', secret: true },
];

export class Achievements {
  constructor(
    private store: { achievements: string[] },
    private onUnlock: (a: Achievement) => void,
  ) {}

  has(id: string) {
    return this.store.achievements.includes(id);
  }

  unlock(id: string) {
    if (this.has(id)) return false;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return false;
    this.store.achievements.push(id);
    this.onUnlock(a);
    return true;
  }

  /** Swap in a different save object (after loading a cloud save). */
  rebind(store: { achievements: string[] }) {
    this.store = store;
  }

  get count() {
    return this.store.achievements.filter((id) => ACHIEVEMENTS.some((a) => a.id === id)).length;
  }
}

/** Card grid for the achievements screen. progress(id) returns the current count for goal-based ones. */
export function renderAchievements(el: HTMLElement, unlocked: string[], progress: (id: string) => number) {
  el.innerHTML = ACHIEVEMENTS.map((a) => {
    const got = unlocked.includes(a.id);
    const hidden = a.secret && !got;
    const p = a.goal && !got ? Math.min(a.goal, progress(a.id)) : 0;
    const bar = a.goal && !got && !hidden ? `<div class="ach-bar"><i style="width:${(p / a.goal) * 100}%"></i></div><small>${p.toLocaleString()} / ${a.goal.toLocaleString()}</small>` : '';
    return `<li class="ach-card ${got ? 'got' : ''}">
      <span class="ach-icon">${hidden ? '?' : a.icon}</span>
      <div><b>${hidden ? '???' : a.name}</b><span>${hidden ? 'A secret.' : a.desc}</span>${bar}</div>
    </li>`;
  }).join('');
}
