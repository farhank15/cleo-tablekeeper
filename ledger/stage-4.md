# Ledger Stage 4 — seating changes + recurring amendments (spec stage-4.md; R-1.x + R-2.x + R-3.x carried forward unchanged)

## Carry-forward
All R-1.x, R-2.x, R-3.x remain binding. Nothing repealed.

## Rulings / ambiguities
- D1: Closure interval is half-open [from,to) with explicit offsets; from<to else 422 validation_failed; unknown table 404.
- D2: Planning limits (6 tables, 4 pairs, 6 considered bookings) are minima — larger inputs MAY return 422 planning_limit; at-or-under must plan.
- D3: Option rank: singles in fixture order then pairs in declared order, starting at 0. Tier-3 compares vectors in ascending reservation-reference order.
- D4: Restaurant revision starts at 0 after reset; +1 per successful new booking, real amendment, cancellation, policy publication, plan application. No-op/failure/preview/replay never increments.
- D5: Preview stores only a plan; application is atomic (closure + all assignments together).
- D6: stale_plan (any intervening restaurant revision, incl. other-restaurant closures excluded — only same-restaurant revisions invalidate) → 409 changing nothing; plan_already_applied (different key on applied plan) → 409; replay of successful key → 200 original even after later changes.
- D7: Series amend eligible set = indices ≥ from_index excluding cancelled + exception occurrences; all-no-op/empty eligible → success with no revision changes; replay → 200 original.
- D8: Non-occupancy errors take precedence in occurrence-index order; otherwise occupancy conflict → table_unavailable.

## Clauses
- R-4.1 Replan preview: POST /restaurants/{id}/replans manager + idempotency key; body {table_id, from, to}; considered = every confirmed booking overlapping [from,to); each retains ref/owner/party/start/end/terms assigned a single or declared pair with enough capacity under its own accepted terms, no conflicts with fixed bookings/other assignments/applied closures/proposed closure; cutoffs do not block repair; none disappear/cancelled.
- R-4.2 3-tier minimization: (1) fewest changed table sets, (2) least total unused seats, (3) option-rank vector in ascending reference order.
- R-4.3 Preview response: 201 {plan_id opaque, restaurant_revision, closure, assignments (every considered booking in reference order, {reference, table_ids, changed}), moved_count, unused_seats}; no feasible plan → 409 no_feasible_plan changing nothing; no closure/occupancy/revision/history side effects.
- R-4.4 Plan apply: POST /restaurants/{id}/replans/{plan_id}/apply body {} manager + idempotency; 201 {plan_id, restaurant_revision, reservations (considered, reference order)}; unknown/other-restaurant plan 404; per D6 stale/applied/replay semantics; atomic; records closure + assignments; each moved booking +1 revision + one reassigned history entry (table_ids change + plan_id), terms/times identical; unmoved gain nothing; restaurant +1 whole plan.
- R-4.5 Closure effects: applied closures exclude singles+pairs from availability, reject creates/amendments with 409 table_unavailable; explain no_overlap false for closures; no new screens; availability/confirmation/lookup reflect applied plans.
- R-4.6 Series amend: POST /series/{series_id}/amend owner-only idempotent (unknown/other 404, no token 401); body {expected_revision positive int, from_index 0..count-1, local_time HH:MM 00:00..23:59, no bools}; 422 invalid, 409 stale_revision before cutoff/validation; unknown fields ignored; per D7/D8 eligible set, per-occurrence old-cutoff then resulting-date policy, identical-fields no-op retains terms; conflicts with unchanged/other/closures fail atomically (nothing changes); success → 201 current series response, each changed +1 ordinary changed history +1 reservation rev, series + restaurant rev +1 once total if anything changed; no exception marking; replay 200 original.
- R-4.7 Cross effects: repairs may move series occurrences (exception flags/dates/identities/terms preserved; each affected series rev +1 per application if ≥1 member moved); concurrent same-revision amendments: at most one real change; closure at another restaurant never invalidates.
- R-4.8 Interop: stage-4 accepts stages 1–3 exports of same team incl. moved/cancelled series occurrences; earlier receipts/histories/retries remain valid.
