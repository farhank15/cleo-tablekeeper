# Stage 4 — Tablekeeper

## Run (local)
PORT=8080 npm --prefix stage-4 start

## Run (docker)
docker build -t tablekeeper-stage4 ./stage-4
docker run --rm -p 8080:8080 -e PORT=8080 tablekeeper-stage4

Health: GET /health -> {"status":"ok"}
