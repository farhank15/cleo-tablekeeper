#!/usr/bin/env node
// Independent Stage-3 verification: R-3.1..R-3.14 derived from spec text.
const B = 'http://localhost:8083';
let pass = 0, fail = 0;
function ok(name, cond, extra='') { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name} ${extra}`); } }
async function req(method, path, body, headers={}) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
}
(async () => {
  // seed
  let r = await req('POST', '/_test/reset', { users: [{ id: 'u_mgr', email: 'm@x.io', password: 'password1', display_name: 'M' }, { id: 'u_din', email: 'd@x.io', password: 'password1', display_name: 'D' }, { id: 'u_o', email: 'o@x.io', password: 'password1', display_name: 'O' }],
    restaurants: [{ id: 'r1', name: 'A', timezone: 'Europe/Berlin', slot_minutes: 30, reservation_duration_minutes: 90, cancellation_cutoff_minutes: 60, opening_hours: [{ weekday: 'wed', opens: '18:00', closes: '23:00' }, { weekday: 'thu', opens: '18:00', closes: '23:00' }], tables: [{ id: 't_1', capacity: 2 }, { id: 't_2', capacity: 4 }, { id: 't_3', capacity: 6 }], combinable: [['t_1','t_2']], manager_user_ids: ['u_mgr'] }],
    reservations: [] });
  ok('reset', r.status === 204, r.status);
  const lm = await req('POST', '/auth/login', { email: 'm@x.io', password: 'password1' });
  const ld = await req('POST', '/auth/login', { email: 'd@x.io', password: 'password1' });
  const lo = await req('POST', '/auth/login', { email: 'o@x.io', password: 'password1' });
  const Tm = lm.json.token, Td = ld.json.token, To = lo.json.token;
  const AH = t => ({ Authorization: 'Bearer ' + t, 'Idempotency-Key': 'k-' + Math.random().toString(36).slice(2) });

  // R-3.2 explain validation
  r = await req('GET', '/availability?restaurant_id=r1&date=2026-10-08&party_size=2&explain=false');
  ok('R-3.2 false->422', r.status === 422 && r.json.error.code === 'validation_failed', r.status);
  r = await req('GET', '/availability?restaurant_id=r1&date=2026-10-08&party_size=2');
  ok('R-3.2 absent->no explain', r.status === 200 && r.json.slots.length > 0 && !('explain' in r.json.slots[0]), JSON.stringify(r.json).slice(0,120));
  // R-3.1 explain matrix (2026-10-08 is Thursday)
  r = await req('GET', '/availability?restaurant_id=r1&date=2026-10-08&party_size=4&explain=true');
  const s0 = r.json.slots[0];
  ok('R-3.1 every table once/fixture order', JSON.stringify(s0.explain.map(e=>e.table_id)) === '["t_1","t_2","t_3"]', JSON.stringify(s0.explain.map(e=>e.table_id)));
  ok('R-3.1 rules order+capacity', s0.explain[0].rules[0].rule === 'capacity' && s0.explain[0].rules[1].rule === 'no_overlap' && s0.explain[0].rules[0].holds === false && s0.explain[0].available === false, JSON.stringify(s0.explain[0]));
  ok('R-3.1 available match', JSON.stringify(s0.explain.filter(e=>e.available).map(e=>e.table_id)) === JSON.stringify(s0.available_table_ids), '');
  ok('R-3.1 policy_version 0', s0.explain.every(e => e.policy_version === 0), '');
  r = await req('GET', '/availability?restaurant_id=r1&date=2026-10-11&party_size=2&explain=true'); // Sunday closed
  ok('R-3.1 closed day slots []', r.status === 200 && r.json.slots.length === 0, r.status);

  // create booking
  r = await req('POST', '/reservations', { restaurant_id: 'r1', table_id: 't_2', starts_at_local: '2026-10-08T19:00', party_size: 4 }, AH(Td));
  const bk = r.json; const ref = bk.reference;
  ok('R-3.7 revision1+terms0', r.status === 201 && bk.revision === 1 && bk.accepted_terms.policy_version === 0 && bk.accepted_terms.reservation_duration_minutes === 90, JSON.stringify(bk).slice(0,200));
  // R-3.3 history owner-only
  let h = await req('GET', `/reservations/${ref}/history`, undefined, { Authorization: 'Bearer ' + Td });
  ok('R-3.4 created names all from null', h.status === 200 && h.json.entries.length === 1 && h.json.entries[0].seq === 1 && h.json.entries[0].changes.length === 3 && h.json.entries[0].changes.every(c => c.from === null), JSON.stringify(h.json.entries));
  ok('R-3.9 history carries revision+terms', h.json.entries[0].revision === 1 && h.json.entries[0].accepted_terms.policy_version === 0, '');
  h = await req('GET', `/reservations/${ref}/history`);
  ok('R-3.3 unauth 404', h.status === 404, h.status);
  h = await req('GET', `/reservations/${ref}/history`, undefined, { Authorization: 'Bearer ' + To });
  ok('R-3.3 other owner 404', h.status === 404, h.status);
  let dc = await req('GET', `/reservations/${ref}/decision`, undefined, { Authorization: 'Bearer ' + Td });
  ok('R-3.9 decision shape', dc.status === 200 && dc.json.revision === 1 && dc.json.accepted_terms.policy_version === 0, dc.status);
  // no-op patch
  r = await req('PATCH', `/reservations/${ref}`, { party_size: 4 }, { Authorization: 'Bearer ' + Td });
  ok('R-3.8 no-op retains rev', r.status === 200 && r.json.revision === 1, JSON.stringify(r.json));
  h = await req('GET', `/reservations/${ref}/history`, undefined, { Authorization: 'Bearer ' + Td });
  ok('R-3.4 no-op no entry', h.json.entries.length === 1, h.json.entries.length);
  // expected_revision mismatch
  r = await req('PATCH', `/reservations/${ref}`, { party_size: 2, expected_revision: 99 }, { Authorization: 'Bearer ' + Td });
  ok('R-3.8 stale 409', r.status === 409 && r.json.error.code === 'stale_revision', r.status + JSON.stringify(r.json));
  r = await req('PATCH', `/reservations/${ref}`, { party_size: 2, expected_revision: 'x' }, { Authorization: 'Bearer ' + Td });
  ok('R-3.8 bad rev type 422', r.status === 422, r.status);
  // real change
  r = await req('PATCH', `/reservations/${ref}`, { party_size: 2 }, { Authorization: 'Bearer ' + Td });
  ok('R-3.8 real change rev2', r.status === 200 && r.json.revision === 2, JSON.stringify(r.json));
  h = await req('GET', `/reservations/${ref}/history`, undefined, { Authorization: 'Bearer ' + Td });
  ok('R-3.4 changed only party', h.json.entries.length === 2 && h.json.entries[1].changes.length === 1 && h.json.entries[1].changes[0].field === 'party_size' && h.json.entries[1].revision === 2, JSON.stringify(h.json.entries[1]));

  // R-3.5/3.6 policies
  r = await req('POST', '/restaurants/r1/policies', { effective_from: '2026-10-01', slot_minutes: 30, reservation_duration_minutes: 120, cancellation_cutoff_minutes: 60, opening_hours: [{ weekday: 'thu', opens: '18:00', closes: '23:00' }], capacities: { t_1: 2, t_2: 4, t_3: 6 } }, AH(To));
  ok('R-3.5 non-manager 403', r.status === 403, r.status);
  r = await req('POST', '/restaurants/r1/policies', { effective_from: '2026-10-01', slot_minutes: 30, reservation_duration_minutes: 120, cancellation_cutoff_minutes: 60, opening_hours: [{ weekday: 'thu', opens: '18:00', closes: '23:00' }], capacities: { t_1: 2, t_2: 4, t_3: 6 } }, { Authorization: 'Bearer ' + Tm, 'Idempotency-Key': 'pol1' });
  ok('R-3.6 publish v1', r.status === 201 && r.json.policy_version === 1, JSON.stringify(r.json));
  const polBody = { effective_from: '2026-10-01', slot_minutes: 30, reservation_duration_minutes: 120, cancellation_cutoff_minutes: 60, opening_hours: [{ weekday: 'thu', opens: '18:00', closes: '23:00' }], capacities: { t_1: 2, t_2: 4, t_3: 6 } };
  r = await req('POST', '/restaurants/r1/policies', polBody, { Authorization: 'Bearer ' + Tm, 'Idempotency-Key': 'pol1' });
  ok('R-3.6 replay same response', r.status === 200 && r.json.policy_version === 1, r.status);
  r = await req('POST', '/restaurants/r1/policies', { effective_from: 'bad', slot_minutes: 30, reservation_duration_minutes: 120, cancellation_cutoff_minutes: 60, opening_hours: [], capacities: {} }, AH(Tm));
  ok('R-3.6 invalid 422', r.status === 422, r.status);
  r = await req('GET', '/restaurants/r1/policies');
  ok('R-3.6 list publication order', r.status === 200 && r.json.policies.length === 1 && r.json.policies[0].policy_version === 1, JSON.stringify(r.json));
  // selection: booking after effective uses v1 duration 120
  r = await req('POST', '/reservations', { restaurant_id: 'r1', table_id: 't_3', starts_at_local: '2026-10-08T18:00', party_size: 2 }, AH(Td));
  ok('R-3.7 selection uses v1', r.status === 201 && r.json.accepted_terms.policy_version === 1 && r.json.accepted_terms.reservation_duration_minutes === 120, JSON.stringify(r.json).slice(0,300));
  const ref2 = r.json.reference;
  // old booking terms unchanged
  dc = await req('GET', `/reservations/${ref}/decision`, undefined, { Authorization: 'Bearer ' + Td });
  ok('R-3.7 publication never mutates', dc.json.accepted_terms.policy_version === 0, JSON.stringify(dc.json.accepted_terms));

  // R-3.10 series
  r = await req('POST', '/series', { anchor_reference: ref2, count: 2, interval_weeks: 1 }, AH(Td));
  ok('R-3.10 series 201', r.status === 201 && r.json.occurrences.length === 2 && r.json.occurrences[0].reference === ref2 && r.json.revision === 1, r.status + JSON.stringify(r.json).slice(0,300));
  const sid = r.json.series_id; const occRef = r.json.occurrences[1].reference;
  ok('R-3.10 distinct refs', occRef !== ref2, occRef);
  r = await req('POST', '/series', { anchor_reference: ref2, count: 2, interval_weeks: 1 }, { Authorization: 'Bearer ' + Td, 'Idempotency-Key': 'dup-series' });
  // different key, already adopted
  ok('R-3.10 already_in_series', r.status === 409 && r.json.error.code === 'already_in_series', r.status + JSON.stringify(r.json));
  let sg = await req('GET', `/series/${sid}`, undefined, { Authorization: 'Bearer ' + Td });
  ok('R-3.10 get series', sg.status === 200 && sg.json.occurrences.length === 2, sg.status);
  sg = await req('GET', `/series/${sid}`, undefined, { Authorization: 'Bearer ' + To });
  ok('R-3.10 series owner-only 404', sg.status === 404, sg.status);
  // R-3.11 real patch -> exception + series rev
  r = await req('PATCH', `/reservations/${occRef}`, { party_size: 3 }, { Authorization: 'Bearer ' + Td });
  ok('R-3.11 occ patch ok', r.status === 200, r.status + JSON.stringify(r.json));
  sg = await req('GET', `/series/${sid}`, undefined, { Authorization: 'Bearer ' + Td });
  ok('R-3.11 exception+rev', sg.json.revision === 2 && sg.json.occurrences[1].exception === true, JSON.stringify(sg.json).slice(0,300));
  // cancel occurrence -> series rev +1, no exception on new cancel; test on anchor? use occ: cancel
  r = await req('POST', `/reservations/${occRef}/cancel`, {}, { Authorization: 'Bearer ' + Td });
  ok('R-3.11 cancel occ', r.status === 200, r.status);
  sg = await req('GET', `/series/${sid}`, undefined, { Authorization: 'Bearer ' + Td });
  ok('R-3.11 cancel bumps series once', sg.json.revision === 3, JSON.stringify(sg.json.revision));
  // invalid series count
  r = await req('POST', '/series', { anchor_reference: ref, count: 99, interval_weeks: 1 }, AH(Td));
  ok('R-3.10 bad count 422', r.status === 422, r.status);

  // R-3.13 combos: create pair booking, history uses table_ids
  r = await req('POST', '/reservations', { restaurant_id: 'r1', table_ids: ['t_2', 't_1'], starts_at_local: '2026-10-08T20:00', party_size: 5 }, AH(Td));
  ok('R-3.13 pair create', r.status === 201 && JSON.stringify(r.json.table_ids) === '["t_1","t_2"]', JSON.stringify(r.json).slice(0,300));
  const pref = r.json ? r.json.reference : null;
  if (pref) {
    h = await req('GET', `/reservations/${pref}/history`, undefined, { Authorization: 'Bearer ' + Td });
    ok('R-3.13 history table_ids', h.json.entries[0].changes[0].field === 'table_ids', JSON.stringify(h.json.entries[0].changes));
    // reversed pair no-op patch
    r = await req('PATCH', `/reservations/${pref}`, { table_ids: ['t_2', 't_1'] }, { Authorization: 'Bearer ' + Td });
    ok('R-3.13 reversed = noop rev stays', r.status === 200 && r.json.revision === 1, JSON.stringify(r.json));
  }
  // R-3.14 moves: create two bookings then batch move
  r = await req('POST', '/reservations', { restaurant_id: 'r1', table_id: 't_3', starts_at_local: '2026-10-08T21:00', party_size: 2 }, AH(Td));
  const mref = r.json.reference;
  r = await req('POST', '/reservation-moves', { moves: [{ reference: mref, party_size: 3 }] }, AH(Td));
  ok('R-3.14 batch move', r.status === 201 && r.json.reservations[0].revision === 2, r.status + JSON.stringify(r.json).slice(0,200));
  // R-3.12 interop export/import
  r = await req('GET', '/_test/export');
  ok('R-3.12 export', r.status === 200 && r.json.state, r.status);
  console.log(`\nRESULT pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})();
