# Ledger Stage 3 — policies, history, recurring (spec stage-3.md; R-1.x + R-2.x carried forward unchanged)

## Carry-forward
All R-1.x, R-2.x remain binding. Nothing repealed.

## Rulings / ambiguities
- C1: explain param: only literal `true` accepted; `false`/`1`/empty/others → 422 validation_failed. Without param → stage-1 shape, no explain fields.
- C2: Policy selection: for booking local start date D, greatest effective_from ≤ D; ties → greatest policy_version. Publication never mutates existing bookings/history/end times.
- C3: No-op PATCH (identical fields) → success, no history entry, no revision/terms change; still requires confirmed editable booking.
- C4: expected_revision: positive int; mismatch → 409 stale_revision before cutoff/validation; invalid type/range → 422. Omission = stage-1 semantics.
- C5: Series anchor unchanged (ref/revision/terms/history/idempotent response); generated occurrences each independently select date policy, obey opening/DST/occupancy; first failing index determines error; total atomicity (no partial state on failure).
- C6: Reversed pair input = same set, not an amendment; table-set order = declared combination order.
- C7: history/decision owner-only 404 even without auth (exception to 401 rule).

## Clauses
- R-3.1 Availability explain: `explain=true` adds per-slot `explain` array; every table exactly once in fixture order; both rules (capacity, no_overlap) in order for every table; `available` true iff both hold; matching available_table_ids order; closed day slots []; empty slot still full explain.
- R-3.2 Explain validation: any explain value other than `true` → 422 validation_failed; absent → no explain fields.
- R-3.3 History: GET /reservations/{ref}/history owner-only (else 404 not_found incl. unauthenticated); cancelled still has history; entries seq 1..n contiguous, seq order = at order.
- R-3.4 History semantics: created names table_id(s)+starts_at_local+party_size from null; changed names only changed fields in order table_id(s),starts_at_local,party_size; no-op PATCH records nothing; cancelled empty changes terminal; idempotent replay records nothing.
- R-3.5 Manager policies: fixture manager_user_ids default []; POST/DELETE policies manager-only (unknown restaurant 404; non-manager 403 forbidden; no token 401); managers gain no diner-private access.
- R-3.6 POST /restaurants/{id}/policies: idempotency key + stage-1 replay; complete policy required (effective_from YYYY-MM-DD, slot 1..1440, duration 1..1440, cutoff 0..10080, no bool-as-int, opening_hours stage-1 no dup weekday, capacities exactly table ids 1..100); invalid → 422 no version/state change; unknown fields ignored; returns 201 + policy_version (1,2..; failures/replays allocate none); policy 0 = fixture rules; immutable; publication order may differ from effective order.
- R-3.7 Policy selection + terms snapshot: per C2; availability/booking use selected policy; explain adds policy_version per table; every reservation response gains revision (1 at creation) + accepted_terms snapshot (policy_version, slot_minutes, reservation_duration_minutes, cancellation_cutoff_minutes, opening_hours, capacities, excl. effective_from); seeded rev 1 policy 0; old idempotent responses unchanged.
- R-3.8 Amendment under policies: no-op → retain terms/end/revision, no history (still needs confirmed editable); real change: check old accepted cutoff, validate all resulting fields vs resulting-date policy, atomically replace terms+end, +1 revision; failed → nothing; cancel checks accepted cutoff vs current start, +1 revision once (repeat no-op); expected_revision per C4; batch moves per-collective rules (below).
- R-3.9 History/decision terms: each history entry carries resulting revision + full accepted_terms; old entries immutable; GET /reservations/{ref}/decision → {reference,revision,accepted_terms} current incl. cancelled; owner-only 404 rule.
- R-3.10 Series create: POST /series idempotent, anchor must be caller's confirmed, cutoff-satisfying; unknown/other-owner → 404, cancelled → 409 reservation_cancelled, adopted → 409 already_in_series; count int 2..12, interval_weeks 1..4 (bool invalid → 422); no token 401; anchor occurrence-0 unchanged; occurrences date = anchor date + i*interval*7d same local clock; each selects own policy, obeys opening/DST/occupancy; nonexistent time → invalid_local_time whole-fail atomic (no partial state); first failing index error; 201 {series_id,revision 1,interval_weeks,occurrences[index,reference,exception,reservation]} refs distinct immutable; occurrences in lists/occupy/histories; GET /series/{id} current states owner-only 404.
- R-3.11 Series mutation: real PATCH → occurrence exception=true + series rev +1; no-op/fail → neither; cancel → series rev +1 once (retain occurrence, no exception; repeat nothing); anchor cancel ≠ siblings; cutoffs/revisions apply; restaurant rev +1 whole op; replays original response; +1 idempotent path; unknown fields ignored.
- R-3.12 Interop: stage-3 accepts stage-1/2 exports of same team; adoption works on imported; links/sessions/retries valid.
- R-3.13 Combos under stage-3: capacity = sum of selected policy capacities; history uses table_ids (creation table_ids null→pair; changes complete before/after lists) instead of table_id when pair involved; order = declared combo order; reversed pair ≠ amendment; selection/revision/replay unchanged.
- R-3.14 Collective moves: each real change = PATCH semantics (old cutoff then resulting-date policy); optional per-move expected_revision; no-op retains terms/history; all must satisfy amendment+occupancy else all unchanged; each changed +1 rev + history entry; restaurant rev +1 whole batch; each affected series rev +1 + exception flags; failed/replay → no rev/history/flag changes.
