#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/developer/EpicStaff"
BRANCH="${1:-main}"

echo ">> deploy branch: $BRANCH"

cd "$APP_DIR"

echo ">> git status"
git status --porcelain || true

echo ">> git fetch"
git fetch --prune

echo ">> git checkout $BRANCH"
git checkout "$BRANCH"

echo ">> git pull --ff-only origin $BRANCH"
git pull --ff-only origin "$BRANCH"

echo ">> cd src"
cd src

echo ">> docker compose down"
docker compose down --remove-orphans

echo ">> docker volume rm crew_pgdata"
docker volume rm crew_pgdata || true

echo ">> volume create crew_pgdata"
docker volume create crew_pgdata

FAILED=0

echo ">> docker compose up"
docker compose \
  --env-file .env \
  --env-file deploy.env \
  -f docker-compose.deploy.yaml \
  up --build -d --remove-orphans || FAILED=1

echo ">> last logs"
docker compose \
  --env-file .env \
  --env-file deploy.env \
  -f docker-compose.deploy.yaml \
  logs --tail=50 --no-color || true

echo ">> docker compose ps"
docker compose \
  --env-file .env \
  --env-file deploy.env \
  -f docker-compose.deploy.yaml \
  ps || true

if [ "$FAILED" = "1" ]; then
  echo "Deploy failed"

  exit 1
fi
echo ">> docker image prune"
docker image prune -f || true
echo "Deploy succeeded"
