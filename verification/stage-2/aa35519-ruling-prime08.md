# WO-R2-verify on exact commit aa35519 (Ruling Prime-08)

Commit: `aa35519` (verified in detached worktree `/tmp/rel-aa35519`, then removed).
Scope: isolated-mode-equivalent run — no official harness exists beyond
`verification/stage-2/checks.py` (static file assertions, network-independent
by construction); API probes run against a local server spawned from the exact
commit tree (PORT=8095).

## 1. Static checks (exact tree)
`python3 verification/stage-2/checks.py` → **24 passed, 0 failed**

## 2. API probes (exact tree, seeded fixture r1/t_1+t_2/combinable pair)
- signup 201 + token(48) / dup signup → 409 `email_taken` / bad login → 401 `unauthenticated`
- availability: 7 slots; slot0 `available_table_ids=[t_1,t_2]`,
  `available_options` singles fixture-order + pair `[t_1,t_2]` cap 6 (R-2.15)
- double-commit same table+slot: 201 then **409 `table_unavailable`** (vector 1)
- replay same Idempotency-Key+body: 201 `res_2` then **200 same `res_2`/ref `7FUU3G`**,
  zero duplicated side-effects (vector 2)
- malformed: missing key → 400 `missing_idempotency_key`; bad date → 422
  `validation_failed` (vector 4)
- conservation: 2 confirmed, (slot,table) pairs unique → **OK** (vector 5)

## 3. Delta (aa35519 vs dbec127, exact diff = 1 line in showAuth)
DELTA-1 sign-in shows current-user w/ name: PASS
DELTA-2 sign-in shows logout-button: PASS
DELTA-3 re-sign-in unhides re-mounted nodes (fix load-bearing): PASS
DELTA-4 logout detaches null/null: PASS

## 4. Not probed from this seat (wall: sandboxed browser, localhost unreachable)
Desktop/phone true-width render, B1/B2/B3 UI races — adopted as supporting
evidence from sentinel GATE-8 (`2079041`: 24 cells live, detach, desktop 1280
zero h-scroll, 375px iframe 373==373, zero console errors).

Ledger coverage: 24/24 static + R-2.15/R-2.16/R-2.17/R-2.21 API-probed-passed;
R-2.6/R-2.2–R-2.5 UI-side via cited peer evidence.
