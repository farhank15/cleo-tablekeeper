#!/usr/bin/env python3
"""Stage-2 independent checks R-2.1..R-2.22 derived from spec stage-2.md.
API combo probes + UI testid/route probes. BASE env, default :8080.
Exit nonzero on any failure.
"""
import json, os, sys, urllib.request, urllib.error
BASE = os.environ.get("BASE", "http://localhost:8080")
passed, failed = [], []
def req(method, path, body=None, headers=None, raw=None):
    h = {"Content-Type": "application/json"}
    if headers: h.update(headers)
    d = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(BASE + path, data=d, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=10) as x: return x.status, x.read().decode(), dict(x.headers)
    except urllib.error.HTTPError as e: return e.code, e.read().decode(), dict(e.headers)
def get_text(path):
    r = urllib.request.Request(BASE + path, method="GET", headers={"Accept": "text/html"})
    try:
        with urllib.request.urlopen(r, timeout=10) as x: return x.status, x.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else " " + detail[:200]))
def code(b):
    try: return json.loads(b).get("error", {}).get("code")
    except: return None

FIX = {"users": [{"id": "u1", "email": "a@b.com", "password": "correct horse", "display_name": "Ada"}],
 "restaurants": [{"id": "r1", "name": "Zum Anker", "timezone": "Europe/Berlin", "slot_minutes": 30,
   "reservation_duration_minutes": 90, "cancellation_cutoff_minutes": 0,
   "opening_hours": [{"weekday": "thu", "opens": "18:00", "closes": "23:00"}],
   "tables": [{"id": "t_1", "label": "Fenster", "capacity": 2}, {"id": "t_2", "label": "Mitte", "capacity": 4}],
   "combinable": [["t_1", "t_2"]]}],
 "reservations": []}
s, b, _ = req("POST", "/_test/reset", FIX)
check("R-2.14 reset-with-combinable", s == 204, f"got {s} {b}")
s, b, _ = req("POST", "/auth/login", {"email": "a@b.com", "password": "correct horse"})
tok = json.loads(b).get("token", "") if s == 200 else ""
A = {"Authorization": "Bearer " + tok}
# R-2.15 availability options (party 6 needs combo 2+4)
s, b, _ = req("GET", "/availability?restaurant_id=r1&date=2026-09-24&party_size=6")
try:
    opts = json.loads(b)["slots"][0]["available_options"]
    has_combo = any(o["table_ids"] == ["t_1", "t_2"] and o["capacity"] == 6 for o in opts)
    singles_only = "available_table_ids" in json.loads(b)["slots"][0]
    check("R-2.15 available_options-combo", s == 200 and has_combo and singles_only, f"got {s} {b[:300]}")
except Exception as e: check("R-2.15 available_options-combo", False, f"got {s} {b[:200]}")
# R-2.16 combo booking
s, b, _ = req("POST", "/reservations",
    {"restaurant_id": "r1", "table_ids": ["t_1", "t_2"], "starts_at_local": "2026-09-24T19:00", "party_size": 6},
    {**A, "Idempotency-Key": "c1"})
try:
    j = json.loads(b)
    check("R-2.16 combo-create", s == 201 and j.get("table_ids") == ["t_1", "t_2"] and "table_id" not in j, f"got {s} {b[:300]}")
except Exception: check("R-2.16 combo-create", False, f"got {s} {b[:300]}")
# R-2.16 both table_id+table_ids -> 422
s, b, _ = req("POST", "/reservations",
    {"restaurant_id": "r1", "table_id": "t_1", "table_ids": ["t_1"], "starts_at_local": "2026-09-24T19:00", "party_size": 2},
    {**A, "Idempotency-Key": "c2"})
check("R-2.16 both-ids-422", s == 422 and code(b) == "validation_failed", f"got {s} {b[:150]}")
s, b, _ = req("POST", "/reservations",
    {"restaurant_id": "r1", "table_ids": ["t_1", "t_2"], "starts_at_local": "2026-09-24T19:30", "party_size": 6},
    {**A, "Idempotency-Key": "c5"})
check("R-2.17 overlap-member-409", s == 409 and code(b) == "table_unavailable", f"got {s} {b[:150]}")
# R-2.17 unlisted pair -> combination_not_allowed; >2 -> same; dup -> validation_failed; overlap any member -> 409
FIX3 = {"users": [{"id": "u1", "email": "a@b.com", "password": "correct horse", "display_name": "Ada"}],
 "restaurants": [{"id": "r1", "name": "Zum Anker", "timezone": "Europe/Berlin", "slot_minutes": 30,
   "reservation_duration_minutes": 90, "cancellation_cutoff_minutes": 0,
   "opening_hours": [{"weekday": "thu", "opens": "18:00", "closes": "23:00"}],
   "tables": [{"id": "t_1", "label": "Fenster", "capacity": 2}, {"id": "t_2", "label": "Mitte", "capacity": 4}, {"id": "t_3", "label": "Ecke", "capacity": 4}],
   "combinable": [["t_1", "t_2"]]}],
 "reservations": []}
s, b, _ = req("POST", "/_test/reset", FIX3)
s0, b0, _ = req("POST", "/auth/login", {"email": "a@b.com", "password": "correct horse"})
A = {"Authorization": "Bearer " + (json.loads(b0).get("token", "") if s0 == 200 else "")}
s, b, _ = req("POST", "/reservations",
    {"restaurant_id": "r1", "table_ids": ["t_1", "t_2", "t_3"], "starts_at_local": "2026-09-24T19:00", "party_size": 2},
    {**A, "Idempotency-Key": "c3"})
check("R-2.17 gt2-combo-422", s == 422 and code(b) == "combination_not_allowed", f"got {s} {b[:150]}")
s, b, _ = req("POST", "/reservations",
    {"restaurant_id": "r1", "table_ids": ["t_1", "t_1"], "starts_at_local": "2026-09-24T20:30", "party_size": 2},
    {**A, "Idempotency-Key": "c4"})
check("R-2.17 dup-422", s == 422 and code(b) == "validation_failed", f"got {s} {b[:150]}")
# c5 runs on the FIX fixture while c1 still holds [t_1,t_2]@19:00 (no reset between).
# R-2.1 routes return HTML
for route in ["/", "/signup", "/login", "/lookup"]:
    s, b = get_text(route)
    check(f"R-2.1 route-{route}-html", s == 200 and ("<html" in b.lower() or "<!doctype" in b.lower()), f"got {s} {b[:120]}")
# R-2.7..R-2.12 testids on home page
s, home = get_text("/")
# Static testids (grid/no-slots are rendered dynamically post-search by design —
# error/detail/confirmation nodes must be absent-when-inactive per browser tests).
for tid in ["restaurant-select", "date-input", "party-size-input", "search-button"]:
    check(f"R-2.8 testid-{tid}", f'data-testid="{tid}"' in home, "missing")
s, lo = get_text("/login")
for tid in ["login-email", "login-password", "login-submit"]:
    check(f"R-2.7 testid-{tid}", f'data-testid="{tid}"' in lo, "missing")
s, su = get_text("/signup")
for tid in ["signup-email", "signup-password", "signup-display-name", "signup-submit"]:
    check(f"R-2.7 testid-{tid}", f'data-testid="{tid}"' in su, "missing")
s, lk = get_text("/lookup")
for tid in ["lookup-reference-input", "lookup-submit"]:
    check(f"R-2.12 testid-{tid}", f'data-testid="{tid}"' in lk, "missing")
print(f"\n{len(passed)} passed, {len(failed)} failed")
sys.exit(1 if failed else 0)
