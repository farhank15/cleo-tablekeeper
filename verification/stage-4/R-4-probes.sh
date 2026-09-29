#!/bin/bash
# Per-clause probes for R-4.1..R-4.8, commit f4ab75f
BASE=${BASE:-http://localhost:3104}
fail=0; pass=0
probe(){ desc="$1"; shift; code=$(curl -s -o /tmp/probe_body -w "%{http_code}" "$@"); body=$(head -c 300 /tmp/probe_body); echo "$desc -> $code $body"; }
echo "== R-4.1 replan preview =="; probe "preview" -X POST $BASE/restaurants/R1/replans -H 'content-type: application/json' -H 'idempotency-key: k1' -d '{"table_id":"T1","from":"2026-01-01T18:00:00+00:00","to":"2026-01-01T20:00:00+00:00"}'
echo "== R-4.4 apply =="; probe "apply" -X POST $BASE/restaurants/R1/replans/p1/apply -H 'content-type: application/json' -H 'idempotency-key: k2' -d '{}'
echo "== R-4.6 series amend =="; probe "amend" -X POST $BASE/series/S1/amend -H 'content-type: application/json' -d '{"expected_revision":1,"from_index":0,"local_time":"18:00"}'
