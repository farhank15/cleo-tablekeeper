#!/usr/bin/env python3
"""Independent requirement checks R-1.1..R-1.54 derived from spec text.
Each check hits the live service at BASE (default http://localhost:8080).
Usage: BASE=http://localhost:PORT python3 checks.py
Exit nonzero on any failure. No product code imported.
"""
import json, os, urllib.request, urllib.error, sys
BASE = os.environ.get("BASE", "http://localhost:8080")
passed, failed = [], []
def req(method, path, body=None, headers=None, raw=None):
    url = BASE + path
    h = {"Content-Type": "application/json"}
    if headers: h.update(headers)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(("PASS " if cond else "FAIL ") + name + (" " + detail if detail and not cond else ""))
def envelope(code, body):
    try:
        j = json.loads(body)
        return j.get("error", {}).get("code")
    except Exception:
        return None

FIX = {"users":[{"id":"u_ada","email":"ada@example.com","password":"correct horse","display_name":"Ada"}],
 "restaurants":[{"id":"r_anker","name":"Zum Anker","timezone":"Europe/Berlin","slot_minutes":30,
  "reservation_duration_minutes":90,"cancellation_cutoff_minutes":120,
  "opening_hours":[{"weekday":"thu","opens":"18:00","closes":"23:00"},{"weekday":"fri","opens":"18:00","closes":"23:30"}],
  "tables":[{"id":"t_1","label":"1","capacity":2},{"id":"t_2","label":"2","capacity":4}]}],
 "reservations":[]}

s, b = req("POST", "/_test/reset", body=FIX)
check("R-1.3 reset-204", s == 204, f"got {s} {b[:200]}")
s, b = req("GET", "/health")
check("R-1.2 health", s == 200 and json.loads(b).get("status") == "ok", f"got {s} {b[:200]}")
s, b = req("GET", "/restaurants")
check("R-1.34 restaurants-public", s == 200 and "r_anker" in b, f"got {s}")
s, b = req("POST", "/auth/login", body={"email":"ada@example.com","password":"correct horse"})
tok = ""
try: tok = json.loads(b).get("token","")
except: pass
check("R-1.9/R-1.28 login", s == 200 and bool(tok), f"got {s} {b[:200]}")
A = {"Authorization": "Bearer " + tok}
# availability closed day + slot shape
s, b = req("GET", "/availability?restaurant_id=r_anker&date=2026-09-24&party_size=4")
try:
    j = json.loads(b)
    check("R-1.36/R-1.37 availability", s == 200 and "slots" in j and "timezone" in j, f"got {s}")
except Exception: check("R-1.36/R-1.37 availability", False, f"got {s} {b[:200]}")
# missing param -> 422
s, b = req("GET", "/availability?restaurant_id=r_anker&date=2026-09-24")
check("R-1.21 avail-missing-422", s == 422 and envelope(s,b)=="validation_failed", f"got {s} {b[:150]}")
# booking happy path
s, b = req("POST", "/reservations", body={"restaurant_id":"r_anker","table_id":"t_2","starts_at_local":"2026-09-24T19:00","party_size":4}, headers={**A,"Idempotency-Key":"k1"})
ref = ""
try: ref = json.loads(b).get("reference","")
except: pass
check("R-1.38 create-201", s == 201 and len(ref) >= 6, f"got {s} {b[:300]}")
# overlap -> 409 table_unavailable
s, b = req("POST", "/reservations", body={"restaurant_id":"r_anker","table_id":"t_2","starts_at_local":"2026-09-24T19:00","party_size":2}, headers={**A,"Idempotency-Key":"k2"})
check("R-1.12/R-1.39 overlap-409", s == 409 and envelope(s,b)=="table_unavailable", f"got {s} {b[:150]}")
# half-open boundary 20:30 must succeed
s, b = req("POST", "/reservations", body={"restaurant_id":"r_anker","table_id":"t_2","starts_at_local":"2026-09-24T20:30","party_size":2}, headers={**A,"Idempotency-Key":"k3"})
check("R-1.12 half-open-boundary", s == 201, f"got {s} {b[:200]}")
# idempotency replay identical -> 200 same body
s2, b2 = req("POST", "/reservations", body={"restaurant_id":"r_anker","table_id":"t_2","starts_at_local":"2026-09-24T20:30","party_size":2}, headers={**A,"Idempotency-Key":"k3"})
check("R-1.33 replay-200-identical", s2 == 200 and json.loads(b2)==json.loads(b), f"got {s2}")
# different body same key -> 409
s, b = req("POST", "/reservations", body={"restaurant_id":"r_anker","table_id":"t_1","starts_at_local":"2026-09-24T19:00","party_size":2}, headers={**A,"Idempotency-Key":"k3"})
check("R-1.20/R-1.32 idem-reuse-409", s == 409 and envelope(s,b)=="idempotency_key_reuse", f"got {s} {b[:150]}")
# missing idem key -> 400
s, b = req("POST", "/reservations", body={"restaurant_id":"r_anker","table_id":"t_1","starts_at_local":"2026-09-24T19:00","party_size":2}, headers=A)
check("R-1.16 missing-key-400", s == 400 and envelope(s,b)=="missing_idempotency_key", f"got {s} {b[:150]}")
# invalid: Feb30 availability date -> 422
s, b = req("GET", "/availability?restaurant_id=r_anker&date=2026-02-30&party_size=2")
check("R-1.51 feb30-422", s == 422, f"got {s} {b[:150]}")
# invalid: party_size non-integer string query 4.0 -> 422
s, b = req("GET", "/availability?restaurant_id=r_anker&date=2026-09-24&party_size=4.0")
check("R-1.24 query-form-422", s == 422, f"got {s} {b[:150]}")
# DST spring gap booking -> 422 invalid_local_time (Berlin 2026-03-29 02:30 needs Sunday opening; use direct create)
# off-grid / outside-hours / capacity probes
s, b = req("POST", "/reservations", body={"restaurant_id":"r_anker","table_id":"t_2","starts_at_local":"2026-09-24T19:15","party_size":2}, headers={**A,"Idempotency-Key":"k-grid"})
check("R-1.39 off-grid-422", s == 422 and envelope(s,b)=="not_on_slot_grid", f"got {s} {b[:150]}")
s, b = req("POST", "/reservations", body={"restaurant_id":"r_anker","table_id":"t_2","starts_at_local":"2026-09-24T19:00","party_size":99}, headers={**A,"Idempotency-Key":"k-cap"})
check("R-1.39 capacity-422", s == 422 and envelope(s,b)=="party_exceeds_capacity", f"got {s} {b[:150]}")
# unauthenticated
s, b = req("GET", "/reservations")
check("R-1.17/R-1.29 unauth-401", s == 401 and envelope(s,b)=="unauthenticated", f"got {s} {b[:150]}")
# malformed body -> 400
s, b = req("POST", "/reservations", raw=b"{not json", headers={**A,"Idempotency-Key":"k-mal"})
check("R-1.15 malformed-400", s == 400 and envelope(s,b)=="malformed_request", f"got {s} {b[:150]}")
# export/import shape
s, b = req("GET", "/_test/export")
try:
    j = json.loads(b)
    check("R-1.48 export", s == 200 and j.get("track")=="tablekeeper" and j.get("format_version")==1, f"got {s}")
except Exception: check("R-1.48 export", False, f"got {s} {b[:150]}")
print(f"\n{len(passed)} passed, {len(failed)} failed")
sys.exit(1 if failed else 0)
