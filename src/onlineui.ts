// The Online screen (account, leaderboards, friends, co-op), the save-conflict chooser and the
// co-op HUD line. Pure UI: all state lives in Account / Coop / Lobby.
import { cleanRoomCode, newRoomCode, ROOM_MAX, type Coop, type Lobby } from './coop';
import { addFriend, DEV_LOGIN, leaderboard, listFriends, removeFriend, type Account, type Friend, type Metric, type RunSave } from './online';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${Math.floor(sec % 60).toString().padStart(2, '0')}s`;
};
const fmt: Record<Metric, (v: number) => string> = {
  deepest: (v) => `${Math.round(v)} m`,
  best_ending: fmtTime,
  total_caught: (v) => `${v.toLocaleString()} fish`,
  total_earned: (v) => `$${v.toLocaleString()}`,
  achievements: (v) => `${v} 🏆`,
};

export interface OnlineDeps {
  account: Account;
  coop: Coop;
  lobby: Lobby;
  mode(): string;
  /** Enter the water (from the title) or resume (from pause). */
  dive(): void;
  toast(html: string): void;
  unlock(id: string): void;
}

export class OnlineUI {
  private tab = 'account';
  private metric: Metric = 'deepest';
  private scope: 'global' | 'friends' = 'global';
  private friends: Friend[] = [];
  private returnTo: 'title' | 'pause' = 'title';

  constructor(private d: OnlineDeps) {
    if (!d.account.enabled) return;
    $('btn-online-title').classList.remove('hidden');
    $('btn-online-pause').classList.remove('hidden');
    if (DEV_LOGIN) $('dev-login').classList.remove('hidden');
    $('btn-online-title').onclick = () => this.open('title');
    $('btn-online-pause').onclick = () => this.open('pause');
    $('btn-online-back').onclick = () => this.close();
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => (b.onclick = () => this.show(b.dataset.tab!)));

    // Account
    $('btn-google').onclick = () => void d.account.signInGoogle();
    $('dev-login').onsubmit = (e) => {
      e.preventDefault();
      void d.account.signInDev($<HTMLInputElement>('dev-email').value.trim(), $<HTMLInputElement>('dev-pass').value, $<HTMLInputElement>('dev-name').value.trim() || undefined);
    };
    $('btn-rename').onclick = () => void d.account.rename($<HTMLInputElement>('acct-name').value);
    $('btn-copy-code').onclick = () => this.copy(d.account.me?.friend_code ?? '', 'Friend code copied');
    $('btn-signout').onclick = () => {
      d.coop.leave();
      d.lobby.stop();
      void d.account.signOut();
    };

    // Leaderboards
    document.querySelectorAll<HTMLButtonElement>('#board-metrics button').forEach((b) => (b.onclick = () => {
      this.metric = b.dataset.m as Metric;
      this.chip('#board-metrics', b);
      void this.loadBoard();
    }));
    document.querySelectorAll<HTMLButtonElement>('#board-scope button').forEach((b) => (b.onclick = () => {
      this.scope = b.dataset.s as 'global' | 'friends';
      this.chip('#board-scope', b);
      void this.loadBoard();
    }));

    // Friends
    $('friend-add').onsubmit = async (e) => {
      e.preventDefault();
      const input = $<HTMLInputElement>('friend-code-in');
      try {
        const f = await addFriend(input.value);
        input.value = '';
        this.msg('friend-msg', `${esc(f.display_name)} is now your friend.`, 'ok');
        d.unlock('friend');
        await this.loadFriends();
      } catch (err) {
        this.msg('friend-msg', esc((err as Error).message), 'err');
      }
    };

    // Co-op
    $('btn-room-create').onclick = () => void this.joinRoom(newRoomCode());
    $('room-join').onsubmit = (e) => {
      e.preventDefault();
      void this.joinRoom($<HTMLInputElement>('room-code-in').value);
    };
    $('btn-room-leave').onclick = () => {
      d.coop.leave();
      this.afterRoomChange();
    };
    $('btn-room-invite').onclick = () => this.copy(`${location.origin}${location.pathname}?room=${d.coop.code}`, 'Invite link copied');
    $('btn-room-dive').onclick = () => {
      this.close(true);
      d.dive();
    };

    // Conflict chooser buttons are wired per prompt.
    this.render();
  }

  /** Called when the account/coop/lobby state changes. */
  render() {
    const a = this.d.account;
    if (!a.enabled) return;
    const me = a.me;
    $('acct-out').classList.toggle('hidden', !!me);
    $('acct-in').classList.toggle('hidden', !me);
    const inPause = this.returnTo === 'pause';
    $('btn-google').classList.toggle('hidden', inPause);
    $('dev-login').classList.toggle('hidden', inPause || !DEV_LOGIN);
    $('acct-pause-note').classList.toggle('hidden', !inPause);
    if (me) {
      const nameIn = $<HTMLInputElement>('acct-name');
      if (document.activeElement !== nameIn) nameIn.value = me.display_name;
      $('acct-code').textContent = me.friend_code;
    }
    $('acct-error').textContent = a.status === 'error' ? a.lastError : '';
    $('sync-status').textContent = { offline: '', 'signed-out': 'Guest', syncing: 'Syncing…', synced: 'Saved to cloud ✓', error: 'Sync problem' }[a.status];
    const line = $('account-line');
    line.classList.toggle('hidden', !me);
    if (me) line.innerHTML = `Signed in as <b>${esc(me.display_name)}</b>${this.d.coop.active ? ` · in room <b>${this.d.coop.code}</b>` : ''}`;
    // Signed-out players can still see the tabs, with a nudge.
    for (const t of ['boards', 'friends', 'coop']) $(`tab-${t}`).classList.toggle('locked', !me);
    this.renderRoom();
    if (this.tab === 'friends') this.renderFriends();
  }

  open(from: 'title' | 'pause', tab?: string) {
    this.returnTo = from;
    $('pause').classList.add('hidden');
    $('online').classList.remove('hidden');
    this.render();
    this.show(tab ?? this.tab);
  }

  close(toGame = false) {
    $('online').classList.add('hidden');
    if (!toGame && this.returnTo === 'pause' && this.d.mode() === 'paused') $('pause').classList.remove('hidden');
  }

  show(tab: string) {
    this.tab = tab;
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    for (const t of ['account', 'boards', 'friends', 'coop']) $(`tab-${t}`).classList.toggle('hidden', t !== tab);
    const me = this.d.account.me;
    if (!me && tab !== 'account') {
      $(`tab-${tab}`).classList.remove('hidden');
      this.signInNudge(tab);
      return;
    }
    if (tab === 'boards') void this.loadBoard();
    if (tab === 'friends') void this.loadFriends();
    if (tab === 'coop') this.renderRoom();
  }

  private signInNudge(tab: string) {
    const what = { boards: 'see the leaderboards', friends: 'add friends', coop: 'dive with friends' }[tab];
    const target = tab === 'boards' ? $('board') : tab === 'friends' ? $('friends') : $('coop-msg');
    target.innerHTML = `<li class="empty">Sign in on the Account tab to ${what}.</li>`;
  }

  async loadBoard() {
    const ol = $('board');
    ol.innerHTML = '<li class="empty">Loading…</li>';
    try {
      const rows = await leaderboard(this.metric, this.scope);
      if (!rows.length) {
        ol.innerHTML = `<li class="empty">${this.scope === 'friends' ? 'No scores from you or your friends yet.' : 'No scores yet. Be the first!'}</li>`;
        return;
      }
      ol.innerHTML = rows.map((r, i) => {
        const gap = i > 0 && r.rank > rows[i - 1].rank + 1 ? '<li class="gap">⋯</li>' : '';
        const medal = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}`;
        return `${gap}<li class="${r.is_me ? 'me' : ''}"><span class="rank">${medal}</span><span class="who">${esc(r.display_name)}${r.is_me ? ' (you)' : ''}</span><span class="val">${fmt[this.metric](r.value)}</span></li>`;
      }).join('');
    } catch (err) {
      ol.innerHTML = `<li class="empty">Couldn't load: ${esc((err as Error).message)}</li>`;
    }
  }

  async loadFriends() {
    try {
      this.friends = await listFriends();
    } catch (err) {
      this.msg('friend-msg', esc((err as Error).message), 'err');
    }
    this.renderFriends();
  }

  private renderFriends() {
    const ul = $('friends');
    if (!this.d.account.me) return;
    if (!this.friends.length) {
      ul.innerHTML = '<li class="empty">No friends yet. Swap friend codes (Account tab) to add each other.</li>';
      return;
    }
    const online = this.d.lobby.online;
    // Online friends first, then by name.
    const sorted = [...this.friends].sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.display_name.localeCompare(b.display_name));
    ul.innerHTML = sorted.map((f) => {
      const o = online.get(f.id);
      const room = o?.room && o.room !== this.d.coop.code ? `<button class="ghost small" data-join="${esc(o.room)}">Join ${esc(o.room)}</button>` : o?.room ? '<small>in your room</small>' : '';
      return `<li><span class="dot ${o ? 'on' : ''}" title="${o ? 'online' : 'offline'}"></span>
        <span class="who"><b>${esc(f.display_name)}</b><small>${Math.round(f.deepest)} m deepest · ${f.total_caught} fish · ${f.achievements} 🏆${f.best_ending ? ` · bottom in ${fmtTime(f.best_ending)}` : ''}</small></span>
        ${room}<button class="ghost small x" data-remove="${f.id}" aria-label="Remove ${esc(f.display_name)}">✕</button></li>`;
    }).join('');
    ul.querySelectorAll<HTMLButtonElement>('[data-join]').forEach((b) => (b.onclick = () => {
      this.show('coop');
      void this.joinRoom(b.dataset.join!);
    }));
    ul.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((b) => (b.onclick = async () => {
      if (b.dataset.confirm !== '1') {
        b.dataset.confirm = '1';
        b.textContent = 'Remove?';
        return;
      }
      await removeFriend(b.dataset.remove!).catch(() => {});
      await this.loadFriends();
    }));
  }

  async joinRoom(code: string) {
    const c = cleanRoomCode(code);
    if (c.length !== 6) return this.msg('coop-msg', 'Room codes are 6 letters/numbers.', 'err');
    if (!this.d.account.me) return this.msg('coop-msg', 'Sign in first (Account tab).', 'err');
    this.msg('coop-msg', `Joining ${c}…`, '');
    const r = await this.d.coop.join(c);
    if (!r.ok) return this.msg('coop-msg', esc(r.error), 'err');
    this.msg('coop-msg', '', '');
    this.afterRoomChange();
  }

  private afterRoomChange() {
    const me = this.d.account.me;
    if (me) this.d.lobby.set(me.display_name, this.d.coop.code);
    this.render();
  }

  renderRoom() {
    const c = this.d.coop;
    $('coop-out').classList.toggle('hidden', c.active);
    $('coop-in').classList.toggle('hidden', !c.active);
    if (!c.active) return;
    $('room-code').textContent = c.code;
    const me = this.d.account.me?.id;
    const peers = [...c.peers.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    $('room-members').innerHTML = peers.map((p) => `<li><span class="dot on" style="background:#${p.color.toString(16).padStart(6, '0')}"></span>
      <span class="who"><b>${esc(p.name)}${p.id === me ? ' (you)' : ''}</b><small>${p.id === c.hostId ? 'running the fish · ' : ''}${p.state && !p.state.hidden ? `${Math.round(Math.max(0, -p.state.y))} m` : p.id === me ? '' : 'on the boat'}</small></span></li>`).join('')
      + (peers.length < ROOM_MAX ? `<li class="empty">${ROOM_MAX - peers.length} more can join with code ${c.code}</li>` : '');
    $('btn-room-dive').textContent = this.d.mode() === 'paused' ? 'Back to the water' : 'Dive in';
  }

  /** The small in-game line: room code and where everyone is. */
  hud(myDepth: number) {
    const el = $('coop-hud');
    const c = this.d.coop;
    el.classList.toggle('hidden', !c.active);
    if (!c.active) return;
    const me = this.d.account.me?.id;
    const rows = [...c.peers.values()].filter((p) => p.id !== me).map((p) => {
      const d = p.state ? Math.round(Math.max(0, -p.state.y)) : 0;
      const where = !p.state || p.state.hidden ? 'on the boat' : `${d} m`;
      const diff = p.state && !p.state.hidden ? d - Math.round(myDepth) : 0;
      return `<span style="color:#${p.color.toString(16).padStart(6, '0')}">● ${esc(p.name)}</span> ${where}${diff ? ` <small>(${diff > 0 ? '↓' : '↑'}${Math.abs(diff)})</small>` : ''}`;
    });
    el.innerHTML = `<b>Room ${c.code}</b>${rows.length ? ' · ' + rows.join(' · ') : ' · waiting for divers'}`;
  }

  chooseRun(local: RunSave, cloud: RunSave): Promise<'local' | 'cloud'> {
    const desc = (s: RunSave) => `$${Number(s.money) || 0} · ${Math.round(Number(s.maxDepth) || 0)} m deepest · ${Number(s.caught) || 0} fish · ${fmtTime(Number(s.playTime) || 0)} played`;
    $('conflict-local').textContent = desc(local);
    $('conflict-cloud').textContent = desc(cloud);
    $('conflict').classList.remove('hidden');
    return new Promise((resolve) => {
      const pick = (v: 'local' | 'cloud') => () => {
        $('conflict').classList.add('hidden');
        resolve(v);
      };
      $('btn-keep-local').onclick = pick('local');
      $('btn-keep-cloud').onclick = pick('cloud');
    });
  }

  private chip(group: string, on: HTMLElement) {
    document.querySelectorAll(`${group} button`).forEach((b) => b.classList.toggle('on', b === on));
  }

  private msg(id: string, html: string, kind: 'ok' | 'err' | '') {
    const el = $(id);
    el.innerHTML = html;
    el.className = `code-msg ${kind}`;
  }

  private async copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.d.toast(done);
    } catch {
      // No clipboard access (http, old browser): show it so it can be copied by hand.
      this.d.toast(`Copy this: <b>${esc(text)}</b>`);
    }
  }
}
