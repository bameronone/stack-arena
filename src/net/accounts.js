// Sign-in and the leaderboard, on Supabase (auth + a Postgres table with
// row-level security; setup in docs/leaderboard.sql). The game talks to its
// REST endpoints with fetch, so there is still no server of our own and no
// dependency. The publishable key is meant to be public.
//
// Sign-in is OAuth (GitHub or Google): the page goes to Supabase, then comes
// back with the session tokens in the URL hash, which are kept in
// localStorage and refreshed when they expire.

export const SUPABASE_URL = 'https://fbzpzecqcccjcpfndfld.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XGy9JpIGhdqR64HV3LUQHQ_OAcTNlUg';
const SESSION_KEY = 'stack-arena-session';
export const PROVIDERS = { github: 'GitHub', google: 'Google' };

// OAuth needs a real web page to come back to (not a file or an artifact).
export const accountsAvailable = () => /^https?:$/.test(location.protocol);

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
}
function writeSession(s) {
  try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
}

// Back from the sign-in page: the tokens arrive in the hash. Keep them and
// tidy the address bar.
function takeSessionFromHash() {
  if (!location.hash.includes('access_token=')) return;
  const h = new URLSearchParams(location.hash.slice(1));
  writeSession({ access: h.get('access_token'), refresh: h.get('refresh_token'), expiresAt: Date.now() + Number(h.get('expires_in') || 3600) * 1000 });
  history.replaceState(null, '', location.pathname + location.search);
}
takeSessionFromHash();

export function signIn(provider) {
  const back = location.origin + location.pathname + location.search;
  location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(back)}`;
}

export function signOut() {
  const s = readSession();
  writeSession(null);
  account = null;
  if (s) fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access}` } }).catch(() => {});
}

// A fresh access token, refreshing the session if it ran out.
async function accessToken() {
  let s = readSession();
  if (!s) return null;
  if (Date.now() > s.expiresAt - 60000) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh }),
    });
    if (!res.ok) { writeSession(null); return null; }
    const j = await res.json();
    s = { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000 };
    writeSession(s);
  }
  return s.access;
}

async function api(path, { method = 'GET', body, prefer, auth = false } = {}) {
  const headers = { apikey: SUPABASE_KEY };
  if (auth) {
    const t = await accessToken();
    if (!t) throw new Error('Signed out');
    headers.Authorization = `Bearer ${t}`;
  }
  if (body) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${await res.text().catch(() => '')}`.trim()), { status: res.status });
  return res.status === 204 || res.status === 201 ? null : res.json();
}

// The signed-in player: { id, name }, or null. Loaded once per page.
let account = null;
export const currentAccount = () => account;
export async function loadAccount() {
  if (!readSession()) return (account = null);
  try {
    const user = await api('/auth/v1/user', { auth: true });
    const [profile] = await api(`/rest/v1/profiles?id=eq.${user.id}&select=name`, { auth: true });
    account = { id: user.id, name: profile?.name || null };
  } catch { account = null; }
  return account;
}

// A new player picks their leaderboard name once; it can't be changed
// after (the database only allows adding a profile, not renaming it).
// Names are unique, ignoring case: a name someone else has fails with the
// message 'taken'.
export const NAME_RULE = /^[A-Za-z0-9 _\-]{2,20}$/;
export async function setLeaderboardName(name) {
  const clean = String(name).trim().replace(/\s+/g, ' ');
  if (!NAME_RULE.test(clean)) throw new Error('invalid');
  try {
    await api('/rest/v1/profiles', { method: 'POST', auth: true, prefer: 'return=minimal', body: { id: account.id, name: clean } });
  } catch (e) {
    throw e.status === 409 && e.message.includes('profiles_name_unique') ? new Error('taken') : e;
  }
  account.name = clean;
}

// Whether a leaderboard player already has this name (ignoring case), so a
// guest can't play online under it. If the check can't be made, the name
// is allowed.
export async function nameTaken(name) {
  const clean = String(name).trim();
  if (!NAME_RULE.test(clean)) return false; // leaderboard names never look like this
  const pattern = clean.replace(/_/g, '\\_');
  try {
    const rows = await api(`/rest/v1/profiles?name=ilike.${encodeURIComponent(pattern)}&select=name&limit=1`);
    return rows.length > 0;
  } catch { return false; }
}

// One finished match. The same match (seed) is only counted once.
// result: { mode: 'bots'|'online', level, players, placement, charId, seed, rounds }
export async function submitResult(r) {
  if (!account) return false;
  await api('/rest/v1/results', {
    method: 'POST', auth: true, prefer: 'resolution=ignore-duplicates,return=minimal',
    body: { mode: r.mode, level: r.level || null, players: r.players, placement: r.placement, char_id: r.charId, seed: r.seed, rounds: r.rounds },
  });
  return true;
}

// Top players for a board: mode 'online', or 'bots' with a level.
export async function leaderboard(mode, level) {
  const filter = mode === 'online' ? 'mode=eq.online' : `mode=eq.bots&level=eq.${level}`;
  return api(`/rest/v1/leaderboard?${filter}&select=name,games,wins,beaten,avg_place&order=beaten.desc,wins.desc&limit=25`);
}
