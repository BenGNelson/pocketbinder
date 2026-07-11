# PocketBinder

A self-hosted **Pokémon TCG collection tracker**. Browse every set from a local
catalog, track what you own, see your collection's market value, and generate a
one-click TCGplayer shopping list for the cards you're still missing.

_AI-assisted build._

---

## What it does

- **Browse every set** — the whole English catalog (~170 sets / ~20k cards),
  ingested from the public [`pokemon-tcg-data`](https://github.com/PokemonTCG/pokemon-tcg-data)
  dataset into a local SQLite database. Each set shows a completion bar.
- **See your collection** — the cards you own render in full colour, the ones you
  don't are dimmed, so the gaps read at a glance. A back-lit stats hero + a
  show-off wall put your collection front and centre.
- **Track it as a living thing** — tap any card to mark it owned, set a quantity,
  or add it to your wishlist. Edits are optimistic (instant, no flicker).
- **Market value** — with a free [pokemontcg.io](https://dev.pokemontcg.io) API
  key, the app refreshes TCGplayer/Cardmarket prices for the cards you own
  (daily, owned-only, so it stays ≤1 day fresh) and totals your collection value.
- **Buy what you're missing** — a "Buy missing" button turns a set's gaps (or your
  whole want-list) into a **TCGplayer Mass Entry** list. Paste it, and TCGplayer's
  own cart optimizer finds the fewest sellers to minimize shipping. PocketBinder
  builds the list; TCGplayer matches the sellers — no scraping.
- **Import an existing collection** — seed ownership once from a CSV/JSON keyed on
  set code + card number; a re-import refreshes the imported cards but preserves
  your in-app edits.

Mobile-first, installable-friendly, dark UI.

## Quick start

```bash
git clone https://github.com/BenGNelson/pocketbinder && cd pocketbinder
cp .env.example .env

# (optional but recommended) pull the full catalog — otherwise a 2-set example is used:
bash scripts/bootstrap-catalog.sh          # clones pokemon-tcg-data into ./data
#   → set CARD_DATA_SRC=./data/pokemon-tcg-data in .env

docker compose up --build -d               # backend + frontend
# open http://localhost:8088
```

The catalog indexes itself on first boot (a minute or so for the full dataset).
Card images are fetched from the public CDN and cached on demand — no bulk
download. For market value, add a free `POKEMONTCG_API_KEY` to `.env`.

For hot-reload development: `docker compose --profile dev up frontend-dev` (:5175).
Tests: `docker compose run --rm frontend-dev npm test` and, for the backend,
`docker compose run --rm backend pip install pytest && pytest`.

## How it works

- **Backend** — FastAPI + stdlib SQLite (no ORM). A background thread ingests the
  `pokemon-tcg-data` clone into `card_sets`/`cards` (mtime-skip, prune-on-clean-
  pass), and — when an API key is set — refreshes prices for owned cards only.
  Card faces are proxied from `images.pokemontcg.io` and cached as downscaled
  WebP on first view (the backend never redistributes images).
- **Frontend** — React + Vite + Tailwind. The set/search grids overlay your
  ownership; editing is optimistic. Card faces load same-origin through the proxy
  (the CSP is `img-src 'self'`).
- **Data model** — completion, owned counts, and value are pure SQL joins over a
  single `card_ownership` table. Rows carry a `source` (`pokellector` import vs
  `manual` edit) so a re-import never clobbers your in-app changes.

## Disclaimer

Not affiliated with, endorsed by, or sponsored by Nintendo / Game Freak /
Creatures / The Pokémon Company. "Pokémon" and card names/images are trademarks
and copyrights of their respective owners. This is a non-commercial fan tool.
Card metadata is from the public `pokemon-tcg-data` project; card images are
fetched at runtime and are not redistributed by this repository.

## License

[MIT](LICENSE).
