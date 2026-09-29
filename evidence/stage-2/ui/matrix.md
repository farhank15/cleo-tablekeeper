# Stage 2 UI state matrix (sentinel)
Routes (curl 200 text/html): / /signup /login /lookup
Testids present (curl grep, single index.html serving all routes): all R-2.7/2.8/2.10/2.11/2.12 + booking-uncertain + confirmation-tables + reservation-tables.
States: idle/searching (search-status), grid (availability-grid), no-slots exclusive (hidden toggling, B7), booking form+summary+prefill, booking-error (409 refresh+preserve), booking-uncertain (lost response, same key+body retry), confirmation (exact ref + details + tables), lookup detail/status/cancel/error, auth-error/current-user/logout.
Viewport: CSS audit — body max-width:100% + overflow-x:hidden; grid auto-fill minmax(140px,1fr); form-grid 1fr collapsing single column <700px; inputs max-width:100%; focus-visible rings; no fixed widths. 375px + desktop no-h-scroll by construction.
Browser sandbox note: fennec browser runs in separate env; localhost:8099 unreachable (ERR_CONNECTION_REFUSED). Verification via curl + static audit instead. Full journey verification deferred to release harness with network access.
