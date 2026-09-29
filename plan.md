# cleo-tablekeeper — Factory Plan (Stage 1)

## Purpose
Containerized zero-dependency Node.js HTTP service: reservation engine, table inventory, IANA timezone conversion, mutex locking, idempotent JSON API. PORT=8080, GET /health 200 {"status":"ok"}, Linux Alpine Node 20, offline at runtime.

## Stage topology
- Stage 1: core engine + API (§1–§11 of stage-1.md). Seats: forge (backend), release (verify), sentinel IDLE (no interface).
- Stage 2: browser interface. Stage 3: policies/series. Stage 4: emergency replanning.

## Seat assignments (Stage 4)
- @cleo-forge: stage-4/ replans preview+apply + series amend (R-4.1..R-4.8). WOs WO-4.1..WO-4.4.
- @cleo-release: independent verification, isolated container run, ledger coverage 8/8.
- @cleo-sentinel: IDLE (no new screens; existing screens reflect applied plans per R-4.5).
- @cleo-forge: implement server.js (http, crypto, Intl), Dockerfile, RUN.md in stage-1/ (copy-forward base). WOs WO-1.1..WO-1.6.
- @cleo-release: independent checks from spec; run harness isolated; 8-point adversarial matrix.
- @cleo-sentinel: IDLE for Stage 1 (no HTML/CSS).

## Work orders Stage 1
- WO-1.1 (forge): HTTP skeleton, PORT listen, /health, /_test/reset+seed, error envelope, conventions. Exit: health 200, reset 204 round-trip.
- WO-1.2 (forge): auth signup/login, bcrypt-equivalent hash (crypto scrypt), bearer tokens, public routes. Exit: signup/login/error codes per §6.
- WO-1.3 (forge): availability + booking: slot grid, half-open overlap, capacity, opening hours, reference gen, POST validation codes. Exit: slot math + booking codes per §8.
- WO-1.4 (forge): idempotency (POST /reservations, POST /reservation-moves), scoped per user, replay semantics, concurrency single-effect. Exit: §7 matrix passes.
- WO-1.5 (forge): time/DST (IANA via Intl, spring gap 422, fall-back first occurrence, absolute duration), cancel/PATCH cutoffs, atomic moves, export/import. Exit: §9/§10/§11 pass.
- WO-1.6 (release): independent verification + harness isolated run. Exit: Gate 3 pass, ledger coverage 100%.

## Contracts
- Ledger law: ledger/stage-1.md R-1.x binds all seats.
- Single-threaded writes: forge owns stage-1/** product code; release owns its own checks only; sentinel touches nothing in Stage 1.
- Reporting: per-WO milestone with commit hash + evidence.
