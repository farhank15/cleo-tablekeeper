# Stage-4 verification — REJECT
Commit: b4e4c88ad9857e713bcf93b12929b4cdae47d8ad
Checks authored from spec stage-4.md + ledger R-4.1..R-4.8 before execution.
## Results
- R-4.1 replan preview: FAIL — POST /restaurants/{id}/replans returns generic 404 not_found (expected 201/409/422/404-table). Route unimplemented; stage-4/src/server.js is stage-3 copy (no replan/amend routes).
- R-4.2/4.3/4.4/4.5: NOT-PROBED (blocked — no preview plan obtainable); apply-unknown returns generic 404, indistinguishable from missing route.
- R-4.6 series amend: FAIL — POST /series/{id}/amend returns generic 404 not_found for both valid-unknown (expect spec 404) and invalid body (expect 422 validation_failed). Route unimplemented.
- R-4.7/4.8: NOT-PROBED (blocked).
- Conservation invariant: not assertable — no plans applicable.
- Coverage: probed-passed 0 / 8 clauses.
- Official harness isolated run: not run (blocked — product missing stage-4 surface; would fail).
## Repro
PORT=18086 npm --prefix stage-4 start
curl -X POST localhost:18086/restaurants/r1/replans -H 'authorization: Bearer m' -H 'idempotency-key: k8' -H 'content-type: application/json' -d '{"table_id":"t_2","from":"2026-09-28T23:00:00+02:00","to":"2026-09-28T18:00:00+02:00"}' → 404 {"code":"not_found"} (expected 422 validation_failed)
curl -X POST localhost:18086/series/abc/amend -H 'authorization: Bearer x' -H 'idempotency-key: k9' -H 'content-type: application/json' -d '{"expected_revision":"bad"}' → 404 {"code":"not_found"} (expected 422)
