// Co-op rooms over Supabase Realtime (private channels: signed-in players only).
//
// Everyone sends their own diver state ~8×/s. One player is the host: their game runs the fish AI
// for all divers and streams compact fish snapshots ~5×/s; everyone else renders those fish as
// puppets, sends their spear hits to the host, and receives bites aimed at them. The host is the
// longest-present player whose game is live, so if the host pauses, backgrounds the tab or leaves,
// the next player takes over within ~2.5 s and the lake carries on.
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Species } from './config';
import { sb } from './online';

export const ROOM_MAX = 4;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRoomCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanRoomCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

/** What each diver broadcasts about themselves. */
/** hidden: not in the water (paused, shop, dead) so fish ignore them; live: their game is running and
 * the tab is visible, so they can host the fish even while browsing the shop. */
export interface DiverState { x: number; y: number; z: number; yaw: number; pitch: number; hidden: boolean; live: boolean; hp: number; tier: number }
export interface Peer { id: string; name: string; color: number; joinedAt: number; lastSeen: number; state?: DiverState }
export interface FishSpawn { k: string; sp: Species; seed: number; p: [number, number, number] }

export interface CoopHooks {
  /** Peers joined/left or the host changed. */
  peersChanged(peers: Peer[], hostId: string | null): void;
  /** Our host status flipped. */
  hostChanged(isHost: boolean): void;
  peerState(id: string, s: DiverState): void;
  fishSnapshot(rows: (string | number)[][]): void;
  fishSpawn(list: FishSpawn[]): void;
  /** Host only: a player asked for the full description of fish they can't build yet. */
  fishNeed(keys: string[]): void;
  /** Host only: another player's spear hit these fish. */
  fishHit(hits: [string, number][], by: string): void;
  /** A fish was killed (by anyone). */
  fishKill(k: string, by: string, sp: Species, assist: boolean): void;
  /** Host says a fish bit us. */
  bitten(dmg: number): void;
  /** Host says an attack on us is winding up. */
  cue(kind: string, k: string): void;
  /** Another diver fired. */
  shot(id: string, o: number[], d: number[], tier: number): void;
  /** Room-level problems: full, connection lost. */
  problem(msg: string): void;
}

const COLORS = [0xffb347, 0x6fd3ff, 0xb98cff, 0x7dff9a, 0xff7da8, 0xfff27d];

export class Coop {
  code = '';
  peers = new Map<string, Peer>();
  hostId: string | null = null;
  private ch: RealtimeChannel | null = null;
  private joinedAt = 0;
  /** Host flag last reported to the game (null = not reported since joining). */
  private reportedHost: boolean | null = null;
  private hostTimer: ReturnType<typeof setInterval> | null = null;
  /** Is our own game live (playing, not paused/backgrounded)? Set by the game. */
  live = false;

  constructor(private me: () => { id: string; name: string }, private hooks: CoopHooks) {}

  get active() { return !!this.ch; }
  get isHost() { return !!this.ch && this.hostId === this.me().id; }
  /** Divers other than us. */
  get others() { return [...this.peers.values()].filter((p) => p.id !== this.me().id); }

  join(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!sb) return Promise.resolve({ ok: false, error: 'Online play is not set up on this build.' });
    this.leave();
    const { id, name } = this.me();
    this.code = cleanRoomCode(code);
    this.joinedAt = Date.now();
    this.reportedHost = null;
    const ch = sb.channel(`room:${this.code}`, { config: { private: true, broadcast: { self: false, ack: false }, presence: { key: id } } });
    this.ch = ch;

    ch.on('presence', { event: 'sync' }, () => this.syncPresence());
    const on = <T>(event: string, fn: (p: T) => void) => ch.on('broadcast', { event }, ({ payload }) => fn(payload as T));
    on<{ id: string; s: DiverState }>('p', ({ id: who, s }) => {
      const peer = this.peers.get(who);
      if (peer) {
        peer.lastSeen = Date.now();
        peer.state = s;
      }
      this.hooks.peerState(who, s);
    });
    on<{ rows: (string | number)[][] }>('fs', ({ rows }) => !this.isHost && this.hooks.fishSnapshot(rows));
    on<{ list: FishSpawn[] }>('spawn', ({ list }) => !this.isHost && this.hooks.fishSpawn(list));
    on<{ keys: string[] }>('need', ({ keys }) => this.isHost && this.hooks.fishNeed(keys));
    on<{ hits: [string, number][]; by: string }>('hit', ({ hits, by }) => this.isHost && this.hooks.fishHit(hits, by));
    on<{ k: string; by: string; sp: Species; assist: boolean }>('kill', ({ k, by, sp, assist }) => this.hooks.fishKill(k, by, sp, assist));
    on<{ to: string; dmg: number }>('bite', ({ to, dmg }) => to === this.me().id && this.hooks.bitten(dmg));
    on<{ to: string; kind: string; k: string }>('cue', ({ to, kind, k }) => to === this.me().id && this.hooks.cue(kind, k));
    on<{ id: string; o: number[]; d: number[]; tier: number }>('shot', ({ id: who, o, d, tier }) => this.hooks.shot(who, o, d, tier));

