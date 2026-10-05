// Save codes: the whole save as a copy-pasteable string, so progress can move between
// devices (or from Safari into the home-screen app, which gets its own storage on iOS).
// Format: "ML1." + base64url(JSON) + "." + 4-char checksum, so a truncated paste is caught.

const PREFIX = 'ML1.';

const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
const checksum = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36).slice(-4).padStart(4, '0');
};

export function encodeSave(save: object): string {
  const body = b64url(JSON.stringify(save));
  return `${PREFIX}${body}.${checksum(body)}`;
}

/** Returns the decoded save, or an error message a player can act on. */
export function decodeSave(code: string): { ok: true; save: Record<string, unknown> } | { ok: false; error: string } {
  const c = code.replace(/\s+/g, '');
  if (!c) return { ok: false, error: 'Paste a save code first.' };
  if (!c.startsWith(PREFIX)) return { ok: false, error: "That isn't a Morrow Lake save code." };
  const [body, sum] = c.slice(PREFIX.length).split('.');
  if (!body || !sum || checksum(body) !== sum) return { ok: false, error: 'That code is incomplete or mistyped. Copy the whole thing.' };
  try {
    const save = JSON.parse(unb64url(body));
    const nums = ['money', 'air', 'harpoon', 'armor'];
    if (!save || typeof save !== 'object' || nums.some((k) => typeof save[k] !== 'number')) throw new Error();
    return { ok: true, save };
  } catch {
    return { ok: false, error: 'That code could not be read.' };
  }
}
