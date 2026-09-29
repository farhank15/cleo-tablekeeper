# Stage 3 — Tablekeeper

## Run (local)
PORT=8080 npm --prefix stage-2 start

## Run (docker)
docker build -t tablekeeper-stage3 ./stage-2
docker run --rm -p 8080:8080 -e PORT=8080 tablekeeper-stage3

Health: GET /health -> {"status":"ok"}
