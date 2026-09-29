const http = require('http');
const crypto = require('crypto');

// ---------- state ----------
let S = fresh();
function fresh() { return { users: [], restaurants: [], reservations: [], idem: {}, seqUser: 1, seqRes: 1 }; }

// ---------- helpers ----------
function send(res, code, obj) {
  const b = obj === undefined || obj === null ? '' : JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(b) });
  res.end(b);
}
function err(res, code, ecode, msg) { send(res, code, { error: { code: ecode, message: msg || ecode } }); }
function readBody(req) { return new Promise((res, rej) => { let d = []; req.on('data', c => d.push(c)); req.on('end', () => res(Buffer.concat(d).toString('utf8'))); req.on('error', rej); }); }
function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
function authUser(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer (.+)$/.exec(h);
  if (!m || !m[1]) return null;
  const t = m[1];
  for (const u of S.users) if (u.tokens.includes(t)) return u;
  return null;
}
// mutex: serialize mutating ops
let chain = Promise.resolve();
function withLock(fn) { const r = chain.then(fn, fn); chain = r.catch(() => {}); return r; }

// ---------- time ----------
const dtfCache = {};
function dtf(tz) { if (!dtfCache[tz]) dtfCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); return dtfCache[tz]; }
function parts(tz, ms) {
  const p = dtf(tz).formatToParts(new Date(ms));
  const o = {}; for (const x of p) o[x.type] = x.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
}
function tzOffsetMin(tz, ms) {
  // offset = (wall-as-UTC - ms)/60000
  const p = parts(tz, ms);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - ms) / 60000);
}
function fmtOff(min) { const s = min < 0 ? '-' : '+'; const a = Math.abs(min); return s + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0'); }
function fmtRFC(tz, ms) { const p = parts(tz, ms); const off = tzOffsetMin(tz, ms); const q = n => String(n).padStart(2, '0'); return `${p.y}-${q(p.mo)}-${q(p.d)}T${q(p.h)}:${q(p.mi)}:${q(p.s)}${fmtOff(off)}`; }
function fmtUTC(ms) { const d = new Date(ms); const q = n => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${q(d.getUTCMonth() + 1)}-${q(d.getUTCDate())}T${q(d.getUTCHours())}:${q(d.getUTCMinutes())}:${q(d.getUTCSeconds())}+00:00`; }
// resolve local -> instants (first occurrence logic)
function resolveLocal(tz, y, mo, d, h, mi) {
  const found = [];
  for (let o = -720; o <= 840; o += 15) {
    const cand = Date.UTC(y, mo - 1, d, h, mi, 0) - o * 60000;
    const p = parts(tz, cand);
    if (p.y === y && p.mo === mo && p.d === d && p.h === h && p.mi === mi) {
      if (!found.includes(cand)) found.push(cand);
    }
  }
  found.sort((a, b) => a - b);
  return found;
}
function weekdayLocal(tz, y, mo, d) {
  // noon UTC to avoid edge; then format weekday in tz... better: use known instant: find any instant mapping to that date
  const ms = Date.UTC(y, mo - 1, d, 12, 0, 0);
  // weekday of the local date y-mo-d: use Intl on an instant whose local date is y-mo-d
  const c = resolveLocal(tz, y, mo, d, 12, 0);
  const base = c.length ? c[0] : ms;
  const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(base)).toLowerCase();
  return w.slice(0, 3);
}
function daysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function parseLocalStrict(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
  if (mo < 1 || mo > 12 || h > 23 || mi > 59) return null;
  if (d < 1 || d > daysIn(y, mo)) return null;
  return { y, mo, d, h, mi };
}
function parseDateStrict(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
  return { y, mo, d };
}
function hm(s) { const m = /^(\d{2}):(\d{2})$/.exec(s || ''); if (!m) return null; const h = +m[1], mi = +m[2]; if (h > 23 || mi > 59) return null; return h * 60 + mi; }

// ---------- domain ----------
function getRest(id) { return S.restaurants.find(r => r.id === id); }
function resShape(r) {
  const rest = getRest(r.restaurant_id);
  return { reservation_id: r.id, reference: r.reference, restaurant_id: r.restaurant_id, table_id: r.table_id, party_size: r.party_size, status: r.status, starts_at_local: r.starts_at_local, starts_at: fmtRFC(rest.timezone, r.startMs), ends_at: fmtRFC(rest.timezone, r.startMs + rest.reservation_duration_minutes * 60000), created_at: fmtUTC(r.createdMs) };
}
function overlap(aStart, aDur, bStart, bDur) { return aStart < bStart + bDur * 60000 && bStart < aStart + aDur * 60000; }
function tableBusy(rest, tableId, startMs, excludeId) {
  for (const r of S.reservations) {
    if (r.status !== 'confirmed' || r.table_id !== tableId || r.id === excludeId) continue;
    const rr = getRest(r.restaurant_id);
    if (r.restaurant_id !== rest.id) continue;
    if (overlap(startMs, rest.reservation_duration_minutes, r.startMs, rr.reservation_duration_minutes)) return true;
  }
  return false;
}
function slotList(rest, dateStr, y, mo, d) {
  const wd = weekdayLocal(rest.timezone, y, mo, d);
  const oh = rest.opening_hours.find(o => o.weekday === wd);
  if (!oh) return [];
  const opens = hm(oh.opens), closes = hm(oh.closes), dur = rest.reservation_duration_minutes, step = rest.slot_minutes;
  const out = [];
  for (let t = opens; t + dur <= closes; t += step) {
    const h = Math.floor(t / 60), mi = t % 60;
    const q = n => String(n).padStart(2, '0');
    const loc = `${dateStr}T${q(h)}:${q(mi)}`;
    const inst = resolveLocal(rest.timezone, y, mo, d, h, mi);
    if (!inst.length) continue; // skipped DST
    out.push({ loc, ms: inst[0] });
  }
  return out;
}
// validate booking target; returns {ok, status, code} or {ok, startMs}
function checkBooking(rest, tableId, locStr, party, excludeId) {
  const table = rest.tables.find(t => t.id === tableId);
  // party checks
  if (typeof party === 'string' || typeof party === 'boolean' || party === null) return { status: 422, code: 'validation_failed' };
  if (typeof party !== 'number' || !Number.isInteger(party) || party < 1) {
    if (typeof party !== 'number') return { status: 400, code: 'malformed_request' };
    return { status: 422, code: 'validation_failed' };
  }
  if (party > table.capacity) return { status: 422, code: 'party_exceeds_capacity' };
  // local parse
  if (typeof locStr !== 'string' || !parseLocalStrict(locStr)) return { status: 422, code: typeof locStr === 'string' ? 'validation_failed' : 'malformed_request' };
  // starts_at must be bare format (already), else 422
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(locStr)) return { status: 422, code: 'validation_failed' };
  const { y, mo, d, h, mi } = parseLocalStrict(locStr);
  const inst = resolveLocal(rest.timezone, y, mo, d, h, mi);
  if (!inst.length) return { status: 422, code: 'invalid_local_time' };
  const startMs = inst[0];
  // hours + grid
  const ds = locStr.slice(0, 10);
  const wd = weekdayLocal(rest.timezone, y, mo, d);
  const oh = rest.opening_hours.find(o => o.weekday === wd);
  if (!oh) return { status: 422, code: 'outside_opening_hours' };
  const opens = hm(oh.opens), closes = hm(oh.closes);
  const tmin = h * 60 + mi;
  if (tmin < opens || tmin + rest.reservation_duration_minutes > closes) return { status: 422, code: 'outside_opening_hours' };
  if ((tmin - opens) % rest.slot_minutes !== 0) return { status: 422, code: 'not_on_slot_grid' };
  if (tableBusy(rest, tableId, startMs, excludeId)) return { status: 409, code: 'table_unavailable' };
  return { startMs };
}
function cutoffPassed(rest, startMs) { return Date.now() > startMs - rest.cancellation_cutoff_minutes * 60000; }
function hashPw(p) { return 'scrypt:' + crypto.scryptSync(p, 'tablekeeper-salt', 32).toString('hex'); }
function newRef() { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let r; do { r = ''; for (let i = 0; i < 6; i++) r += A[crypto.randomInt(A.length)]; } while (S.reservations.some(x => x.reference === r)); return r; }

// ---------- server ----------
async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname, method = req.method;
  try {
    if (method === 'GET' && path === '/health') return send(res, 200, { status: 'ok' });
    if (method === 'POST' && path === '/_test/reset') {
      const raw = await readBody(req);
      let f; try { f = raw ? JSON.parse(raw) : {}; } catch { return err(res, 400, 'malformed_request'); }
      if (typeof f !== 'object' || f === null || Array.isArray(f)) return err(res, 400, 'malformed_request');
      // R-1.6: all fixture IDs opaque strings <=64 chars; R-1.38: references 6-12 A-Z0-9
      const idOk = s => typeof s === 'string' && s.length >= 1 && s.length <= 64;
      const refOk = s => typeof s === 'string' && /^[A-Z0-9]{6,12}$/.test(s);
      for (const u of (f.users || [])) { if (!idOk(u.id)) return err(res, 422, 'validation_failed'); }
      for (const r of (f.restaurants || [])) {
        if (!idOk(r.id)) return err(res, 422, 'validation_failed');
        for (const t of (r.tables || [])) { if (!idOk(t.id)) return err(res, 422, 'validation_failed'); }
      }
      for (const r of (f.reservations || [])) {
        if (!idOk(r.id) || !refOk(r.reference) || !idOk(r.restaurant_id) || !idOk(r.table_id) || !idOk(r.user_id)) return err(res, 422, 'validation_failed');
      }
      const ns = fresh();
      for (const u of (f.users || [])) ns.users.push({ id: u.id, email: u.email, pw: hashPw(u.password), display_name: u.display_name, tokens: [] });
      for (const r of (f.restaurants || [])) ns.restaurants.push(r);
      for (const r of (f.reservations || [])) {
        const rest = ns.restaurants.find(x => x.id === r.restaurant_id);
        const p = parseLocalStrict(r.starts_at_local);
        const inst = p && rest ? resolveLocal(rest.timezone, p.y, p.mo, p.d, p.h, p.mi) : [];
        ns.reservations.push({ id: r.id, reference: r.reference, restaurant_id: r.restaurant_id, table_id: r.table_id, party_size: r.party_size, status: 'confirmed', starts_at_local: r.starts_at_local, startMs: inst.length ? inst[0] : 0, createdMs: Date.now(), user_id: r.user_id });
      }
      S = ns;
      return send(res, 204, null);
    }
    if (method === 'GET' && path === '/_test/export') {
      const snap = JSON.parse(JSON.stringify({ users: S.users, restaurants: S.restaurants, reservations: S.reservations, idem: S.idem, seqUser: S.seqUser, seqRes: S.seqRes }));
      return send(res, 200, { track: 'tablekeeper', format_version: 1, state: snap });
    }
    if (method === 'POST' && path === '/_test/import') {
      const raw = await readBody(req);
      let b; try { b = JSON.parse(raw); } catch { return err(res, 400, 'malformed_request'); }
      if (!b || b.track !== 'tablekeeper' || b.format_version !== 1 || typeof b.state !== 'object' || !b.state) return err(res, 422, 'validation_failed');
      const st = b.state;
      if (!Array.isArray(st.users) || !Array.isArray(st.restaurants) || !Array.isArray(st.reservations)) return err(res, 422, 'validation_failed');
      S = { users: st.users, restaurants: st.restaurants, reservations: st.reservations, idem: st.idem || {}, seqUser: st.seqUser || 1, seqRes: st.seqRes || 1 };
      return send(res, 204, null);
    }
    // auth endpoints
    if (method === 'POST' && (path === '/auth/signup' || path === '/auth/login')) {
      const raw = await readBody(req);
      let b; try { b = JSON.parse(raw || '{}'); } catch { return err(res, 400, 'malformed_request'); }
      if (typeof b !== 'object' || b === null || Array.isArray(b)) return err(res, 400, 'malformed_request');
      if (path === '/auth/signup') {
        const { email, password, display_name } = b;
        if (typeof email !== 'string' || typeof password !== 'string' || typeof display_name !== 'string') return err(res, 400, 'malformed_request');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !/^[^@\s]+@[^@\s]+$/.test(email)) return err(res, 422, 'validation_failed');
        if (!/^[^@]+@[^@]+$/.test(email)) return err(res, 422, 'validation_failed');
        if (password.length < 8) return err(res, 422, 'validation_failed');
        if (S.users.some(u => u.email === email)) return err(res, 409, 'email_taken');
        const u = { id: 'u_' + (S.seqUser++), email, pw: hashPw(password), display_name, tokens: [] };
        const tok = crypto.randomBytes(24).toString('hex');
        u.tokens.push(tok); S.users.push(u);
        return send(res, 201, { user_id: u.id, display_name, token: tok });
      } else {
        const { email, password } = b;
        if (typeof email !== 'string' || typeof password !== 'string') return err(res, 400, 'malformed_request');
        const u = S.users.find(x => x.email === email);
        if (!u || u.pw !== hashPw(password)) return err(res, 401, 'unauthenticated');
        const tok = crypto.randomBytes(24).toString('hex');
        u.tokens.push(tok);
        return send(res, 200, { user_id: u.id, display_name: u.display_name, token: tok });
      }
    }
    if (method === 'GET' && path === '/restaurants') return send(res, 200, { restaurants: S.restaurants.map(r => ({ id: r.id, name: r.name, timezone: r.timezone })) });
    {
      const m = /^\/restaurants\/([^/]+)$/.exec(path);
      if (method === 'GET' && m) { const r = getRest(decodeURIComponent(m[1])); if (!r) return err(res, 404, 'not_found'); return send(res, 200, r); }
    }
    if (method === 'GET' && path === '/availability') {
      const rid = url.searchParams.get('restaurant_id'), date = url.searchParams.get('date'), psRaw = url.searchParams.get('party_size');
      if (!rid || !date || psRaw === null) return err(res, 422, 'validation_failed');
      if (!/^[0-9]+$/.test(psRaw)) return err(res, 422, 'validation_failed');
      const ps = parseInt(psRaw, 10);
      if (ps < 1) return err(res, 422, 'validation_failed');
      const rest = getRest(rid); if (!rest) return err(res, 404, 'not_found');
      const dp = parseDateStrict(date); if (!dp) return err(res, 422, 'validation_failed');
      const slots = slotList(rest, date, dp.y, dp.mo, dp.d).map(s => ({ starts_at_local: s.loc, starts_at: fmtRFC(rest.timezone, s.ms), available_table_ids: rest.tables.filter(t => t.capacity >= ps && !tableBusy(rest, t.id, s.ms, null)).map(t => t.id) }));
      return send(res, 200, { restaurant_id: rid, date, timezone: rest.timezone, slots });
    }
    // idempotent writes
    if (method === 'POST' && (path === '/reservations' || path === '/reservation-moves')) {
      const raw = await readBody(req);
      let b; try { b = raw ? JSON.parse(raw) : undefined; } catch { return err(res, 400, 'malformed_request'); }
      if (typeof b !== 'object' || b === null || Array.isArray(b)) return err(res, 400, 'malformed_request');
      const u = authUser(req); if (!u) return err(res, 401, 'unauthenticated');
      const key = req.headers['idempotency-key'];
      if (key === undefined || key === null || String(key).length === 0) return err(res, 400, 'missing_idempotency_key');
      if (String(key).length > 255) return err(res, 422, 'validation_failed');
      return withLock(async () => {
        const uk = (S.idem[u.id] ||= {});
        const e = uk[key];
        const cb = canon(b);
        if (e && e.method === method && e.path === path && e.body === cb) {
          if (e.status >= 400) { delete uk[key]; } // reusable after 4xx -> fall through
          else return send(res, 200, e.resp);
        } else if (e && !(e.status >= 400 && e.method === method && e.path === path && e.body === cb)) {
          if (e.method === method && e.path === path && e.body !== cb) return err(res, 409, 'idempotency_key_reuse');
          if (e.status >= 400) { delete uk[key]; }
        }
        const finish = (status, obj, okEffect) => {
          if (status < 400) uk[key] = { method, path, body: cb, status: 201, resp: obj };
          else uk[key] = { method, path, body: cb, status, resp: obj, fail: true };
          send(res, status, obj);
        };
        const fail = (status, code) => { const o = { error: { code, message: code } }; uk[key] = { method, path, body: cb, status, resp: o, fail: true }; send(res, status, o); };
        if (path === '/reservations') return createRes(b, u, finish, fail);
        return doMoves(b, u, finish, fail);
      });
    }
    // authed reads
    const needAuth = () => { const u = authUser(req); if (!u) { err(res, 401, 'unauthenticated'); return null; } return u; };
    if (method === 'GET' && path === '/reservations') {
      const u = needAuth(); if (!u) return;
      const list = S.reservations.filter(r => r.user_id === u.id).sort((a, b) => b.startMs - a.startMs).map(resShape);
      return send(res, 200, { reservations: list });
    }
    {
      const m = /^\/reservations\/([^/]+)$/.exec(path);
      if (method === 'GET' && m) {
        const u = needAuth(); if (!u) return;
        const r = S.reservations.find(x => x.reference === decodeURIComponent(m[1]) && x.user_id === u.id);
        if (!r) return err(res, 404, 'not_found');
        return send(res, 200, resShape(r));
      }
    }
    {
      const m = /^\/reservations\/([^/]+)\/cancel$/.exec(path);
      if (method === 'POST' && m) {
        const u = needAuth(); if (!u) return;
        return withLock(async () => {
          const r = S.reservations.find(x => x.reference === decodeURIComponent(m[1]) && x.user_id === u.id);
          if (!r) return err(res, 404, 'not_found');
          const rest = getRest(r.restaurant_id);
          if (r.status === 'cancelled') return send(res, 200, resShape(r));
          if (cutoffPassed(rest, r.startMs)) return err(res, 409, 'cutoff_passed');
          r.status = 'cancelled';
          return send(res, 200, resShape(r));
        });
      }
    }
    {
      const m = /^\/reservations\/([^/]+)$/.exec(path);
      if (method === 'PATCH' && m) {
        const raw = await readBody(req);
        let b; try { b = raw ? JSON.parse(raw) : {}; } catch { return err(res, 400, 'malformed_request'); }
        if (typeof b !== 'object' || b === null || Array.isArray(b)) return err(res, 400, 'malformed_request');
        const u = needAuth(); if (!u) return;
        return withLock(async () => {
          const r = S.reservations.find(x => x.reference === decodeURIComponent(m[1]) && x.user_id === u.id);
          if (!r) return err(res, 404, 'not_found');
          if (r.status === 'cancelled') return err(res, 409, 'reservation_cancelled');
          const rest = getRest(r.restaurant_id);
          if (cutoffPassed(rest, r.startMs)) return err(res, 409, 'cutoff_passed');
          const nt = b.table_id !== undefined ? b.table_id : r.table_id;
          const nl = b.starts_at_local !== undefined ? b.starts_at_local : r.starts_at_local;
          const np = b.party_size !== undefined ? b.party_size : r.party_size;
          if (b.table_id !== undefined && typeof b.table_id !== 'string') return err(res, 400, 'malformed_request');
          if (b.starts_at_local !== undefined && typeof b.starts_at_local !== 'string') { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(b.starts_at_local))) return err(res, 422, 'validation_failed'); return err(res, 400, 'malformed_request'); }
          if (b.party_size !== undefined && (typeof b.party_size === 'string' || typeof b.party_size === 'boolean' || b.party_size === null)) return err(res, 422, 'validation_failed');
          if (b.party_size !== undefined && typeof b.party_size !== 'number') return err(res, 400, 'malformed_request');
          const trow = rest.tables.find(t => t.id === nt);
          if (!trow) return err(res, 404, 'not_found');
          const c = checkBooking(rest, nt, nl, np, r.id);
          if (c.status) return err(res, c.status, c.code);
          r.table_id = nt; r.starts_at_local = nl; r.party_size = np; r.startMs = c.startMs;
          return send(res, 200, resShape(r));
        });
      }
    }
    return err(res, 404, 'not_found');
  } catch (e) { return err(res, 500, 'internal'); }
}

function createRes(b, u, finish, fail) {
  const { restaurant_id, table_id, starts_at_local, party_size } = b;
  if (restaurant_id === undefined || table_id === undefined || starts_at_local === undefined || party_size === undefined) return fail(422, 'validation_failed');
  if (typeof restaurant_id !== 'string' || typeof table_id !== 'string') return fail(400, 'malformed_request');
  if (typeof starts_at_local !== 'string') { if (typeof starts_at_local === 'number' || typeof starts_at_local === 'boolean' || starts_at_local === null) { if (typeof party_size !== 'number') {} } return fail(typeof starts_at_local === 'string' ? 422 : (/^\d/.test('') ? 422 : 400), 'validation_failed'); }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(starts_at_local) && typeof starts_at_local === 'string') {
    // could be invalid format -> 422
    if (!parseLocalStrict(starts_at_local)) return fail(422, 'validation_failed');
  }
  if (typeof party_size === 'string' || typeof party_size === 'boolean' || party_size === null) return fail(422, 'validation_failed');
  if (typeof party_size !== 'number') return fail(400, 'malformed_request');
  const rest = getRest(restaurant_id);
  const table = rest && rest.tables.find(t => t.id === table_id);
  if (!rest || !table || table && rest && table_id && getRest(restaurant_id) && !rest.tables.some(t => t.id === table_id)) return fail(404, 'not_found');
  // unknown table in another restaurant -> 404
  if (table_id && !rest.tables.some(t => t.id === table_id)) {
    if (S.restaurants.some(r => r.tables.some(t => t.id === table_id))) return fail(404, 'not_found');
    return fail(404, 'not_found');
  }
  const c = checkBooking(rest, table_id, starts_at_local, party_size, null);
  if (c.status) return fail(c.status, c.code);
  const r = { id: 'res_' + (S.seqRes++), reference: newRef(), restaurant_id, table_id, party_size, status: 'confirmed', starts_at_local, startMs: c.startMs, createdMs: Date.now(), user_id: u.id };
  S.reservations.push(r);
  return finish(201, resShape(r), true);
}

function doMoves(b, u, finish, fail) {
  const moves = b.moves;
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > 8) return fail(422, 'validation_failed');
  const refs = moves.map(m => m && m.reference);
  if (refs.some(r => typeof r !== 'string') || new Set(refs).size !== refs.length) return fail(422, 'validation_failed');
  // ownership + same restaurant
  const rows = [];
  for (const m of moves) {
    if (typeof m !== 'object' || m === null || Array.isArray(m)) return fail(422, 'validation_failed');
    const r = S.reservations.find(x => x.reference === m.reference && x.user_id === u.id);
    if (!r) return fail(404, 'not_found');
    rows.push(r);
  }
  const rid = rows[0].restaurant_id;
  if (rows.some(r => r.restaurant_id !== rid)) return fail(422, 'validation_failed');
  const rest = getRest(rid);
  // per-booking: cancelled, cutoff first, then other validation in input order
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], m = moves[i];
    if (r.status === 'cancelled') return fail(409, 'reservation_cancelled');
    if (cutoffPassed(rest, r.startMs)) return fail(409, 'cutoff_passed');
  }
  // compute targets
  const targets = rows.map((r, i) => {
    const m = moves[i];
    return { r, nt: m.table_id !== undefined ? m.table_id : r.table_id, nl: m.starts_at_local !== undefined ? m.starts_at_local : r.starts_at_local, np: m.party_size !== undefined ? m.party_size : r.party_size };
  });
  for (const t of targets) {
    if (t.nt !== undefined && typeof t.nt !== 'string') return fail(400, 'malformed_request');
    if (t.np !== undefined && (typeof t.np === 'string' || typeof t.np === 'boolean' || t.np === null)) return fail(422, 'validation_failed');
    if (typeof t.np !== 'number') return fail(400, 'malformed_request');
    if (t.nl !== undefined && typeof t.nl !== 'string') return fail(400, 'malformed_request');
    if (!rest.tables.some(x => x.id === t.nt)) return fail(404, 'not_found');
    if (typeof t.np !== 'number' || !Number.isInteger(t.np) || t.np < 1) { if (typeof t.np !== 'number') return fail(400, 'malformed_request'); return fail(422, 'validation_failed'); }
    const cap = rest.tables.find(x => x.id === t.nt).capacity;
    if (t.np > cap) return fail(422, 'party_exceeds_capacity');
    if (!parseLocalStrict(t.nl)) return fail(422, t.nl && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t.nl) ? 'validation_failed' : (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t.nl || '') ? 'validation_failed' : 'validation_failed'));
    const { y, mo, d, h, mi } = parseLocalStrict(t.nl);
    const inst = resolveLocal(rest.timezone, y, mo, d, h, mi);
    if (!inst.length) return fail(422, 'invalid_local_time');
    t.startMs = inst[0];
    const wd = weekdayLocal(rest.timezone, y, mo, d);
    const oh = rest.opening_hours.find(o => o.weekday === wd);
    const tmin = h * 60 + mi;
    if (!oh || tmin < hm(oh.opens) || tmin + rest.reservation_duration_minutes > hm(oh.closes)) return fail(422, 'outside_opening_hours');
    if ((tmin - hm(oh.opens)) % rest.slot_minutes !== 0) return fail(422, 'not_on_slot_grid');
  }
  // overlap: among results + with unlisted
  const ids = new Set(rows.map(r => r.id));
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      if (targets[i].nt === targets[j].nt && overlap(targets[i].startMs, rest.reservation_duration_minutes, targets[j].startMs, rest.reservation_duration_minutes)) return fail(409, 'table_unavailable');
    }
    // vs unlisted confirmed
    for (const o of S.reservations) {
      if (o.status !== 'confirmed' || ids.has(o.id) || o.table_id !== targets[i].nt || o.restaurant_id !== rid) continue;
      const rr = getRest(o.restaurant_id);
      if (overlap(targets[i].startMs, rest.reservation_duration_minutes, o.startMs, rr.reservation_duration_minutes)) return fail(409, 'table_unavailable');
    }
  }
  for (const t of targets) { t.r.table_id = t.nt; t.r.starts_at_local = t.nl; t.r.party_size = t.np; t.r.startMs = t.startMs; }
  return finish(201, { reservations: rows.map(resShape) }, true);
}

const port = +(process.env.PORT || 8080);
http.createServer(handler).listen(port, '0.0.0.0');