    return new Promise((resolve) => {
      let settled = false;
      const done = (r: { ok: true } | { ok: false; error: string }) => {
        if (settled) return;
        settled = true;
        if (!r.ok) this.leave();
        resolve(r);
      };
      ch.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          // Presence arrives just after subscribing; give it a moment before judging the room full.
          await new Promise((r) => setTimeout(r, 600));
          if (this.ch !== ch) return;
          const there = Object.keys(ch.presenceState()).filter((k) => k !== id).length;
          if (there >= ROOM_MAX) return done({ ok: false, error: `Room ${this.code} is full (${ROOM_MAX} divers).` });
          await ch.track({ name, joinedAt: this.joinedAt });
          this.hostTimer = setInterval(() => this.electHost(), 500);
          this.electHost();
          done({ ok: true });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!settled) done({ ok: false, error: `Couldn't reach the room (${err?.message ?? status}).` });
          else this.hooks.problem('Connection to the room was lost. Reconnecting…');
        }
      });
    });
  }

  leave() {
    if (this.hostTimer) clearInterval(this.hostTimer);
    this.hostTimer = null;
    if (this.ch) {
      const ch = this.ch;
      this.ch = null;
      void ch.untrack().catch(() => {});
      void sb?.removeChannel(ch);
    }
    this.peers.clear();
    this.hostId = null;
    this.code = '';
    this.reportedHost = null;
    this.hooks.peersChanged([], null);
  }

  send(event: string, payload: object) {
    void this.ch?.send({ type: 'broadcast', event, payload });
  }

  private syncPresence() {
    if (!this.ch) return;
    const state = this.ch.presenceState<{ name: string; joinedAt: number }>();
    const ids = Object.keys(state).sort((a, b) => (state[a][0]?.joinedAt ?? 0) - (state[b][0]?.joinedAt ?? 0) || a.localeCompare(b));
    for (const id of [...this.peers.keys()]) if (!state[id]) this.peers.delete(id);
    ids.forEach((id) => {
      const meta = state[id][0];
      const existing = this.peers.get(id);
      if (existing) existing.name = meta.name;
      else this.peers.set(id, { id, name: meta.name, joinedAt: meta.joinedAt, lastSeen: Date.now(), color: 0 });
    });
    // Colours by join order, so everyone sees the same diver in the same colour.
    [...this.peers.values()].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)).forEach((p, i) => (p.color = COLORS[i % COLORS.length]));
    this.electHost();
    this.hooks.peersChanged([...this.peers.values()], this.hostId);
  }

  /** Everyone runs the same rule on the same data, so they agree without talking about it. */
  private electHost() {
    if (!this.ch) return;
    const me = this.me().id;
    const now = Date.now();
    const candidates = [...this.peers.values()].filter((p) => (p.id === me ? this.live : now - p.lastSeen < 2500 && p.state?.live !== false));
    candidates.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
    // Nobody live (everyone paused): keep the current host rather than flapping.
    const next = candidates[0]?.id ?? this.hostId;
    const changed = next !== this.hostId;
    this.hostId = next;
    if (changed) this.hooks.peersChanged([...this.peers.values()], this.hostId);
    // Report our role on the first election after joining too, not only on changes.
    const isHost = next === me;
    if (isHost !== this.reportedHost) {
      this.reportedHost = isHost;
      this.hooks.hostChanged(isHost);
    }
  }
}

// ---------- Lobby: who's online, and in which room ----------
export interface OnlineUser { id: string; name: string; room: string }

export class Lobby {
  online = new Map<string, OnlineUser>();
  private ch: RealtimeChannel | null = null;
  private meta = { name: '', room: '' };

  constructor(private onChange: () => void) {}

  start(id: string, name: string, room = '') {
    if (!sb || this.ch) return;
    this.meta = { name, room };
    const ch = sb.channel('lobby', { config: { private: true, presence: { key: id } } });
    this.ch = ch;
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState<{ name: string; room: string }>();
      this.online = new Map(Object.entries(st).map(([uid, metas]) => [uid, { id: uid, name: metas[0]?.name ?? '', room: metas[0]?.room ?? '' }]));
      this.onChange();
    });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track(this.meta);
    });
  }

  /** Update our name/room for friends to see. */
  set(name: string, room: string) {
    if (name === this.meta.name && room === this.meta.room) return;
    this.meta = { name, room };
    void this.ch?.track(this.meta);
  }

  stop() {
    if (this.ch) void sb?.removeChannel(this.ch);
    this.ch = null;
    this.online.clear();
    this.onChange();
  }
}
