# WO-4.4 fresh re-run per prime binding ruling, port 18085, HEAD 06d159d
- git diff de2dd49 HEAD -- stage-4/src/server.js: empty (product code identical).
- Core suite: 12/12 PASS (preview 201 move, side-effect-free, apply 201 rev 2, replay-200, applied-409, stale-409, closure-409, half-open 422).
- Series suite: 6/6 PASS (create, badtime 422, stale 409, amend 201, replay 200).
- Conservation + concurrency previously verified at b973a81; unchanged code.
