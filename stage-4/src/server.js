const http = require('http');
const crypto = require('crypto');
let S = fresh();
function fresh() { return { users: [], restaurants: [], reservations: [], series: [], idem: {}, seqUser: 1, seqRes: 1, seqSeries: 1 }; }
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
let chain = Promise.resolve();
function withLock(fn) { const r = chain.then(fn, fn); chain = r.catch(() => {}); return r; }
const dtfCache = {};
function dtf(tz) { if (!dtfCache[tz]) dtfCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); return dtfCache[tz]; }
function parts(tz, ms) {
  const p = dtf(tz).formatToParts(new Date(ms));
  const o = {}; for (const x of p) o[x.type] = x.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
}
function tzOffsetMin(tz, ms) {
  const p = parts(tz, ms);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - ms) / 60000);
}
function fmtOff(min) { const s = min < 0 ? '-' : '+'; const a = Math.abs(min); return s + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0'); }
function fmtRFC(tz, ms) { const p = parts(tz, ms); const off = tzOffsetMin(tz, ms); const q = n => String(n).padStart(2, '0'); return `${p.y}-${q(p.mo)}-${q(p.d)}T${q(p.h)}:${q(p.mi)}:${q(p.s)}${fmtOff(off)}`; }
function fmtUTC(ms) { const d = new Date(ms); const q = n => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${q(d.getUTCMonth() + 1)}-${q(d.getUTCDate())}T${q(d.getUTCHours())}:${q(d.getUTCMinutes())}:${q(d.getUTCSeconds())}+00:00`; }
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
  const c = resolveLocal(tz, y, mo, d, 12, 0);
  const base = c.length ? c[0] : Date.UTC(y, mo - 1, d, 12, 0, 0);
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
function getRest(id) { return S.restaurants.find(r => r.id === id); }
// ---- policies ----
function policyZero(rest) {
  const caps = {}; for (const t of rest.tables) caps[t.id] = t.capacity;
  return { policy_version: 0, slot_minutes: rest.slot_minutes, reservation_duration_minutes: rest.reservation_duration_minutes, cancellation_cutoff_minutes: rest.cancellation_cutoff_minutes, opening_hours: rest.opening_hours, capacities: caps };
}
function selectPolicy(rest, dateStr) {
  let best = null;
  for (const p of (rest.policies || [])) {
    if (p.effective_from <= dateStr) {
      if (!best || p.effective_from > best.effective_from || (p.effective_from === best.effective_from && p.policy_version > best.policy_version)) best = p;
    }
  }
  if (!best) return policyZero(rest);
  return { policy_version: best.policy_version, slot_minutes: best.slot_minutes, reservation_duration_minutes: best.reservation_duration_minutes, cancellation_cutoff_minutes: best.cancellation_cutoff_minutes, opening_hours: best.opening_hours, capacities: best.capacities };
}
function termsOf(cfg) {
  return { policy_version: cfg.policy_version, slot_minutes: cfg.slot_minutes, reservation_duration_minutes: cfg.reservation_duration_minutes, cancellation_cutoff_minutes: cfg.cancellation_cutoff_minutes, opening_hours: cfg.opening_hours, capacities: cfg.capacities };
}
function resShape(r) {
  const rest = getRest(r.restaurant_id);
  const ids = r.table_ids || (r.table_id ? [r.table_id] : []);
  const dur = (r.accepted_terms && r.accepted_terms.reservation_duration_minutes) || rest.reservation_duration_minutes;
  const o = { reservation_id: r.id, reference: r.reference, restaurant_id: r.restaurant_id, table_ids: ids, party_size: r.party_size, status: r.status, starts_at_local: r.starts_at_local, starts_at: fmtRFC(rest.timezone, r.startMs), ends_at: fmtRFC(rest.timezone, r.startMs + dur * 60000), created_at: fmtUTC(r.createdMs), revision: r.revision || 1, accepted_terms: r.accepted_terms || termsOf(policyZero(rest)) };
  if (ids.length === 1) o.table_id = ids[0];
  return o;
}
function overlap(aStart, aDur, bStart, bDur) { return aStart < bStart + bDur * 60000 && bStart < aStart + aDur * 60000; }
function resTables(r) { return r.table_ids || (r.table_id ? [r.table_id] : []); }
function resDur(r) { const rest = getRest(r.restaurant_id); return (r.accepted_terms && r.accepted_terms.reservation_duration_minutes) || rest.reservation_duration_minutes; }
function comboCapCfg(cfg, rest, ids) { return ids.reduce((s, t) => { const c = cfg.capacities ? cfg.capacities[t] : undefined; if (c !== undefined) return s + c; return s + rest.tables.find(x => x.id === t).capacity; }, 0); }
function pairAllowed(rest, ids) {
  if (ids.length !== 2) return false;
  return (rest.combinable || []).some(p => p[0] === ids[0] && p[1] === ids[1]);
}
function canonPair(rest, ids) {
  if (ids.length !== 2) return ids.slice();
  const decl = (rest.combinable || []).find(p => (p[0] === ids[0] && p[1] === ids[1]) || (p[0] === ids[1] && p[1] === ids[0]));
  if (decl) return [decl[0], decl[1]];
  return ids.slice();
}
function sameSet(a, b) { return a.length === b.length && a.every(x => b.includes(x)); }
function tableBusy(rest, tableId, startMs, durMin, excludeId) {
  for (const c of (rest.closures || [])) {
    if (c.table_id === tableId && overlap(startMs, durMin, c.fromMs, (c.toMs - c.fromMs) / 60000)) return true;
  }
  for (const r of S.reservations) {
    if (r.status !== 'confirmed' || r.id === excludeId) continue;
    if (r.restaurant_id !== rest.id) continue;
    if (!resTables(r).includes(tableId)) continue;
    if (overlap(startMs, durMin, r.startMs, resDur(r))) return true;
  }
  return false;
}
function setBusy(rest, tableIds, startMs, durMin, excludeId) {
  for (const tid of tableIds) if (tableBusy(rest, tid, startMs, durMin, excludeId)) return true;
  return false;
}
function slotList(rest, dateStr, y, mo, d, cfg) {
  const wd = weekdayLocal(rest.timezone, y, mo, d);
  const oh = cfg.opening_hours.find(o => o.weekday === wd);
  if (!oh) return [];
  const opens = hm(oh.opens), closes = hm(oh.closes), dur = cfg.reservation_duration_minutes, step = cfg.slot_minutes;
  const out = [];
  for (let t = opens; t + dur <= closes; t += step) {
    const h = Math.floor(t / 60), mi = t % 60;
    const q = n => String(n).padStart(2, '0');
    const loc = `${dateStr}T${q(h)}:${q(mi)}`;
    const inst = resolveLocal(rest.timezone, y, mo, d, h, mi);
    if (!inst.length) continue;
    out.push({ loc, ms: inst[0] });
  }
  return out;
}
function checkBooking(rest, cfg, tableIds, locStr, party, excludeId) {
  if (!Array.isArray(tableIds) || tableIds.length < 1) return { status: 422, code: 'validation_failed' };
  if (tableIds.some(t => typeof t !== 'string')) return { status: 400, code: 'malformed_request' };
  if (new Set(tableIds).size !== tableIds.length) return { status: 422, code: 'validation_failed' };
  if (tableIds.length > 2) return { status: 422, code: 'combination_not_allowed' };
  for (const t of tableIds) if (!rest.tables.some(x => x.id === t)) return { status: 404, code: 'not_found' };
  if (tableIds.length === 2 && !pairAllowed(rest, tableIds)) return { status: 422, code: 'combination_not_allowed' };
  const cap = comboCapCfg(cfg, rest, tableIds);
  if (typeof party === 'string' || typeof party === 'boolean' || party === null) return { status: 422, code: 'validation_failed' };
  if (typeof party !== 'number' || !Number.isInteger(party) || party < 1) {
    if (typeof party !== 'number') return { status: 400, code: 'malformed_request' };
    return { status: 422, code: 'validation_failed' };
  }
  if (party > cap) return { status: 422, code: 'party_exceeds_capacity' };
  if (typeof locStr !== 'string' || !parseLocalStrict(locStr)) return { status: 422, code: 'validation_failed' };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(locStr)) return { status: 422, code: 'validation_failed' };
  const { y, mo, d, h, mi } = parseLocalStrict(locStr);
  const inst = resolveLocal(rest.timezone, y, mo, d, h, mi);
  if (!inst.length) return { status: 422, code: 'invalid_local_time' };
  const startMs = inst[0];
  const wd = weekdayLocal(rest.timezone, y, mo, d);
  const oh = cfg.opening_hours.find(o => o.weekday === wd);
  if (!oh) return { status: 422, code: 'outside_opening_hours' };
  const opens = hm(oh.opens), closes = hm(oh.closes);
  const tmin = h * 60 + mi;
  if (tmin < opens || tmin + cfg.reservation_duration_minutes > closes) return { status: 422, code: 'outside_opening_hours' };
  if ((tmin - opens) % cfg.slot_minutes !== 0) return { status: 422, code: 'not_on_slot_grid' };
  if (setBusy(rest, tableIds, startMs, cfg.reservation_duration_minutes, excludeId)) return { status: 409, code: 'table_unavailable' };
  return { startMs };
}
function cutoffPassed(cutoffMin, startMs) { return Date.now() > startMs - cutoffMin * 60000; }
function hashPw(p) { return 'scrypt:' + crypto.scryptSync(p, 'tablekeeper-salt', 32).toString('hex'); }
function newRef() { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let r; do { r = ''; for (let i = 0; i < 6; i++) r += A[crypto.randomInt(A.length)]; } while (S.reservations.some(x => x.reference === r)); return r; }
function pushHistory(r, event, changes) {
  const seq = (r.history || []).length + 1;
  (r.history ||= []).push({ seq, at: fmtUTC(Date.now()), event, changes, revision: r.revision, accepted_terms: r.accepted_terms });
}
function createdChanges(ids, loc, party, isPair) {
  if (isPair) return [{ field: 'table_ids', from: null, to: ids }, { field: 'starts_at_local', from: null, to: loc }, { field: 'party_size', from: null, to: party }];
  return [{ field: 'table_id', from: null, to: ids[0] }, { field: 'starts_at_local', from: null, to: loc }, { field: 'party_size', from: null, to: party }];
}
function changedFields(rest, oldIds, newIds, oldLoc, newLoc, oldP, newP) {
  const out = [];
  const pairInvolved = oldIds.length === 2 || newIds.length === 2;
  if (!sameSet(oldIds, newIds)) {
    if (pairInvolved) {
      const oOrd = oldIds.length === 2 ? canonPair(rest, oldIds) : oldIds.slice();
      const nOrd = newIds.length === 2 ? canonPair(rest, newIds) : newIds.slice();
      out.push({ field: 'table_ids', from: oOrd, to: nOrd });
    } else out.push({ field: 'table_id', from: oldIds[0], to: newIds[0] });
  }
  if (oldLoc !== newLoc) out.push({ field: 'starts_at_local', from: oldLoc, to: newLoc });
  if (oldP !== newP) out.push({ field: 'party_size', from: oldP, to: newP });
  return out;
}
function checkExpectedRevision(b, cur) {
  if (b.expected_revision === undefined) return null;
  const v = b.expected_revision;
  if (typeof v === 'boolean' || typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { status: 422, code: 'validation_failed' };
  if (v !== cur) return { status: 409, code: 'stale_revision' };
  return null;
}
const fs = require('fs'), pathLib = require('path');
function serveUI(path, method, res) {
  if (method !== 'GET') return false;
  const pub = pathLib.join(__dirname, '..', 'public');
  if (['/', '/signup', '/login', '/lookup'].includes(path)) {
    try { const b = fs.readFileSync(pathLib.join(pub, 'index.html')); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': b.length }); res.end(b); } catch { res.writeHead(503); res.end('UI missing'); }
    return true;
  }
  if (path === '/styles.css' || path === '/app.js') {
    try { const b = fs.readFileSync(pathLib.join(pub, path.slice(1))); res.writeHead(200, { 'Content-Type': path.endsWith('.css') ? 'text/css' : 'text/javascript', 'Content-Length': b.length }); res.end(b); } catch { res.writeHead(404); res.end(''); }
    return true;
  }
  return false;
}
function validatePolicyBody(b, rest) {
  const keys = ['effective_from', 'slot_minutes', 'reservation_duration_minutes', 'cancellation_cutoff_minutes', 'opening_hours', 'capacities'];
  for (const k of keys) if (b[k] === undefined) return false;
  if (typeof b.effective_from !== 'string' || !parseDateStrict(b.effective_from)) return false;
  for (const k of ['slot_minutes', 'reservation_duration_minutes']) {
    const v = b[k];
    if (typeof v !== 'number' || typeof v === 'boolean' || !Number.isInteger(v) || v < 1 || v > 1440) return false;
  }
  {
    const v = b.cancellation_cutoff_minutes;
    if (typeof v !== 'number' || typeof v === 'boolean' || !Number.isInteger(v) || v < 0 || v > 10080) return false;
  }
  if (!Array.isArray(b.opening_hours)) return false;
  {
    const seen = new Set();
    const valid = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    for (const o of b.opening_hours) {
      if (typeof o !== 'object' || o === null || Array.isArray(o)) return false;
      if (!valid.has(o.weekday) || seen.has(o.weekday)) return false;
      seen.add(o.weekday);
      if (hm(o.opens) === null || hm(o.closes) === null) return false;
      if (hm(o.opens) >= hm(o.closes)) return false;
    }
  }
  if (typeof b.capacities !== 'object' || b.capacities === null || Array.isArray(b.capacities)) return false;
  {
    const tids = rest.tables.map(t => t.id).sort();
    const ck = Object.keys(b.capacities).sort();
    if (ck.length !== tids.length || !ck.every((v, i) => v === tids[i])) return false;
    for (const k of ck) {
      const v = b.capacities[k];
      if (typeof v !== 'number' || typeof v === 'boolean' || !Number.isInteger(v) || v < 1 || v > 100) return false;
    }
  }
  return true;
}
function parseInstantStrict(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], se = +m[6];
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || se > 59) return null;
  if (d < 1 || d > daysIn(y, mo)) return null;
  const off = (m[7][0] === '+' ? 1 : -1) * (parseInt(m[7].slice(1, 3), 10) * 60 + parseInt(m[7].slice(4, 6), 10));
  if (parseInt(m[7].slice(1, 3), 10) > 14) return null;
  return Date.UTC(y, mo - 1, d, h, mi, se) - off * 60000;
}
function optionList(rest, cfgTerms, party) {
  const opts = [];
  for (const t of rest.tables) {
    const cap = cfgTerms.capacities ? cfgTerms.capacities[t.id] : t.capacity;
    if (cap >= party) opts.push({ ids: [t.id], cap });
  }
  for (const p of (rest.combinable || [])) {
    const cap = (cfgTerms.capacities ? (cfgTerms.capacities[p[0]] + cfgTerms.capacities[p[1]]) : (rest.tables.find(x => x.id === p[0]).capacity + rest.tables.find(x => x.id === p[1]).capacity));
    if (cap >= party) opts.push({ ids: [p[0], p[1]], cap });
  }
  return opts;
}
function closureBlocksTable(rest, tid, startMs, durMin, extraFrom, extraTo, extraTable) {
  for (const c of (rest.closures || [])) {
    if (c.table_id === tid && overlap(startMs, durMin, c.fromMs, (c.toMs - c.fromMs) / 60000)) return true;
  }
  if (extraTable && tid === extraTable && overlap(startMs, durMin, extraFrom, (extraTo - extraFrom) / 60000)) return true;
  return false;
}
async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname, method = req.method;
  try {
    if (serveUI(path, method, res)) return;
    if (method === 'GET' && path === '/health') return send(res, 200, { status: 'ok' });
    if (method === 'POST' && path === '/_test/reset') {
      const raw = await readBody(req);
      let f; try { f = raw ? JSON.parse(raw) : {}; } catch { return err(res, 400, 'malformed_request'); }
      if (typeof f !== 'object' || f === null || Array.isArray(f)) return err(res, 400, 'malformed_request');
      const idOk = s => typeof s === 'string' && s.length >= 1 && s.length <= 64;
      const refOk = s => typeof s === 'string' && /^[A-Z0-9]{6,12}$/.test(s);
      for (const u of (f.users || [])) { if (!idOk(u.id)) return err(res, 422, 'validation_failed'); }
      for (const r of (f.restaurants || [])) {
        if (!idOk(r.id)) return err(res, 422, 'validation_failed');
        for (const t of (r.tables || [])) { if (!idOk(t.id)) return err(res, 422, 'validation_failed'); }
        if (r.combinable !== undefined) {
          if (!Array.isArray(r.combinable)) return err(res, 422, 'validation_failed');
          const tids = new Set((r.tables || []).map(t => t.id));
          for (const p of r.combinable) {
            if (!Array.isArray(p) || p.length !== 2) return err(res, 422, 'validation_failed');
            if (typeof p[0] !== 'string' || typeof p[1] !== 'string' || p[0] === p[1]) return err(res, 422, 'validation_failed');
            if (!tids.has(p[0]) || !tids.has(p[1])) return err(res, 422, 'validation_failed');
          }
        }
      }
      for (const r of (f.reservations || [])) {
        if (!idOk(r.id) || !refOk(r.reference) || !idOk(r.restaurant_id) || !idOk(r.user_id)) return err(res, 422, 'validation_failed');
        const hasS = r.table_id !== undefined, hasP = r.table_ids !== undefined;
        if ((hasS ? 1 : 0) + (hasP ? 1 : 0) !== 1) return err(res, 422, 'validation_failed');
        if (hasS && !idOk(r.table_id)) return err(res, 422, 'validation_failed');
        if (hasP) {
          if (!Array.isArray(r.table_ids) || r.table_ids.length < 1 || r.table_ids.length > 2) return err(res, 422, 'validation_failed');
          if (r.table_ids.some(t => !idOk(t)) || new Set(r.table_ids).size !== r.table_ids.length) return err(res, 422, 'validation_failed');
        }
        if (r.status !== undefined && r.status !== 'confirmed' && r.status !== 'cancelled') return err(res, 422, 'validation_failed');
      }
      const ns = fresh();
      for (const u of (f.users || [])) ns.users.push({ id: u.id, email: u.email, pw: hashPw(u.password), display_name: u.display_name, tokens: [] });
      for (const r of (f.restaurants || [])) {
        if (r.combinable === undefined) r.combinable = [];
        r.policies = []; r._pv = 0; r._rev = 0; r.closures = []; r.plans = []; r._planSeq = 1;
        r.manager_user_ids = Array.isArray(r.manager_user_ids) ? r.manager_user_ids : [];
        ns.restaurants.push(r);
      }
      for (const r of (f.reservations || [])) {
        const rest = ns.restaurants.find(x => x.id === r.restaurant_id);
        const p = parseLocalStrict(r.starts_at_local);
        const inst = p && rest ? resolveLocal(rest.timezone, p.y, p.mo, p.d, p.h, p.mi) : [];
        const ids = r.table_ids !== undefined ? r.table_ids : [r.table_id];
        const rr = { id: r.id, reference: r.reference, restaurant_id: r.restaurant_id, table_id: ids.length === 1 ? ids[0] : undefined, table_ids: ids, party_size: r.party_size, status: r.status || 'confirmed', starts_at_local: r.starts_at_local, startMs: inst.length ? inst[0] : 0, createdMs: Date.now(), user_id: r.user_id, revision: 1, history: [] };
        rr.accepted_terms = termsOf(policyZero(rest));
        rr.history.push({ seq: 1, at: fmtUTC(Date.now()), event: 'created', changes: createdChanges(canonPair(rest, ids), r.starts_at_local, r.party_size, ids.length === 2), revision: 1, accepted_terms: rr.accepted_terms });
        if (rr.status === 'cancelled') { rr.revision = 2; rr.history.push({ seq: 2, at: fmtUTC(Date.now()), event: 'cancelled', changes: [], revision: 2, accepted_terms: rr.accepted_terms }); }
        ns.reservations.push(rr);
      }
      S = ns;
      return send(res, 204, null);
    }
    if (method === 'GET' && path === '/_test/export') {
      const snap = JSON.parse(JSON.stringify({ users: S.users, restaurants: S.restaurants, reservations: S.reservations, series: S.series, idem: S.idem, seqUser: S.seqUser, seqRes: S.seqRes, seqSeries: S.seqSeries }));
      return send(res, 200, { track: 'tablekeeper', format_version: 1, state: snap });
    }
    if (method === 'POST' && path === '/_test/import') {
      const raw = await readBody(req);
      let b; try { b = JSON.parse(raw); } catch { return err(res, 400, 'malformed_request'); }
      if (!b || b.track !== 'tablekeeper' || b.format_version !== 1 || typeof b.state !== 'object' || !b.state) return err(res, 422, 'validation_failed');
      const st = b.state;
      if (!Array.isArray(st.users) || !Array.isArray(st.restaurants) || !Array.isArray(st.reservations)) return err(res, 422, 'validation_failed');
      for (const r of st.restaurants) {
        if (r.combinable === undefined) r.combinable = [];
        if (!Array.isArray(r.policies)) r.policies = [];
        if (typeof r._pv !== 'number') r._pv = (r.policies || []).reduce((m, p) => Math.max(m, p.policy_version || 0), 0);
        if (typeof r._rev !== 'number') r._rev = 0;
        if (!Array.isArray(r.closures)) r.closures = [];
        if (!Array.isArray(r.plans)) r.plans = [];
        if (typeof r._planSeq !== 'number') r._planSeq = r.plans.length + 1;
        if (!Array.isArray(r.manager_user_ids)) r.manager_user_ids = [];
      }
      for (const r of st.reservations) {
        if (r.table_ids === undefined && r.table_id !== undefined) r.table_ids = [r.table_id];
        const rest = st.restaurants.find(x => x.id === r.restaurant_id);
        if (typeof r.revision !== 'number') r.revision = 1;
        if (!r.accepted_terms && rest) r.accepted_terms = termsOf(policyZero(rest));
        if (!Array.isArray(r.history) && rest) {
          r.history = [{ seq: 1, at: fmtUTC(r.createdMs || Date.now()), event: 'created', changes: createdChanges(canonPair(rest, r.table_ids || [r.table_id]), r.starts_at_local, r.party_size, (r.table_ids || []).length === 2), revision: 1, accepted_terms: r.accepted_terms }];
          if (r.status === 'cancelled') r.history.push({ seq: 2, at: fmtUTC(Date.now()), event: 'cancelled', changes: [], revision: r.revision, accepted_terms: r.accepted_terms });
        }
      }
      S = { users: st.users, restaurants: st.restaurants, reservations: st.reservations, series: Array.isArray(st.series) ? st.series : [], idem: st.idem || {}, seqUser: st.seqUser || 1, seqRes: st.seqRes || 1, seqSeries: st.seqSeries || 1 };
      return send(res, 204, null);
    }
    if (method === 'POST' && (path === '/auth/signup' || path === '/auth/login')) {
      const raw = await readBody(req);
      let b; try { b = JSON.parse(raw || '{}'); } catch { return err(res, 400, 'malformed_request'); }
      if (typeof b !== 'object' || b === null || Array.isArray(b)) return err(res, 400, 'malformed_request');
      if (path === '/auth/signup') {
        const { email, password, display_name } = b;
        if (typeof email !== 'string' || typeof password !== 'string' || typeof display_name !== 'string') return err(res, 400, 'malformed_request');
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
      const m = /^\/restaurants\/([^/]+)\/policies$/.exec(path);
      if (m) {
        const rest = getRest(decodeURIComponent(m[1]));
        if (method === 'GET') {
          if (!rest) return err(res, 404, 'not_found');
          return send(res, 200, { policies: (rest.policies || []).map(p => ({ policy_version: p.policy_version, effective_from: p.effective_from, slot_minutes: p.slot_minutes, reservation_duration_minutes: p.reservation_duration_minutes, cancellation_cutoff_minutes: p.cancellation_cutoff_minutes, opening_hours: p.opening_hours, capacities: p.capacities })) });
        }
        if (method === 'POST') {
          if (!rest) return err(res, 404, 'not_found');
          const u = authUser(req); if (!u) return err(res, 401, 'unauthenticated');
          if (!(rest.manager_user_ids || []).includes(u.id)) return err(res, 403, 'forbidden');
          const key = req.headers['idempotency-key'];
          if (key === undefined || key === null || String(key).length === 0) return err(res, 400, 'missing_idempotency_key');
          if (String(key).length > 255) return err(res, 422, 'validation_failed');
          const raw = await readBody(req);
          let b; try { b = raw ? JSON.parse(raw) : undefined; } catch { return err(res, 400, 'malformed_request'); }
          if (typeof b !== 'object' || b === null || Array.isArray(b)) return err(res, 400, 'malformed_request');
          return withLock(async () => {
            const uk = (S.idem[u.id] ||= {});
            const cb = canon(b);
            const e = uk[key];
            if (e && e.method === 'POST' && e.path === path && e.body === cb) {
              if (e.status >= 400) { delete uk[key]; }
              else return send(res, 200, e.resp);
            } else if (e && e.method === 'POST' && e.path === path && e.body !== cb) return err(res, 409, 'idempotency_key_reuse');
            else if (e && e.status >= 400) { delete uk[key]; }
            if (!validatePolicyBody(b, rest)) {
              const o = { error: { code: 'validation_failed', message: 'validation_failed' } };
              uk[key] = { method: 'POST', path, body: cb, status: 422, resp: o, fail: true };
              return send(res, 422, o);
            }
            rest._pv = (rest._pv || 0) + 1;
            rest._rev = (rest._rev || 0) + 1;
            const p = { policy_version: rest._pv, effective_from: b.effective_from, slot_minutes: b.slot_minutes, reservation_duration_minutes: b.reservation_duration_minutes, cancellation_cutoff_minutes: b.cancellation_cutoff_minutes, opening_hours: b.opening_hours, capacities: b.capacities };
            (rest.policies ||= []).push(p);
            const o = { ...p };
            uk[key] = { method: 'POST', path, body: cb, status: 201, resp: o };
            return send(res, 201, o);
          });
        }
      }
    }
    {
      const m = /^\/restaurants\/([^/]+)$/.exec(path);
      if (method === 'GET' && m) { const r = getRest(decodeURIComponent(m[1])); if (!r) return err(res, 404, 'not_found'); const { policies, _pv, _rev, manager_user_ids, ...pub } = r; return send(res, 200, pub); }
    }
    if (method === 'GET' && path === '/availability') {
      const rid = url.searchParams.get('restaurant_id'), date = url.searchParams.get('date'), psRaw = url.searchParams.get('party_size');
      const exRaw = url.searchParams.get('explain');
      if (!rid || !date || psRaw === null) return err(res, 422, 'validation_failed');
      if (exRaw !== null && exRaw !== 'true') return err(res, 422, 'validation_failed');
      if (!/^[0-9]+$/.test(psRaw)) return err(res, 422, 'validation_failed');
      const ps = parseInt(psRaw, 10);
      if (ps < 1) return err(res, 422, 'validation_failed');
      const rest = getRest(rid); if (!rest) return err(res, 404, 'not_found');
      const dp = parseDateStrict(date); if (!dp) return err(res, 422, 'validation_failed');
      const cfg = selectPolicy(rest, date);
      const slots = slotList(rest, date, dp.y, dp.mo, dp.d, cfg).map(s => {
        const availSingles = rest.tables.filter(t => (cfg.capacities[t.id] >= ps) && !tableBusy(rest, t.id, s.ms, cfg.reservation_duration_minutes, null)).map(t => t.id);
        const opts = rest.tables.filter(t => (cfg.capacities[t.id] >= ps) && !tableBusy(rest, t.id, s.ms, cfg.reservation_duration_minutes, null)).map(t => ({ table_ids: [t.id], capacity: cfg.capacities[t.id] }));
        for (const p of (rest.combinable || [])) {
          if (comboCapCfg(cfg, rest, p) >= ps && !setBusy(rest, p, s.ms, cfg.reservation_duration_minutes, null)) opts.push({ table_ids: [p[0], p[1]], capacity: comboCapCfg(cfg, rest, p) });
        }
        const slot = { starts_at_local: s.loc, starts_at: fmtRFC(rest.timezone, s.ms), available_table_ids: availSingles, available_options: opts };
        if (exRaw === 'true') {
          slot.explain = rest.tables.map(t => {
            const capHolds = cfg.capacities[t.id] >= ps;
            const ovHolds = !tableBusy(rest, t.id, s.ms, cfg.reservation_duration_minutes, null);
            const av = capHolds && ovHolds;
            return { table_id: t.id, policy_version: cfg.policy_version, available: av, rules: [{ rule: 'capacity', holds: capHolds }, { rule: 'no_overlap', holds: ovHolds }] };
          });
        }
        return slot;
      });
      return send(res, 200, { restaurant_id: rid, date, timezone: rest.timezone, slots });
    }
    if (method === 'POST' && (path === '/reservations' || path === '/reservation-moves' || path === '/series')) {
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
          if (e.status >= 400) { delete uk[key]; }
          else return send(res, 200, e.resp);
        } else if (e && e.method === method && e.path === path && e.body !== cb) return err(res, 409, 'idempotency_key_reuse');
        else if (e && e.status >= 400) { delete uk[key]; }
        const finish = (status, obj) => { uk[key] = { method, path, body: cb, status: 201, resp: obj }; send(res, status, obj); };
        const fail = (status, code) => { const o = { error: { code, message: code } }; uk[key] = { method, path, body: cb, status, resp: o, fail: true }; send(res, status, o); };
        if (path === '/reservations') return createRes(b, u, finish, fail);
        if (path === '/series') return createSeries(b, u, finish, fail, path);
        return doMoves(b, u, finish, fail);
      });
    }
    {
      const m = /^\/series\/([^/]+)$/.exec(path);
      if (method === 'GET' && m) {
        const u = authUser(req);
        const s = S.series.find(x => x.series_id === decodeURIComponent(m[1]));
        if (!s || !u || s.user_id !== u.id) return err(res, 404, 'not_found');
        return send(res, 200, seriesShape(s));
      }
    }
    const needAuth = () => { const u = authUser(req); if (!u) { err(res, 401, 'unauthenticated'); return null; } return u; };
    if (method === 'GET' && path === '/reservations') {
      const u = needAuth(); if (!u) return;
      const list = S.reservations.filter(r => r.user_id === u.id).sort((a, b) => b.startMs - a.startMs).map(resShape);
      return send(res, 200, { reservations: list });
    }
    {
      const m = /^\/reservations\/([^/]+)\/history$/.exec(path);
      if (method === 'GET' && m) {
        const u = authUser(req);
        const r = S.reservations.find(x => x.reference === decodeURIComponent(m[1]));
        if (!r || !u || r.user_id !== u.id) return err(res, 404, 'not_found');
        return send(res, 200, { reference: r.reference, entries: (r.history || []).map(h => ({ seq: h.seq, at: h.at, event: h.event, changes: h.changes, revision: h.revision, accepted_terms: h.accepted_terms })) });
      }
    }
    {
      const m = /^\/reservations\/([^/]+)\/decision$/.exec(path);
      if (method === 'GET' && m) {
        const u = authUser(req);
        const r = S.reservations.find(x => x.reference === decodeURIComponent(m[1]));
        if (!r || !u || r.user_id !== u.id) return err(res, 404, 'not_found');
        return send(res, 200, { reference: r.reference, revision: r.revision, accepted_terms: r.accepted_terms });
      }
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
          if (r.status === 'cancelled') return send(res, 200, resShape(r));
          if (cutoffPassed(r.accepted_terms.cancellation_cutoff_minutes, r.startMs)) return err(res, 409, 'cutoff_passed');
          r.status = 'cancelled';
          r.revision += 1;
          getRest(r.restaurant_id)._rev = (getRest(r.restaurant_id)._rev || 0) + 1;
          pushHistory(r, 'cancelled', []);
          bumpSeriesFor(r.id, false, true);
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
          const rr = applyPatch(r, b);
          if (rr.status) return err(res, rr.status, rr.code);
          return send(res, 200, resShape(r));
        });
      }
    }
    {
      const mA = /^\/restaurants\/([^/]+)\/replans\/([^/]+)\/apply$/.exec(path);
      if (method === 'POST' && mA) {
        const rest = getRest(decodeURIComponent(mA[1]));
        if (!rest) return err(res, 404, 'not_found');
        const u = needAuth(); if (!u) return;
        if (!(rest.manager_user_ids || []).includes(u.id)) return err(res, 403, 'forbidden');
        const key = req.headers['idempotency-key'];
        if (key === undefined || key === null || String(key).length === 0) return err(res, 400, 'missing_idempotency_key');
        if (String(key).length > 255) return err(res, 422, 'validation_failed');
        const raw = await readBody(req);
        let b; try { b = raw ? JSON.parse(raw) : undefined; } catch { return err(res, 400, 'malformed_request'); }
        if (typeof b !== 'object' || b === null || Array.isArray(b)) return err(res, 400, 'malformed_request');
        return withLock(async () => {
          const plan = (rest.plans || []).find(p => p.plan_id === decodeURIComponent(mA[2]));
          if (!plan) return err(res, 404, 'not_found');
          const uk = (S.idem[u.id] ||= {});
          const cb = canon(b);
          const e = uk[key];
          if (plan.applied) {
            if (e && e.method === 'POST' && e.path === path && e.body === cb && e.status < 400) return send(res, 200, e.resp);
            return err(res, 409, 'plan_already_applied');
          }
          if (e && e.method === 'POST' && e.path === path && e.body === cb) {
            if (e.status >= 400) { delete uk[key]; }
            else return send(res, 200, e.resp);
          } else if (e && e.method === 'POST' && e.path === path && e.body !== cb) return err(res, 409, 'idempotency_key_reuse');
          else if (e && e.status >= 400) { delete uk[key]; }
          if ((rest._rev || 0) !== plan.revAtPreview) return err(res, 409, 'stale_plan');
          // atomic apply
          (rest.closures ||= []).push({ table_id: plan.closure.table_id, from: plan.closure.from, to: plan.closure.to, fromMs: plan.fromMs, toMs: plan.toMs });
          const byRef = {};
          for (const a of plan.assignments) byRef[a.reference] = a.table_ids;
          const affectedSeries = new Set();
          const cons = [];
          for (const a of plan.assignments) {
            const r = S.reservations.find(x => x.reference === a.reference);
            cons.push(r);
            const cur = resTables(r);
            if (!sameSet(cur, a.table_ids)) {
              const pairInv = cur.length === 2 || a.table_ids.length === 2;
              const ch = pairInv ? [{ field: 'table_ids', from: canonPair(rest, cur.length === 2 ? cur : cur), to: a.table_ids.length === 2 ? canonPair(rest, a.table_ids) : a.table_ids }] : [{ field: 'table_id', from: cur[0], to: a.table_ids[0] }];
              r.table_ids = a.table_ids.slice(); r.table_id = a.table_ids.length === 1 ? a.table_ids[0] : undefined;
              r.revision += 1;
              const seq = (r.history || []).length + 1;
              (r.history ||= []).push({ seq, at: fmtUTC(Date.now()), event: 'reassigned', changes: ch, plan_id: plan.plan_id, revision: r.revision, accepted_terms: r.accepted_terms });
              for (const s of S.series) if (s.occurrences.some(o => o.reservation_id === r.id)) affectedSeries.add(s);
            }
          }
          rest._rev = (rest._rev || 0) + 1;
          for (const s of affectedSeries) s.revision += 1;
          plan.applied = true;
          const o = { plan_id: plan.plan_id, restaurant_revision: rest._rev, reservations: cons.map(resShape) };
          uk[key] = { method: 'POST', path, body: cb, status: 201, resp: o };
          plan.applyResp = o;
          return send(res, 201, o);
        });
      }
      const mP = /^\/restaurants\/([^/]+)\/replans$/.exec(path);
      if (method === 'POST' && mP) {
        const rest = getRest(decodeURIComponent(mP[1]));
        if (!rest) return err(res, 404, 'not_found');
        const u = needAuth(); if (!u) return;
        if (!(rest.manager_user_ids || []).includes(u.id)) return err(res, 403, 'forbidden');
        const key = req.headers['idempotency-key'];
        if (key === undefined || key === null || String(key).length === 0) return err(res, 400, 'missing_idempotency_key');
        if (String(key).length > 255) return err(res, 422, 'validation_failed');
        const raw = await readBody(req);
        let b; try { b = raw ? JSON.parse(raw) : undefined; } catch { return err(res, 400, 'malformed_request'); }
        if (typeof b !== 'object' || b === null || Array.isArray(b)) return err(res, 400, 'malformed_request');
        return withLock(async () => {
          const uk = (S.idem[u.id] ||= {});
          const cb = canon(b);
          const e = uk[key];
          if (e && e.method === 'POST' && e.path === path && e.body === cb) {
            if (e.status >= 400) { delete uk[key]; }
            else return send(res, 200, e.resp);
          } else if (e && e.method === 'POST' && e.path === path && e.body !== cb) return err(res, 409, 'idempotency_key_reuse');
          else if (e && e.status >= 400) { delete uk[key]; }
          const fail = (status, code) => { const o = { error: { code, message: code } }; uk[key] = { method: 'POST', path, body: cb, status, resp: o, fail: true }; send(res, status, o); };
          if (typeof b.table_id !== 'string') {
            if (b.table_id === undefined) return fail(422, 'validation_failed');
            return err(res, 400, 'malformed_request');
          }
          if (!rest.tables.some(t => t.id === b.table_id)) return err(res, 404, 'not_found');
          const fMs = parseInstantStrict(b.from), tMs = parseInstantStrict(b.to);
          if (fMs === null || tMs === null || !(fMs < tMs)) return fail(422, 'validation_failed');
          const durOf = r => resDur(r);
          const considered = S.reservations.filter(r => r.restaurant_id === rest.id && r.status === 'confirmed' && (r.startMs < tMs && fMs < r.startMs + durOf(r) * 60000)).sort((a, b2) => a.reference < b2.reference ? -1 : 1);
          if (rest.tables.length > 6 || (rest.combinable || []).length > 4 || considered.length > 6) return fail(422, 'planning_limit');
          // build options
          const infos = considered.map(r => {
            const terms = r.accepted_terms;
            const opts = optionList(rest, terms, r.party_size).filter(o => {
              for (const tid of o.ids) if (closureBlocksTable(rest, tid, r.startMs, durOf(r), fMs, tMs, b.table_id)) return false;
              // fixed bookings conflict
              for (const o2 of S.reservations) {
                if (o2.status !== 'confirmed' || o2.id === r.id || o2.restaurant_id !== rest.id) continue;
                if (considered.some(c => c.id === o2.id)) continue;
                if (!o2.table_ids && !o2.table_id) continue;
                const ot = resTables(o2);
                if (!ot.some(t => o.ids.includes(t))) continue;
                if (overlap(r.startMs, durOf(r), o2.startMs, resDur(o2))) return false;
              }
              return true;
            });
            return { r, opts, cur: resTables(r) };
          });
          // DFS search
          let best = null;
          const chosen = new Array(infos.length);
          const capOf = (info, o) => o.cap;
          function isBetter(cand, cur) {
            if (!cur) return true;
            if (cand.moved !== cur.moved) return cand.moved < cur.moved;
            if (cand.unused !== cur.unused) return cand.unused < cur.unused;
            for (let i = 0; i < cand.ranks.length; i++) if (cand.ranks[i] !== cur.ranks[i]) return cand.ranks[i] < cur.ranks[i];
            return false;
          }
          function dfs(i, moved, unused, ranks) {
            if (best && moved > best.moved) return;
            if (i === infos.length) {
              const cand = { moved, unused, ranks: ranks.slice(), pick: chosen.slice() };
              if (isBetter(cand, best)) best = cand;
              return;
            }
            const info = infos[i];
            for (let k = 0; k < info.opts.length; k++) {
              const o = info.opts[k];
              // pairwise conflict with chosen
              let ok = true;
              for (let j = 0; j < i; j++) {
                const oj = infos[j].opts[chosen[j]];
                if (oj.ids.some(t => o.ids.includes(t)) && overlap(info.r.startMs, durOf(info.r), infos[j].r.startMs, durOf(infos[j].r))) { ok = false; break; }
              }
              if (!ok) continue;
              const ch = !sameSet(o.ids, info.cur);
              chosen[i] = k;
              ranks[i] = k;
              dfs(i + 1, moved + (ch ? 1 : 0), unused + (o.cap - info.r.party_size), ranks);
            }
          }
          // if any booking has zero options -> infeasible
          if (infos.some(x => !x.opts.length)) {
            const o = { error: { code: 'no_feasible_plan', message: 'no_feasible_plan' } };
            uk[key] = { method: 'POST', path, body: cb, status: 409, resp: o, fail: true };
            return send(res, 409, o);
          }
          dfs(0, 0, 0, new Array(infos.length).fill(0));
          if (!best) {
            const o = { error: { code: 'no_feasible_plan', message: 'no_feasible_plan' } };
            uk[key] = { method: 'POST', path, body: cb, status: 409, resp: o, fail: true };
            return send(res, 409, o);
          }
          const pid = 'plan_' + (rest._planSeq++);
          const assignments = infos.map((info, i) => {
            const o = info.opts[best.pick[i]];
            return { reference: info.r.reference, table_ids: o.ids.slice(), changed: !sameSet(o.ids, info.cur) };
          });
          const plan = { plan_id: pid, restaurant_id: rest.id, revAtPreview: (rest._rev || 0), closure: { table_id: b.table_id, from: b.from, to: b.to }, fromMs: fMs, toMs: tMs, assignments, moved_count: best.moved, unused_seats: best.unused, applied: false };
          (rest.plans ||= []).push(plan);
          const o = { plan_id: pid, restaurant_revision: (rest._rev || 0), closure: { table_id: b.table_id, from: b.from, to: b.to }, assignments, moved_count: best.moved, unused_seats: best.unused };
          uk[key] = { method: 'POST', path, body: cb, status: 201, resp: o };
          return send(res, 201, o);
        });
      }
    }
    {
      const mS = /^\/series\/([^/]+)\/amend$/.exec(path);
      if (method === 'POST' && mS) {
        const raw = await readBody(req);
        let b; try { b = raw ? JSON.parse(raw) : undefined; } catch { return err(res, 400, 'malformed_request'); }
        if (typeof b !== 'object' || b === null || Array.isArray(b)) return err(res, 400, 'malformed_request');
        const u = authUser(req); if (!u) return err(res, 401, 'unauthenticated');
        const key = req.headers['idempotency-key'];
        if (key === undefined || key === null || String(key).length === 0) return err(res, 400, 'missing_idempotency_key');
        if (String(key).length > 255) return err(res, 422, 'validation_failed');
        return withLock(async () => {
          const s = S.series.find(x => x.series_id === decodeURIComponent(mS[1]));
          if (!s || s.user_id !== u.id) return err(res, 404, 'not_found');
          const uk = (S.idem[u.id] ||= {});
          const cb = canon(b);
          const e = uk[key];
          if (e && e.method === 'POST' && e.path === path && e.body === cb) {
            if (e.status >= 400) { delete uk[key]; }
            else return send(res, 200, e.resp);
          } else if (e && e.method === 'POST' && e.path === path && e.body !== cb) return err(res, 409, 'idempotency_key_reuse');
          else if (e && e.status >= 400) { delete uk[key]; }
          const fail = (status, code) => { const o = { error: { code, message: code } }; uk[key] = { method: 'POST', path, body: cb, status, resp: o, fail: true }; send(res, status, o); };
          const isInt = v => typeof v === 'number' && Number.isInteger(v);
          if (!isInt(b.expected_revision) || b.expected_revision < 1) return fail(422, 'validation_failed');
          if (!isInt(b.from_index) || b.from_index < 0 || b.from_index > s.occurrences.length - 1) return fail(422, 'validation_failed');
          if (typeof b.local_time !== 'string' || !/^(\d{2}):(\d{2})$/.test(b.local_time)) return fail(422, 'validation_failed');
          const hh = +b.local_time.slice(0, 2), mm = +b.local_time.slice(3, 5);
          if (hh > 23 || mm > 59) return fail(422, 'validation_failed');
          if (b.expected_revision !== s.revision) return fail(409, 'stale_revision');
          const rest = getRest(s.restaurant_id);
          const occByIdx = [...s.occurrences].sort((a, c) => a.index - c.index);
          const elig = occByIdx.filter(o => o.index >= b.from_index && !o.exception && (S.reservations.find(r => r.id === o.reservation_id) || {}).status !== 'cancelled');
          // compute plans
          const plans = [];
          for (const o of elig) {
            const r = S.reservations.find(x => x.id === o.reservation_id);
            const sched = o.schedDate || r.starts_at_local.slice(0, 10);
            const nl = `${sched}T${b.local_time}`;
            if (nl === r.starts_at_local) { plans.push({ o, r, noop: true }); continue; }
            plans.push({ o, r, noop: false, nl, sched });
          }
          // validate each real change; collect errors
          const nonOcc = [], occConf = [];
          const targets = [];
          for (const p of plans) {
            if (p.noop) continue;
            const { r, nl, sched } = p;
            if (cutoffPassed(r.accepted_terms.cancellation_cutoff_minutes, r.startMs)) { nonOcc.push({ idx: p.o.index, status: 409, code: 'cutoff_passed' }); continue; }
            const dp = parseLocalStrict(nl);
            if (!dp) { nonOcc.push({ idx: p.o.index, status: 422, code: 'validation_failed' }); continue; }
            const cfg = selectPolicy(rest, sched);
            const ids = resTables(r);
            const cap = comboCapCfg(cfg, rest, ids);
            if (r.party_size > cap) { nonOcc.push({ idx: p.o.index, status: 422, code: 'party_exceeds_capacity' }); continue; }
            const inst = resolveLocal(rest.timezone, dp.y, dp.mo, dp.d, dp.h, dp.mi);
            if (!inst.length) { nonOcc.push({ idx: p.o.index, status: 422, code: 'invalid_local_time' }); continue; }
            const wd = weekdayLocal(rest.timezone, dp.y, dp.mo, dp.d);
            const oh = cfg.opening_hours.find(x => x.weekday === wd);
            const tmin = dp.h * 60 + dp.mi;
            if (!oh || tmin < hm(oh.opens) || tmin + cfg.reservation_duration_minutes > hm(oh.closes)) { nonOcc.push({ idx: p.o.index, status: 422, code: 'outside_opening_hours' }); continue; }
            if ((tmin - hm(oh.opens)) % cfg.slot_minutes !== 0) { nonOcc.push({ idx: p.o.index, status: 422, code: 'not_on_slot_grid' }); continue; }
            p.cfg = cfg; p.startMs = inst[0];
            targets.push(p);
          }
          if (nonOcc.length) { nonOcc.sort((a, c) => a.idx - c.idx); return fail(nonOcc[0].status, nonOcc[0].code); }
          // occupancy: conflicts with unchanged occurrences, other bookings, closures
          const eligIds = new Set(elig.map(o => o.reservation_id));
          const allOccRes = s.occurrences.map(o => S.reservations.find(x => x.id === o.reservation_id));
          for (const p of targets) {
            const ids = resTables(p.r);
            if (setBusy(rest, ids, p.startMs, p.cfg.reservation_duration_minutes, p.r.id)) {
              // check if blocker is within eligible moving set (would move away) — still conflict per spec? Spec says must not conflict with unchanged occurrences, other bookings or closures. Moving targets among themselves could share tables at different times; setBusy includes other targets' old positions which is wrong. Do precise check:
            }
          }
          // precise occupancy check
          let conflict = false;
          for (const p of targets) {
            const ids = resTables(p.r);
            // closures
            for (const tid of ids) if (closureBlocksTable(rest, tid, p.startMs, p.cfg.reservation_duration_minutes, 0, 0, null)) { conflict = true; break; }
            if (conflict) break;
            // other bookings + unchanged occurrences (non-eligible or noop or other series)
            for (const o2 of S.reservations) {
              if (o2.status !== 'confirmed' || o2.id === p.r.id || o2.restaurant_id !== rest.id) continue;
              // if o2 is another target, use its new position
              const t2 = targets.find(t => t.r.id === o2.id);
              const o2ms = t2 ? t2.startMs : o2.startMs;
              const o2dur = t2 ? t2.cfg.reservation_duration_minutes : resDur(o2);
              if (!resTables(o2).some(t => ids.includes(t))) continue;
              if (overlap(p.startMs, p.cfg.reservation_duration_minutes, o2ms, o2dur)) { conflict = true; break; }
            }
            if (conflict) break;
          }
          if (conflict) return fail(409, 'table_unavailable');
          let anyReal = false;
          for (const p of targets) {
            const r = p.r;
            const oldLoc = r.starts_at_local;
            const changes = [{ field: 'starts_at_local', from: oldLoc, to: p.nl }];
            r.starts_at_local = p.nl; r.startMs = p.startMs;
            r.accepted_terms = termsOf(p.cfg);
            r.revision += 1;
            anyReal = true;
            pushHistory(r, 'changed', changes);
          }
          // correct change entries (need old loc)
          if (anyReal) { s.revision += 1; rest._rev = (rest._rev || 0) + 1; }
          const o = seriesShape(s);
          uk[key] = { method: 'POST', path, body: cb, status: 201, resp: o };
          return send(res, 201, o);
        });
      }
    }
    return err(res, 404, 'not_found');
  } catch (e) { return err(res, 500, 'internal'); }
}
function applyPatch(r, b) {
  if (r.status === 'cancelled') return { status: 409, code: 'reservation_cancelled' };
  const rest = getRest(r.restaurant_id);
  const er = checkExpectedRevision(b, r.revision);
  if (er) return er;
  if (cutoffPassed(r.accepted_terms.cancellation_cutoff_minutes, r.startMs)) return { status: 409, code: 'cutoff_passed' };
  const hasS = b.table_id !== undefined, hasP = b.table_ids !== undefined;
  if (hasS && hasP) return { status: 422, code: 'validation_failed' };
  const cur = resTables(r);
  let nt = hasS ? b.table_id : (hasP ? b.table_ids : cur);
  const ntArr = hasS ? [nt] : (Array.isArray(nt) ? nt.slice() : nt);
  const nl = b.starts_at_local !== undefined ? b.starts_at_local : r.starts_at_local;
  const np = b.party_size !== undefined ? b.party_size : r.party_size;
  if (hasS && typeof b.table_id !== 'string') return { status: 400, code: 'malformed_request' };
  if (hasP && !Array.isArray(b.table_ids)) return { status: 400, code: 'malformed_request' };
  if (b.starts_at_local !== undefined && typeof b.starts_at_local !== 'string') return { status: 400, code: 'malformed_request' };
  if (b.party_size !== undefined && (typeof b.party_size === 'string' || typeof b.party_size === 'boolean' || b.party_size === null)) return { status: 422, code: 'validation_failed' };
  if (b.party_size !== undefined && typeof b.party_size !== 'number') return { status: 400, code: 'malformed_request' };
  let ntCanon = Array.isArray(ntArr) ? ntArr.slice() : ntArr;
  if (Array.isArray(ntCanon) && ntCanon.length === 2) {
    const cp = canonPair(rest, ntCanon);
    if (sameSet(cp, ntCanon)) ntCanon = cp;
  }
  const noTableChange = sameSet(Array.isArray(ntCanon) ? ntCanon : [ntCanon], cur);
  const isNoop = noTableChange && nl === r.starts_at_local && np === r.party_size;
  if (isNoop) return {};
  const cfg = selectPolicy(rest, (typeof nl === 'string' ? nl : r.starts_at_local).slice(0, 10));
  const c = checkBooking(rest, cfg, Array.isArray(ntCanon) ? ntCanon : [ntCanon], nl, np, r.id);
  if (c.status) return c;
  const changes = changedFields(rest, cur, Array.isArray(ntCanon) ? ntCanon : [ntCanon], r.starts_at_local, nl, r.party_size, np);
  if (!changes.length) return {};
  const finalIds = Array.isArray(ntCanon) ? ntCanon : [ntCanon];
  r.table_ids = finalIds; r.table_id = finalIds.length === 1 ? finalIds[0] : undefined;
  r.starts_at_local = nl; r.party_size = np; r.startMs = c.startMs;
  r.accepted_terms = termsOf(cfg);
  r.revision += 1;
  const rest2 = getRest(r.restaurant_id);
  rest2._rev = (rest2._rev || 0) + 1;
  pushHistory(r, 'changed', changes);
  bumpSeriesFor(r.id, true, false);
  return {};
}
function bumpSeriesFor(resId, exception, cancel) {
  for (const s of S.series) {
    const occ = s.occurrences.find(o => o.reservation_id === resId);
    if (occ) {
      if (cancel) { if (!occ._cancelCounted) { s.revision += 1; occ._cancelCounted = true; } }
      else if (exception) { occ.exception = true; s.revision += 1; }
    }
  }
}
function seriesShape(s) {
  return { series_id: s.series_id, revision: s.revision, interval_weeks: s.interval_weeks, occurrences: s.occurrences.map(o => { const r = S.reservations.find(x => x.id === o.reservation_id); return { index: o.index, reference: r.reference, exception: !!o.exception, reservation: resShape(r) }; }) };
}
function createRes(b, u, finish, fail) {
  const { restaurant_id, table_id, table_ids, starts_at_local, party_size } = b;
  if (table_id !== undefined && table_ids !== undefined) return fail(422, 'validation_failed');
  const ids = table_id !== undefined ? [table_id] : table_ids;
  if (restaurant_id === undefined || ids === undefined || starts_at_local === undefined || party_size === undefined) return fail(422, 'validation_failed');
  if (typeof restaurant_id !== 'string') return fail(400, 'malformed_request');
  if (table_id !== undefined && typeof table_id !== 'string') return fail(400, 'malformed_request');
  if (table_ids !== undefined && !Array.isArray(table_ids)) return fail(400, 'malformed_request');
  if (typeof starts_at_local !== 'string') return fail(400, 'malformed_request');
  if (typeof party_size === 'string' || typeof party_size === 'boolean' || party_size === null) return fail(422, 'validation_failed');
  if (typeof party_size !== 'number') return fail(400, 'malformed_request');
  const rest = getRest(restaurant_id);
  if (!rest) return fail(404, 'not_found');
  const idsC = Array.isArray(ids) ? ids.slice() : ids;
  const idsF = Array.isArray(idsC) && idsC.length === 2 ? canonPair(rest, idsC) : idsC;
  const cfg = selectPolicy(rest, starts_at_local.slice(0, 10));
  const c = checkBooking(rest, cfg, idsF, starts_at_local, party_size, null);
  if (c.status) return fail(c.status, c.code);
  const r = { id: 'res_' + (S.seqRes++), reference: newRef(), restaurant_id, table_id: idsF.length === 1 ? idsF[0] : undefined, table_ids: idsF, party_size, status: 'confirmed', starts_at_local, startMs: c.startMs, createdMs: Date.now(), user_id: u.id, revision: 1, history: [] };
  r.accepted_terms = termsOf(cfg);
  S.reservations.push(r);
  rest._rev = (rest._rev || 0) + 1;
  pushHistory(r, 'created', createdChanges(idsF, starts_at_local, party_size, idsF.length === 2));
  return finish(201, resShape(r));
}
function createSeries(b, u, finish, fail, path) {
  const { anchor_reference, count, interval_weeks } = b;
  if (typeof anchor_reference !== 'string') return fail(typeof anchor_reference === 'string' ? 422 : 400, anchor_reference === undefined ? 'validation_failed' : 'malformed_request');
  for (const [k, lo, hi] of [['count', 2, 12], ['interval_weeks', 1, 4]]) {
    const v = b[k];
    if (typeof v === 'boolean' || typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) return fail(422, 'validation_failed');
  }
  const anchor = S.reservations.find(x => x.reference === anchor_reference);
  if (!anchor || anchor.user_id !== u.id) return fail(404, 'not_found');
  if (anchor.status === 'cancelled') return fail(409, 'reservation_cancelled');
  if (S.series.some(s => s.occurrences.some(o => o.reservation_id === anchor.id))) return fail(409, 'already_in_series');
  if (cutoffPassed(anchor.accepted_terms.cancellation_cutoff_minutes, anchor.startMs)) return fail(409, 'cutoff_passed');
  const rest = getRest(anchor.restaurant_id);
  const ap = parseLocalStrict(anchor.starts_at_local);
  const aDate = new Date(Date.UTC(ap.y, ap.mo - 1, ap.d));
  const pad = n => String(n).padStart(2, '0');
  const anchorIds = resTables(anchor).slice();
  const plans = [];
  for (let i = 1; i < count; i++) {
    const dt = new Date(aDate.getTime() + i * interval_weeks * 7 * 86400000);
    const ds = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    const loc = `${ds}T${pad(ap.h)}:${pad(ap.mi)}`;
    const cfg = selectPolicy(rest, ds);
    const idsC = anchorIds.length === 2 ? canonPair(rest, anchorIds) : anchorIds.slice();
    const c = checkBooking(rest, cfg, idsC, loc, anchor.party_size, null);
    if (c.status) return fail(c.status, c.code);
    plans.push({ loc, cfg, c, ids: idsC });
  }
  const sid = 'ser_' + (S.seqSeries++);
  const occs = [{ index: 0, reservation_id: anchor.id, exception: false, schedDate: anchor.starts_at_local.slice(0, 10) }];
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    const r = { id: 'res_' + (S.seqRes++), reference: newRef(), restaurant_id: rest.id, table_id: p.ids.length === 1 ? p.ids[0] : undefined, table_ids: p.ids, party_size: anchor.party_size, status: 'confirmed', starts_at_local: p.loc, startMs: p.c.startMs, createdMs: Date.now(), user_id: u.id, revision: 1, history: [] };
    r.accepted_terms = termsOf(p.cfg);
    S.reservations.push(r);
    pushHistory(r, 'created', createdChanges(p.ids, p.loc, anchor.party_size, p.ids.length === 2));
    occs.push({ index: i + 1, reservation_id: r.id, exception: false, schedDate: p.loc.slice(0, 10) });
  }
  const s = { series_id: sid, revision: 1, interval_weeks, user_id: u.id, restaurant_id: rest.id, occurrences: occs };
  S.series.push(s);
  rest._rev = (rest._rev || 0) + 1;
  return finish(201, seriesShape(s));
}
function doMoves(b, u, finish, fail) {
  const moves = b.moves;
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > 8) return fail(422, 'validation_failed');
  const refs = moves.map(m => m && m.reference);
  if (refs.some(r => typeof r !== 'string') || new Set(refs).size !== refs.length) return fail(422, 'validation_failed');
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
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], m = moves[i];
    if (r.status === 'cancelled') return fail(409, 'reservation_cancelled');
    const er = m.expected_revision !== undefined ? checkExpectedRevision(m, r.revision) : null;
    if (er) return fail(er.status, er.code);
    if (cutoffPassed(r.accepted_terms.cancellation_cutoff_minutes, r.startMs)) return fail(409, 'cutoff_passed');
  }
  const targets = rows.map((r, i) => {
    const m = moves[i];
    if (m.table_id !== undefined && m.table_ids !== undefined) return { r, bad: 422 };
    const cur = resTables(r);
    let nt = m.table_id !== undefined ? [m.table_id] : (m.table_ids !== undefined ? m.table_ids : cur);
    if (!Array.isArray(nt)) return { r, bad: 400, malformed: true };
    nt = nt.slice();
    if (nt.length === 2) nt = canonPair(rest, nt);
    return { r, nt, nl: m.starts_at_local !== undefined ? m.starts_at_local : r.starts_at_local, np: m.party_size !== undefined ? m.party_size : r.party_size, m };
  });
  for (const t of targets) {
    if (t.bad) return fail(t.malformed ? 400 : 422, t.malformed ? 'malformed_request' : 'validation_failed');
    if (t.nt.some(x => typeof x !== 'string')) return fail(400, 'malformed_request');
    if (t.np !== undefined && (typeof t.np === 'string' || typeof t.np === 'boolean' || t.np === null)) return fail(422, 'validation_failed');
    if (typeof t.np !== 'number') return fail(400, 'malformed_request');
    if (t.nl !== undefined && typeof t.nl !== 'string') return fail(400, 'malformed_request');
    if (t.nt.length < 1 || t.nt.length > 2) return fail(422, t.nt.length > 2 ? 'combination_not_allowed' : 'validation_failed');
    if (new Set(t.nt).size !== t.nt.length) return fail(422, 'validation_failed');
    for (const x of t.nt) if (!rest.tables.some(y => y.id === x)) return fail(404, 'not_found');
    if (t.nt.length === 2 && !pairAllowed(rest, t.nt)) return fail(422, 'combination_not_allowed');
    if (typeof t.np !== 'number' || !Number.isInteger(t.np) || t.np < 1) return fail(422, 'validation_failed');
    const cfg = selectPolicy(rest, t.nl.slice(0, 10));
    t.cfg = cfg;
    if (t.np > comboCapCfg(cfg, rest, t.nt)) return fail(422, 'party_exceeds_capacity');
    if (!parseLocalStrict(t.nl)) return fail(422, 'validation_failed');
    const { y, mo, d, h, mi } = parseLocalStrict(t.nl);
    const inst = resolveLocal(rest.timezone, y, mo, d, h, mi);
    if (!inst.length) return fail(422, 'invalid_local_time');
    t.startMs = inst[0];
    const wd = weekdayLocal(rest.timezone, y, mo, d);
    const oh = cfg.opening_hours.find(o => o.weekday === wd);
    const tmin = h * 60 + mi;
    if (!oh || tmin < hm(oh.opens) || tmin + cfg.reservation_duration_minutes > hm(oh.closes)) return fail(422, 'outside_opening_hours');
    if ((tmin - hm(oh.opens)) % cfg.slot_minutes !== 0) return fail(422, 'not_on_slot_grid');
    const cur = resTables(t.r);
    t.noop = sameSet(t.nt, cur) && t.nl === t.r.starts_at_local && t.np === t.r.party_size;
  }
  const ids = new Set(rows.map(r => r.id));
  const shares = (a, b) => a.some(x => b.includes(x));
  for (let i = 0; i < targets.length; i++) {
    if (targets[i].noop) continue;
    for (let j = i + 1; j < targets.length; j++) {
      if (targets[j].noop) continue;
      if (shares(targets[i].nt, targets[j].nt) && overlap(targets[i].startMs, targets[i].cfg.reservation_duration_minutes, targets[j].startMs, targets[j].cfg.reservation_duration_minutes)) return fail(409, 'table_unavailable');
    }
    for (const o of S.reservations) {
      if (o.status !== 'confirmed' || ids.has(o.id) || o.restaurant_id !== rid) continue;
      if (!shares(resTables(o), targets[i].nt)) continue;
      if (overlap(targets[i].startMs, targets[i].cfg.reservation_duration_minutes, o.startMs, resDur(o))) return fail(409, 'table_unavailable');
    }
  }
  // occupancy vs each other including noop positions
  for (let i = 0; i < targets.length; i++) {
    if (targets[i].noop) continue;
    for (let j = 0; j < targets.length; j++) {
      if (i === j || !targets[j].noop) continue;
      const oj = targets[j].r;
      if (shares(resTables(oj), targets[i].nt) && overlap(targets[i].startMs, targets[i].cfg.reservation_duration_minutes, oj.startMs, resDur(oj))) return fail(409, 'table_unavailable');
    }
  }
  let anyReal = false;
  for (const t of targets) {
    if (t.noop) continue;
    anyReal = true;
    const changes = changedFields(rest, resTables(t.r), t.nt, t.r.starts_at_local, t.nl, t.r.party_size, t.np);
    t.r.table_ids = t.nt; t.r.table_id = t.nt.length === 1 ? t.nt[0] : undefined;
    t.r.starts_at_local = t.nl; t.r.party_size = t.np; t.r.startMs = t.startMs;
    t.r.accepted_terms = termsOf(t.cfg);
    t.r.revision += 1;
    pushHistory(t.r, 'changed', changes);
    bumpSeriesFor(t.r.id, true, false);
  }
  if (anyReal) rest._rev = (rest._rev || 0) + 1;
  return finish(201, { reservations: rows.map(resShape) });
}
const port = +(process.env.PORT || 8080);
http.createServer(handler).listen(port, '0.0.0.0');
