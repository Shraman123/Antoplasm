// The player's lifetime record. Unlike the save (one run, wiped at the ending), this survives every
// "Dive again": achievements and best-ever stats, which is what leaderboards rank.

export interface Profile {
  achievements: string[];
  endings: number;
  /** Fastest run to the bottom, in seconds of dive time. */
  bestEnding: number | null;
  deepest: number;
  totalCaught: number;
  totalEarned: number;
  /** ms since epoch of the last change, for merging with the cloud copy. */
  updatedAt: number;
}

const KEY = 'morrow-lake-profile-v1';
export const freshProfile = (): Profile => ({ achievements: [], endings: 0, bestEnding: null, deepest: 0, totalCaught: 0, totalEarned: 0, updatedAt: 0 });

export function sanitizeProfile(raw: unknown): Profile {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    achievements: Array.isArray(p.achievements) ? [...new Set(p.achievements.filter((x): x is string => typeof x === 'string'))] : [],
    endings: num(p.endings),
    bestEnding: typeof p.bestEnding === 'number' && p.bestEnding > 0 ? p.bestEnding : null,
    deepest: num(p.deepest),
    totalCaught: num(p.totalCaught),
    totalEarned: num(p.totalEarned),
    updatedAt: num(p.updatedAt),
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeProfile(JSON.parse(raw));
  } catch { /* storage unavailable */ }
  return freshProfile();
}

export function storeProfile(p: Profile) {
  p.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

/** Union of two records: nothing anyone earned is ever lost by syncing. */
export function mergeProfiles(a: Profile, b: Profile): Profile {
  const best = [a.bestEnding, b.bestEnding].filter((x): x is number => x !== null);
  return {
    achievements: [...new Set([...a.achievements, ...b.achievements])],
    endings: Math.max(a.endings, b.endings),
    bestEnding: best.length ? Math.min(...best) : null,
    deepest: Math.max(a.deepest, b.deepest),
    totalCaught: Math.max(a.totalCaught, b.totalCaught),
    totalEarned: Math.max(a.totalEarned, b.totalEarned),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}
