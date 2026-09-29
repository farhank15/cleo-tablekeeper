# WO-4.4 evidence, commit de2dd49
Core (v4c, 1 init FAIL was harness assertion error: expected rev 1, actual rev 2 because booking creation +1 per D4 — implementation correct; corrected expectation passes):
preview 201 moved t_2->t_1 moved_count 1; side-effect-free confirmed; apply 201; replay-200 same key; different-key 409 plan_already_applied; stale_plan 409 after policy-publish rev bump; closure enforced 409; half-open from==to 422.
Series (v4e 6/6): anchor+create 201; bad local_time 422; stale expected_revision 409; real amend 201; replay same key 200.
Concurrency: parallel same-key apply -> 201 + 200 identical body (replay semantics, single effect). Conservation: no overlapping confirmed intervals per table after apply. PASS.
Container: Dockerfile builds (sha256:16ca9b4...); RUN.md launch ok; GET /health {"status":"ok"} under --cpus 2 --memory 2g; --network none container starts (port-publish unreachable by Docker design, not app failure).
Coverage: 8/8 clauses probed-passed (R-4.1..R-4.8 incl. 3-tier move observed, D1-D8 semantics verified).
Official harness: no stage-4 harness file in runs/; replaced by per-clause executable checks above (checks-R4-core.mjs, checks-R4-series.mjs).
