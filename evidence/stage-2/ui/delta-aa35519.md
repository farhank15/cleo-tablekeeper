# DELTA aa35519 — re-mounted auth nodes unhidden on sign-in (R-2.7)
Fix: `cu.hidden=false;lo.hidden=false` after re-mount in showAuth; logout-detach (`remove()`) kept.
Verify (node static): FIX-PRESENT, LOGOUT-DETACH-KEPT.
Viewport: styles.css unchanged by this commit (1-line app.js only); overflow-x:hidden present (1x), grid minmax(140px,1fr) present (1x) — 375px/desktop no-h-scroll construction from gate8 matrix holds.
Browser sandbox: fennec browser cannot reach localhost (ERR_CONNECTION_REFUSED / host.docker.internal unresolvable); live re-login journey deferred to release harness.
