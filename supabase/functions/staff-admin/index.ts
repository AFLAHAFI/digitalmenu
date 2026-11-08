// =====================================================================
//  staff-admin — create / edit / remove staff logins (username + password)
//
//  Needs the service-role key, so it runs here (Supabase Edge Function)
//  and never in the browser. The caller must be signed in and be an
//  active owner or manager of the hotel.
//    owner   -> may manage everyone (except removing/locking the last owner)
//    manager -> may manage waiter, kitchen and cashier accounts only
//
//  Staff log in with a username. Behind the scenes their Supabase Auth
//  email is  <username>@<hotel-slug>.staff.dmenu.app  (no mail is ever sent).
//  Keep staffEmail() in sync with js/common.js.
// =====================================================================

export const ROLES = ['owner', 'manager', 'waiter', 'kitchen', 'cashier'];
const MANAGER_CAN = ['waiter', 'kitchen', 'cashier'];
const USERNAME_RE = /^[a-z0-9][a-z0-9_.-]{2,19}$/;

export const staffEmail = (username: string, slug: string) =>
  `${username.toLowerCase()}@${slug}.staff.dmenu.app`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const bad = (m: string) => new HttpError(400, m);
const forbid = (m = 'Not allowed') => new HttpError(403, m);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function cleanName(v: unknown): string {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (s.length < 1 || s.length > 40) throw bad('Name must be 1–40 characters');
  return s;
}
function cleanUsername(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (!USERNAME_RE.test(s)) throw bad('Username: 3–20 letters/numbers (a-z 0-9 . _ -), starting with a letter or number');
  return s;
}
function cleanPassword(v: unknown): string {
  const s = String(v ?? '');
  if (s.length < 6 || s.length > 72) throw bad('Password must be at least 6 characters');
  return s;
}
function cleanRole(v: unknown): string {
  const s = String(v ?? '');
  if (!ROLES.includes(s)) throw bad('Invalid role');
  return s;
}

