#!/usr/bin/env bash
# Clone the public pokemon-tcg-data dataset (the whole English catalog as static
# JSON) so PocketBinder can index every set. Run once; `git pull` it later for
# new sets. Then point CARD_DATA_SRC at it in .env and (re)start the backend.
set -euo pipefail

DEST="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data/pokemon-tcg-data}"

if [ -d "$DEST/.git" ]; then
  echo "Updating existing clone at $DEST …"
  git -C "$DEST" pull --ff-only
else
  echo "Cloning pokemon-tcg-data → $DEST …"
  git clone --depth 1 https://github.com/PokemonTCG/pokemon-tcg-data "$DEST"
fi

echo
echo "Done. Now set this in your .env and restart the backend:"
echo "    CARD_DATA_SRC=$DEST"
echo "    docker compose up -d backend"
