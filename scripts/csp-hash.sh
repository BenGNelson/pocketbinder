#!/usr/bin/env bash
# Compute the CSP sha256 for the inline theme-init script in the built
# index.html. Run after a build; copy the printed value into the frontend
# nginx.conf script-src. Needs node (run in the build container if no host node):
#   docker run --rm -v "$PWD/frontend":/app -w /app node:20-alpine \
#     sh -c "npm ci && npm run build && node ../scripts/csp-hash.mjs dist/index.html"
set -euo pipefail
node "$(dirname "$0")/csp-hash.mjs" "${1:-frontend/dist/index.html}"
