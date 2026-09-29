# Ledger Stage 2 — Online booking + combined tables (spec stage-2.md; stage-1 R-1.1..R-1.54 carried forward unchanged)

## Carry-forward
All R-1.x remain binding. R-1.36/38/39/43/50 extended below; nothing repealed.

## Rulings / ambiguities
- B1: Stale-search rule: grid+labels+form always describe the latest initiated search; late responses discarded (request-sequence guard). Rationale: "must describe B".
- B2: 409-on-submit: show booking-error, refresh availability, preserve form+inputs, no confirmation. Rationale: spec text.
- B3: Lost-response: nonempty booking-uncertain, no booking-error, no new confirmation; retry same key+body; success → original ref, clear uncertain/error; confirmed rejection → booking-error. Rationale: spec text.
- B4: Same-key resubmit without field change returns same confirmation-reference (idempotent replay surfaced in UI). Field change → new key. Rationale: booking-form § + §7.
- B5: Pair order canonical = combinable declaration order (also in table_ids and cell testids). Non-transitive. Rationale: spec text.
- B6: Upgrade continuity: stage-2 import accepts stage-1 export; sessions survive; pending retry identity (key+body) survives; lookup of retained refs works. Rationale: upgrade §.
- B7: no-slots vs availability-grid mutually exclusive; closed/empty day → no-slots only.

## Clauses
- R-2.1 Routes / (search+grid), /signup, /login, /lookup return HTML; API JSON convention does not govern them.
- R-2.2 Stale search: late response never restores older results (B1).
- R-2.3 Taken-table race: 409 → booking-error + availability refresh + form preserved + no confirmation (B2).
- R-2.4 Lost response: booking-uncertain nonempty, no error/confirmation; retry same key+body; success → original ref; rejection → booking-error (B3).
- R-2.5 Rules R-2.2..R-2.4 apply to combination bookings; no polling/live-update/cross-tab/reload-recovery required; server authoritative, no manufactured success.
- R-2.6 Warm-hospitality visual system: coherent hierarchy, distinct available/unavailable/selected/loading/success/refused/uncertain states, human-readable labels, labeled inputs, visible focus, contrast; usable at 375px + desktop with no horizontal scroll; consistent nav; considered empty/loading/error states.
- R-2.7 Auth testids: signup-email/password/display-name, signup-submit, login-email/password/submit, auth-error (only when error), current-user (every screen when signed in, contains display name), logout-button.
- R-2.8 Search testids: restaurant-select (values=ids), date-input YYYY-MM-DD, party-size-input, search-button, availability-grid, slot-{table}-{HH:MM} per table per slot, no-slots instead of grid when no slots; mutual exclusivity (B7).
- R-2.9 Cell data-available true iff table in slot available_table_ids for searched party size; available click opens booking form; unavailable click no-op; signed-out available click → auth-error or /login.
- R-2.10 Booking testids: booking-form, booking-summary (table label + local start), booking-party-size (prefilled), booking-submit, booking-error (only on failure); form persists after success; unchanged resubmit → same confirmation-reference, no error/new booking; changed field → new request; retries per §7.
- R-2.11 Confirmation testids: confirmation, confirmation-reference (exact ref only), confirmation-details (restaurant name + table label + local start).
- R-2.12 Lookup testids: lookup-reference-input/submit, reservation-detail when found, reservation-status exactly confirmed|cancelled, reservation-cancel-button (absent once cancelled), reservation-error when not found/refused.
- R-2.13 Upgrade: accept stage-1 export; sessions survive import; retained refs work in lookup; lost-response booking retryable post-import with same key+body recovering original confirmation; applies between browser requests; no reload/new screen; form+retry identity survive.
- R-2.14 Model: restaurant.combinable = unordered pairs only (never 3+); unlisted pair not combinable; non-transitive; combo capacity = sum; seeded reservations confirmed unless status cancelled, may carry table_id or table_ids.
- R-2.15 GET /availability: gains available_options; available_table_ids unchanged (singles only); options = every single + declared pair with capacity>=party_size and zero overlap on any member; singles fixture order then pairs combinable order; pair table_ids in combinable order; each {table_ids, capacity}.
- R-2.16 POST /reservations: accepts table_ids; table_id = set of one; both → 422 validation_failed; responses always table_ids + table_id iff single.
- R-2.17 Combo errors: pair not in combinable → 422 combination_not_allowed; >2 tables → 422 combination_not_allowed; any member overlap → 409 table_unavailable; party>sum → 422 party_exceeds_capacity; duplicate id → 422 validation_failed.
- R-2.18 PATCH accepts table_ids same rules; cancel frees every table in set.
- R-2.19 UI combos: slot-{a}+{b}-{HH:MM} cells in combinable order with data-available; confirmation-tables + reservation-tables name every label; booking-summary names every table; single-table testids unchanged.
- R-2.20 Atomic moves accept table_ids per move; no table in overlapping resulting bookings; browser recovery + original-receipt rules apply to combos.
- R-2.21 Concurrency: results equivalent to some serial order at every read.
- R-2.22 Stage-2 folder starts as copy of accepted stage-1 (e68a2c5); no stage-1 regression.
