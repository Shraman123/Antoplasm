// Accounts + cloud saves on Supabase. Everything here is optional: with no VITE_SUPABASE_* env the
// game is exactly the offline game, and guests can always play without signing in.
//
// Sync model: the lifetime record (achievements, bests) always merges, so it can never lose anything.
// The run save is versioned (rev). Each device remembers the last rev it synced and whether it has
// played since (dirty). On sign-in / push:
//   cloud rev == ours            -> ours wins (we're a descendant of the cloud copy)
//   cloud rev != ours, not dirty -> the cloud wins silently (another device played on)
//   cloud rev != ours, dirty     -> both devices played: ask the player which run to keep
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from './profile';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const sb: SupabaseClient | null = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }) : null;
/** Email+password sign-in for local QA only; production uses Google. */
export const DEV_LOGIN = !!sb && (import.meta.env.DEV || import.meta.env.VITE_DEV_LOGIN === '1');

export interface Me { id: string; display_name: string; friend_code: string }
export type RunSave = Record<string, unknown>;
export interface SyncHooks {
  getSave(): RunSave;
  getRecord(): Profile;
  /** Replace the local lifetime record with this merged one. */
  applyRecord(r: Profile): void;
  /** Replace the local run with the cloud one. */
  applySave(s: RunSave): void;
  /** Both devices played since they last agreed. Resolve with the run to keep. */
  chooseRun(local: RunSave, cloud: RunSave): Promise<'local' | 'cloud'>;
  /** Account state changed (signed in/out, renamed, sync status). */
  changed(): void;
}

const META_KEY = 'morrow-lake-sync-v1';
interface SyncMeta { user: string; rev: number; dirty: boolean }
const readMeta = (): SyncMeta | null => {
  try { return JSON.parse(localStorage.getItem(META_KEY) ?? 'null'); } catch { return null; }
};
const writeMeta = (m: SyncMeta | null) => {
  try { m ? localStorage.setItem(META_KEY, JSON.stringify(m)) : localStorage.removeItem(META_KEY); } catch { /* ignore */ }
};

/** A run with nothing in it yet: safe to replace without asking. */
export const isFreshRun = (s: RunSave) => !s || (!(Number(s.playTime) > 5) && !(Number(s.caught) > 0) && !(Number(s.money) > 0));

export class Account {
  me: Me | null = null;
  status: 'offline' | 'signed-out' | 'syncing' | 'synced' | 'error' = sb ? 'signed-out' : 'offline';
  lastError = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pushing: Promise<void> | null = null;
  private session: Session | null = null;

  constructor(private hooks: SyncHooks) {}

  get enabled() { return !!sb; }
  get signedIn() { return !!this.me; }
  get userId() { return this.session?.user.id ?? null; }
  get accessToken() { return this.session?.access_token ?? null; }

  async init() {
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    this.session = data.session;
    if (data.session) await this.adopt();
    sb.auth.onAuthStateChange((event, session) => {
      this.session = session;
      if (event === 'SIGNED_IN' && session && this.me?.id !== session.user.id) void this.adopt();
      if (event === 'SIGNED_OUT') {
        this.me = null;
        this.status = 'signed-out';
        this.hooks.changed();
      }
    });
  }