// deps = { admin } : a supabase-js client made with the service-role key
// deno-lint-ignore no-explicit-any
export async function handle(req: Request, deps: { admin: any }): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { admin } = deps;
  try {
    // ---- who is calling? ----
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Please sign in');
    const { data: ud, error: ue } = await admin.auth.getUser(token);
    if (ue || !ud?.user) throw new HttpError(401, 'Please sign in again');
    const caller = ud.user;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { throw bad('Invalid request'); }
    const action = String(body.action || '');
    const rid = String(body.restaurant_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(rid)) throw bad('Invalid hotel');

    const { data: rest } = await admin.from('restaurants').select('id, slug').eq('id', rid).maybeSingle();
    if (!rest) throw bad('Hotel not found');

    const { data: me } = await admin.from('staff').select('role, active, display_name, username')
      .eq('restaurant_id', rid).eq('user_id', caller.id).maybeSingle();
    if (!me || !me.active || !['owner', 'manager'].includes(me.role)) throw forbid();
    const isOwner = me.role === 'owner';
    const mayManageRole = (role: string) => isOwner || MANAGER_CAN.includes(role);
    const actor = me.display_name || me.username || caller.email || 'staff';

    const audit = (act: string, details: Record<string, unknown>) =>
      admin.from('audit_log').insert({ restaurant_id: rid, user_id: caller.id, actor, action: act, details });

    const activeOwners = async () => {
      const { count } = await admin.from('staff').select('user_id', { count: 'exact', head: true })
        .eq('restaurant_id', rid).eq('role', 'owner').eq('active', true);
      return count ?? 0;
    };
    const usernameTaken = async (username: string, exceptUser?: string) => {
      const { data } = await admin.from('staff').select('user_id, username').eq('restaurant_id', rid).not('username', 'is', null);
      return (data || []).some((s: { user_id: string; username: string }) =>
        s.username.toLowerCase() === username && s.user_id !== exceptUser);
    };

    // ------------------------------------------------------------------
    if (action === 'create') {
      const username = cleanUsername(body.username);
      const display_name = cleanName(body.display_name);
      const role = cleanRole(body.role);
      const password = cleanPassword(body.password);
      if (!mayManageRole(role)) throw forbid('Only the owner can add this role');
      if (await usernameTaken(username)) throw bad('This username is already used');

      const { data: cu, error: ce } = await admin.auth.admin.createUser({
        email: staffEmail(username, rest.slug), password, email_confirm: true,
        user_metadata: { display_name, restaurant_id: rid, username },
      });
      if (ce || !cu?.user) throw bad(ce?.message?.includes('already') ? 'This username is already used' : (ce?.message || 'Could not create login'));

      const { error: ie } = await admin.from('staff').insert({
        user_id: cu.user.id, restaurant_id: rid, role, username, display_name, active: true,
      });
      if (ie) { await admin.auth.admin.deleteUser(cu.user.id); throw bad(ie.message); }
      await audit('staff_added', { username, display_name, role });
      return json({ ok: true, user_id: cu.user.id });
    }

    // ---- everything below works on an existing staff member ----
    const uid = String(body.user_id || '');
    const { data: target } = await admin.from('staff').select('user_id, role, active, username, display_name')
      .eq('restaurant_id', rid).eq('user_id', uid).maybeSingle();
    if (!target) throw bad('Staff member not found');
    const isSelf = uid === caller.id;
    if (!isSelf && !mayManageRole(target.role)) throw forbid();

    if (action === 'update') {
      const patch: Record<string, unknown> = {};
      const authPatch: Record<string, unknown> = {};
      const changes: string[] = [];

      if (body.display_name !== undefined) {
        patch.display_name = cleanName(body.display_name); changes.push('name');
      }
      if (body.role !== undefined && body.role !== target.role) {
        const role = cleanRole(body.role);
        if (isSelf) throw bad('You cannot change your own role');
        if (!mayManageRole(role)) throw forbid('Only the owner can give this role');
        if (target.role === 'owner' && target.active && (await activeOwners()) <= 1) throw bad('The hotel needs at least one owner');
        patch.role = role; changes.push('role');
      }
      if (body.username !== undefined && String(body.username).toLowerCase() !== (target.username || '')) {
        if (!target.username) throw bad('This account logs in with email; username cannot be set');
        const username = cleanUsername(body.username);
        if (await usernameTaken(username, uid)) throw bad('This username is already used');
        patch.username = username;
        authPatch.email = staffEmail(username, rest.slug);
        authPatch.email_confirm = true;
        changes.push('username');
      }
      if (body.password !== undefined && body.password !== '') {
        authPatch.password = cleanPassword(body.password); changes.push('password');
      }
      if (body.active !== undefined && Boolean(body.active) !== target.active) {
        const active = Boolean(body.active);
        if (isSelf) throw bad('You cannot lock your own login');
        if (!active && target.role === 'owner' && (await activeOwners()) <= 1) throw bad('The hotel needs at least one owner');
        patch.active = active;
        // staff accounts belong to one hotel only -> also block the login itself
        if (target.username) authPatch.ban_duration = active ? 'none' : '876000h';
        changes.push(active ? 'unlocked' : 'locked');
      }
      if (!changes.length) return json({ ok: true, unchanged: true });

      if (Object.keys(authPatch).length) {
        const { error } = await admin.auth.admin.updateUserById(uid, authPatch);
        if (error) throw bad(error.message?.includes('already') ? 'This username is already used' : error.message);
      }
      if (Object.keys(patch).length) {
        const { error } = await admin.from('staff').update(patch).eq('restaurant_id', rid).eq('user_id', uid);
        if (error) throw bad(error.message);
      }
      await audit('staff_updated', { who: target.display_name || target.username, changes });
      return json({ ok: true });
    }

    if (action === 'delete') {
      if (isSelf) throw bad('You cannot remove yourself');
      if (target.role === 'owner' && target.active && (await activeOwners()) <= 1) throw bad('The hotel needs at least one owner');
      const { error } = await admin.from('staff').delete().eq('restaurant_id', rid).eq('user_id', uid);
      if (error) throw bad(error.message);
      // username accounts exist only for this hotel -> remove the login too
      if (target.username) await admin.auth.admin.deleteUser(uid);
      await audit('staff_removed', { who: target.display_name || target.username, role: target.role });
      return json({ ok: true });
    }

    throw bad('Unknown action');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Server error' }, 500);
  }
}

// ---- Supabase runtime entry point ----
// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D && D.serve) {
  const { createClient } = await import('jsr:@supabase/supabase-js@2');
  const admin = createClient(D.env.get('SUPABASE_URL'), D.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  D.serve((req: Request) => handle(req, { admin }));
}
