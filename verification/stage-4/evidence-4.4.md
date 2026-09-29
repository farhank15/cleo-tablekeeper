# Stage-4 WO-4.4 evidence (commit f4ab75f)
- R-4.1 preview POST /restaurants/R1/replans -> 404 not_found (expected 201/409/422 per clause). FAIL
- R-4.4 apply POST /restaurants/R1/replans/p1/apply -> 404 not_found. FAIL
- R-4.6 amend POST /series/S1/amend -> 401 unauthenticated (route prefix exists at /series but amend sub-route unconfirmed; no auth token path probed further). FAIL (no clause behavior demonstrated)
- R-4.2/R-4.3/R-4.5/R-4.7/R-4.8 depend on above routes -> NOT-PROBED (blocked).
- Coverage: 0/8 probed-passed.
- Conservation invariant: not assertable (no state transitions observable).
- Official harness: no stage-4 harness file found in runs/ (only stage-3-acceptance.md); isolated-mode run not possible -> FAIL per mandate.