  async signInGoogle() {
    if (!sb) return;
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) this.fail(error.message);
  }

  /** QA/dev only: create-or-sign-in with email + password. */
  async signInDev(email: string, password: string, name?: string) {
    if (!sb) return;
    let { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) ({ error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name ?? email.split('@')[0] } } }));
    if (error) this.fail(error.message);
  }

  async signOut() {
    if (!sb) return;
    await this.flush();
    await sb.auth.signOut();
    writeMeta(null);
    this.me = null;
    this.status = 'signed-out';
    this.hooks.changed();
  }

  async rename(name: string) {
    if (!sb || !this.me) return;
    const { data, error } = await sb.rpc('set_display_name', { p_name: name });
    if (error) return this.fail(error.message);
    this.me.display_name = data as string;
    this.hooks.changed();
  }

  /** Mark the local run as changed and push it a few seconds later (coalesces bursts of saves). */
  touch() {
    if (!this.me) return;
    const m = readMeta();
    if (m && m.user === this.me.id && !m.dirty) writeMeta({ ...m, dirty: true });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.push(), 4000);
  }

  /** Push now (e.g. leaving the page, opening the shop, reaching the ending). */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      await this.push();
    } else if (this.pushing) await this.pushing;
  }

  private fail(msg: string) {
    this.lastError = msg;
    this.status = 'error';
    this.hooks.changed();
  }

  /** Signed in: load the cloud copy and reconcile it with this device. */
  private async adopt() {
    if (!sb) return;
    this.status = 'syncing';
    this.hooks.changed();
    const { data, error } = await sb.rpc('get_me');
    if (error || !data) return this.fail(error?.message ?? 'Could not load your account');
    const cloud = data as Me & { save: RunSave; record: Profile; rev: number };
    this.me = { id: cloud.id, display_name: cloud.display_name, friend_code: cloud.friend_code };
    const meta = readMeta();
    const local = this.hooks.getSave();
    const known = meta && meta.user === cloud.id ? meta : null;
    const cloudEmpty = !cloud.save || !Object.keys(cloud.save).length;

    let keep: 'local' | 'cloud';
    if (cloudEmpty) keep = 'local';
    else if (known && known.rev === cloud.rev) keep = 'local';
    else if (known && !known.dirty) keep = 'cloud';
    else if (isFreshRun(local)) keep = 'cloud';
    else if (isFreshRun(cloud.save)) keep = 'local';
    else keep = await this.hooks.chooseRun(local, cloud.save);

    if (keep === 'cloud') this.hooks.applySave(cloud.save);
    writeMeta({ user: cloud.id, rev: cloud.rev, dirty: false });
    // Always push once: merges the record both ways and writes the run we kept.
    await this.push(keep === 'local');
  }

  private push(force = false): Promise<void> {
    if (!sb || !this.me) return Promise.resolve();
    if (this.pushing) return this.pushing.then(() => this.push(force));
    this.timer = null;
    const run = async () => {
      const me = this.me!;
      const meta = readMeta();
      this.status = 'syncing';
      this.hooks.changed();
      const { data, error } = await sb!.rpc('sync_player', {
        p_save: this.hooks.getSave(),
        p_record: this.hooks.getRecord(),
        p_base_rev: meta?.user === me.id ? meta.rev : null,
        p_force: force,
      });
      if (error) return this.fail(error.message);
      const r = data as { status: 'ok' | 'conflict'; record: Profile; rev: number; save?: RunSave };
      this.hooks.applyRecord(r.record);
      if (r.status === 'conflict') {
        // Another device wrote a run since we last agreed with the cloud.
        const local = this.hooks.getSave();
        const keep = meta?.dirty || !isFreshRun(local) ? await this.hooks.chooseRun(local, r.save!) : 'cloud';
        writeMeta({ user: me.id, rev: r.rev, dirty: false });
        if (keep === 'cloud') {
          this.hooks.applySave(r.save!);
          this.status = 'synced';
          this.hooks.changed();
          return;
        }
        this.pushing = null;
        return this.push(true);
      }
      writeMeta({ user: me.id, rev: r.rev, dirty: false });
      this.status = 'synced';
      this.lastError = '';
      this.hooks.changed();
    };
    this.pushing = run().finally(() => (this.pushing = null));
    return this.pushing;
  }
}

// ---------- Friends + leaderboards ----------
export type Metric = 'deepest' | 'best_ending' | 'total_caught' | 'total_earned' | 'achievements';
export interface BoardRow { rank: number; user_id: string; display_name: string; value: number; is_me: boolean }
export interface Friend { id: string; display_name: string; deepest: number; best_ending: number | null; total_caught: number; achievements: number }

export async function leaderboard(metric: Metric, scope: 'global' | 'friends'): Promise<BoardRow[]> {
  if (!sb) return [];
  const { data, error } = await sb.rpc('leaderboard', { p_metric: metric, p_scope: scope, p_limit: 50 });
  if (error) throw new Error(error.message);
  return data as BoardRow[];
}

export async function listFriends(): Promise<Friend[]> {
  if (!sb) return [];
  const { data, error } = await sb.rpc('list_friends');
  if (error) throw new Error(error.message);
  return data as Friend[];
}

export async function addFriend(code: string): Promise<{ id: string; display_name: string }> {
  const { data, error } = await sb!.rpc('add_friend', { p_code: code });
  if (error) throw new Error(error.message);
  return data as { id: string; display_name: string };
}

export async function removeFriend(id: string) {
  const { error } = await sb!.rpc('remove_friend', { p_id: id });
  if (error) throw new Error(error.message);
}
