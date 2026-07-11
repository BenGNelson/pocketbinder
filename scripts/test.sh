#!/usr/bin/env bash
# Run the backend (pytest) and frontend (vitest) suites in throwaway containers —
# no host Python/Node required.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== backend (pytest) =="
docker run --rm -v "$ROOT/backend":/app -w /app python:3.12-slim \
  sh -c "pip install --quiet -r requirements.txt -r requirements-dev.txt && python -m pytest -q"

echo
echo "== frontend (vitest) =="
docker run --rm -v "$ROOT/frontend":/app -w /app node:20-alpine \
  sh -c "npm ci --silent && npm test"
