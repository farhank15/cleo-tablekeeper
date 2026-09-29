# Stage 1 — Tablekeeper

## Run (local)
PORT=8080 npm start

## Run (docker)
docker build -t tablekeeper-stage1 ./stage-1
docker run --rm -p 8080:8080 -e PORT=8080 tablekeeper-stage1

Health: GET /health -> {"status":"ok"}
