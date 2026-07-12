"""
SQLite storage for PocketBinder — the Pokémon TCG catalog (sets + cards, ingested
from a local clone of the public pokemon-tcg-data dataset) plus your collection
overlay (which cards you own / want).

Stdlib `sqlite3`, no ORM — the schema is small and the queries are simple. The DB
lives on a Docker volume so it survives image rebuilds. Nothing secret is stored:
public-ish card metadata + your ownership (card id + variant + quantity).
"""

import json
import os
import sqlite3
import time
from contextlib import contextmanager

from app.config import settings

# DDL is idempotent — safe to run on every startup. Completion %, owned counts and
# set-completion are pure JOINs over card_ownership (no denormalized counters).
_SCHEMA = """
CREATE TABLE IF NOT EXISTS sync_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS card_sets (
    setid         TEXT PRIMARY KEY,   -- dataset id, e.g. 'base1', 'swsh1'
    name          TEXT NOT NULL,      -- 'Base', 'Sword & Shield'
    series        TEXT,               -- 'Base', 'Sword & Shield'
    printed_total INTEGER,            -- numbered cards ("102" of the set)
    total         INTEGER,            -- incl. secret rares
    ptcgo_code    TEXT,               -- the set's short code (also TCGplayer's set code)
    release_date  TEXT,               -- 'YYYY/MM/DD' as shipped (sorts lexically)
    symbol_url    TEXT,
    logo_url      TEXT
);

CREATE TABLE IF NOT EXISTS cards (
    id           TEXT PRIMARY KEY,    -- '<setid>-<number>', e.g. 'base1-4'
    setid        TEXT NOT NULL,
    number       TEXT NOT NULL,       -- printed number, a STRING (promos: 'TG01', 'SWSH001')
    sort_order   INTEGER,             -- leading integer of `number` for stable grid order
    name         TEXT NOT NULL,
    supertype    TEXT,                -- Pokémon | Trainer | Energy
    subtypes     TEXT,                -- JSON array
    rarity       TEXT,
    types        TEXT,                -- JSON array (Fire, Water, …)
    hp           TEXT,
    artist       TEXT,
    image_small  TEXT,                -- source url (images.pokemontcg.io/…)
    image_large  TEXT,
    national_dex TEXT,                -- JSON array
    -- Market value: populated only when a pokemontcg.io API key is set (live-API
    -- only, never in the static dump) by the indexer's owned-only daily refresh.
    tcgplayer_usd  REAL,
    cardmarket_eur REAL,
    price_updated  REAL
);
CREATE INDEX IF NOT EXISTS idx_cards_setid ON cards (setid, sort_order);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards (name COLLATE NOCASE);

-- Your collection overlay. One row per owned/wanted (card, variant). `source`
-- separates a bulk file import ('imported', wiped + rewritten on each re-import)
-- from in-app edits ('manual', which survive re-import) — so the app is the
-- living tracker without a re-import clobbering your changes.
CREATE TABLE IF NOT EXISTS card_ownership (
    card_id    TEXT NOT NULL,
    variant    TEXT NOT NULL DEFAULT 'normal',  -- normal|holofoil|reverseHolofoil|1stEdition
    qty        INTEGER NOT NULL DEFAULT 1,
    condition  TEXT,
    wishlist   INTEGER NOT NULL DEFAULT 0,       -- 1 = want (qty may be 0)
    favorite   INTEGER NOT NULL DEFAULT 0,       -- 1 = pinned to the top of your collection
    notes      TEXT,
    printing   TEXT,                             -- which printing you own: unlimited (default)|1st_edition|shadowless
    source     TEXT NOT NULL DEFAULT 'imported',  -- 'imported' | 'manual'
    updated_ms INTEGER NOT NULL,
    PRIMARY KEY (card_id, variant)
);
CREATE INDEX IF NOT EXISTS idx_card_ownership_card ON card_ownership (card_id);
"""


@contextmanager
def get_conn():
    """A short-lived connection with row access by column name."""
    os.makedirs(os.path.dirname(settings.db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(settings.db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    """Create tables if they don't exist. Idempotent; called on startup."""
    with get_conn() as conn:
        # WAL lets the background indexer write while request threads read without
        # blocking each other (the default rollback journal serializes them, which
        # shows up as "database is locked" under the first full catalog build).
        # It's a persistent DB-file setting, so once is enough.
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(_SCHEMA)
        # Migrations for DBs created before a column existed (CREATE TABLE
        # IF NOT EXISTS won't add columns to an existing table).
        _add_column_if_missing(conn, "card_ownership", "printing", "TEXT")
        _add_column_if_missing(conn, "card_ownership", "favorite", "INTEGER NOT NULL DEFAULT 0")


def _add_column_if_missing(conn, table, column, decl):
    have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
    if column not in have:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def get_meta(key, default=None):
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM sync_meta WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def set_meta(key, value):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sync_meta (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )


def _like_escape(s):
    """Escape LIKE wildcards so a query of literal % or _ doesn't match-all."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

# --- Pokémon card catalog + collection -------------------------------------
# The catalog (sets/cards) is bulk-upserted by the background indexer from the
# read-only pokemon-tcg-data clone; ownership is user-authored. Bulk upserts run
# in one transaction (executemany); the mtime/version prune guard lives in the
# indexer (card_sync.py), not here.

# Catalog columns the indexer writes. Prices live on `cards` too but are updated
# SEPARATELY (owned-only price refresh) so the catalog upsert must NOT touch them
# — otherwise every re-index would blank the prices.
_CARD_SET_COLS = (
    "setid", "name", "series", "printed_total", "total", "ptcgo_code",
    "release_date", "symbol_url", "logo_url",
)
_CARD_COLS = (
    "id", "setid", "number", "sort_order", "name", "supertype", "subtypes",
    "rarity", "types", "hp", "artist", "image_small", "image_large", "national_dex",
)


def _upsert_many(conn, table, cols, rows):
    """INSERT…ON CONFLICT(first col) upsert of `rows` (dicts) into `table`,
    updating every non-key column from the incoming row. One executemany."""
    tuples = [tuple(r.get(c) for c in cols) for r in rows]
    if not tuples:
        return
    key = cols[0]
    conn.executemany(
        f"INSERT INTO {table} ({','.join(cols)}) "  # noqa: S608 - constant cols
        f"VALUES ({','.join('?' * len(cols))}) "
        f"ON CONFLICT({key}) DO UPDATE SET "
        + ", ".join(f"{c}=excluded.{c}" for c in cols if c != key),
        tuples,
    )


def upsert_card_sets_many(records):
    """Bulk upsert set metadata (records = iterable of dicts with _CARD_SET_COLS)."""
    rows = list(records)
    if not rows:
        return
    with get_conn() as conn:
        _upsert_many(conn, "card_sets", _CARD_SET_COLS, rows)


def upsert_cards_many(records):
    """Bulk upsert card metadata, leaving the price columns untouched (records =
    iterable of dicts with _CARD_COLS)."""
    rows = list(records)
    if not rows:
        return
    with get_conn() as conn:
        _upsert_many(conn, "cards", _CARD_COLS, rows)


def card_set_ids():
    """Every setid in the catalog — lets the indexer prune sets no longer in the
    source dataset."""
    with get_conn() as conn:
        return {r["setid"] for r in conn.execute("SELECT setid FROM card_sets").fetchall()}


def card_ids():
    """Every card id in the catalog — for prune + ownership-import validation."""
    with get_conn() as conn:
        return {r["id"] for r in conn.execute("SELECT id FROM cards").fetchall()}


def delete_card_sets_many(ids):
    ids = list(ids)
    if not ids:
        return
    with get_conn() as conn:
        conn.executemany("DELETE FROM card_sets WHERE setid = ?", [(i,) for i in ids])


def delete_cards_many(ids):
    ids = list(ids)
    if not ids:
        return
    with get_conn() as conn:
        conn.executemany("DELETE FROM cards WHERE id = ?", [(i,) for i in ids])


def count_cards():
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM cards").fetchone()["n"]


def count_card_sets():
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM card_sets").fetchone()["n"]


def list_card_sets_with_counts():
    """Every set with its catalog card count + how many distinct cards you own
    (qty>0), newest release first. Completion is owned/card_count (always ≤100%
    since the denominator is what's actually in the catalog)."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT s.setid, s.name, s.series, s.printed_total, s.total, "
            "       s.ptcgo_code, s.release_date, s.symbol_url, s.logo_url, "
            "       COUNT(DISTINCT c.id) AS card_count, "
            "       COUNT(DISTINCT o.card_id) AS owned, "
            # Value of the copies you own in this set (price × qty, summed over the
            # owned variants); NULL for cards with no price, ignored by SUM.
            "       COALESCE(SUM(c.tcgplayer_usd * o.qty), 0) AS owned_value "
            "FROM card_sets s "
            "LEFT JOIN cards c ON c.setid = s.setid "
            "LEFT JOIN card_ownership o ON o.card_id = c.id AND o.qty > 0 "
            "GROUP BY s.setid "
            "ORDER BY s.release_date DESC, s.setid"
        ).fetchall()
        return [dict(r) for r in rows]


def get_card_set(setid):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT setid, name, series, printed_total, total, ptcgo_code, "
            "release_date, symbol_url, logo_url FROM card_sets WHERE setid = ?",
            (setid,),
        ).fetchone()
        return dict(row) if row else None


def set_code_aliases():
    """Map every set's dataset id AND its ptcgo code (both upper-cased) to the
    canonical setid, so an import file can key on the human-facing set code you
    actually know ('BS', 'SSH') or the dataset id ('base1', 'swsh1'). The setid
    is inserted first so a ptcgo-code collision can't shadow a real dataset id."""
    with get_conn() as conn:
        rows = conn.execute("SELECT setid, ptcgo_code FROM card_sets").fetchall()
    alias: dict[str, str] = {}
    for r in rows:
        alias[r["setid"].upper()] = r["setid"]
    for r in rows:
        if r["ptcgo_code"]:
            alias.setdefault(r["ptcgo_code"].upper(), r["setid"])
    return alias


# The card columns the browse/search endpoints return (no prices — those go on
# the detail view; no image url — the frontend builds it from the id via the
# /cards/image proxy). Aggregated ownership is added per query.
_CARD_LIST_COLS = "c.id, c.setid, c.number, c.name, c.rarity, c.supertype, c.types"


def list_set_cards(setid):
    """All cards in a set, in printed order, each with an ownership overlay
    (owned flag, total owned qty across variants, wishlist flag)."""
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT {_CARD_LIST_COLS}, c.tcgplayer_usd, "
            "  MAX(CASE WHEN o.qty > 0 THEN 1 ELSE 0 END) AS owned, "
            "  COALESCE(SUM(CASE WHEN o.qty > 0 THEN o.qty ELSE 0 END), 0) AS owned_qty, "
            "  MAX(COALESCE(o.wishlist, 0)) AS wishlist, "
            "  MAX(COALESCE(o.favorite, 0)) AS favorite "
            "FROM cards c LEFT JOIN card_ownership o ON o.card_id = c.id "
            "WHERE c.setid = ? "
            "GROUP BY c.id "
            "ORDER BY c.sort_order, c.number",
            (setid,),
        ).fetchall()
        return [dict(r) for r in rows]


# Collection/search sort → the ORDER BY clause. Whitelisted so the query param
# never reaches SQL as raw text; every option keeps a stable name/number tiebreak,
# and pushes rows with no value/date to the end.
_SEARCH_SORTS = {
    "name": "c.name COLLATE NOCASE, c.setid, c.sort_order",
    "value": "c.tcgplayer_usd IS NULL, c.tcgplayer_usd DESC, c.name COLLATE NOCASE",
    "recent": "updated_ms IS NULL, updated_ms DESC, c.name COLLATE NOCASE",
    "set": "s.release_date IS NULL, s.release_date DESC, c.sort_order, c.number",
    # Favorites first, then the priciest — so the cards you've starred lead the wall.
    "favorite": "favorite DESC, c.tcgplayer_usd IS NULL, c.tcgplayer_usd DESC, c.name COLLATE NOCASE",
}


def search_cards(q, owned=False, missing=False, limit=100, sort="name", setids=None):
    """Cards whose name matches `q` (case-insensitive substring), each with an
    ownership overlay + market price. An empty query returns the first `limit` in
    the chosen order (a browseable default). `owned=True` restricts to cards you
    own (qty>0); `missing=True` restricts to ones you don't (the shopping picker).
    `owned` wins if both are set. `setids` (a list) scopes the search to those
    sets — so the shopper can shop one or more sets at a time (empty query then
    browses those sets' cards). `sort` is one of _SEARCH_SORTS (unknown → 'name')."""
    q = (q or "").strip()
    order_by = _SEARCH_SORTS.get(sort, _SEARCH_SORTS["name"])
    having = "HAVING owned = 1" if owned else "HAVING owned = 0" if missing else ""
    join_sets = "JOIN card_sets s ON s.setid = c.setid " if sort == "set" else ""
    params, clauses = [], []
    if q:
        clauses.append("c.name LIKE ? ESCAPE '\\'")
        params.append(f"%{_like_escape(q)}%")
    if setids:
        clauses.append(f"c.setid IN ({','.join('?' * len(setids))})")
        params.extend(setids)
    where = ("WHERE " + " AND ".join(clauses) + " ") if clauses else ""
    params.append(limit)
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT {_CARD_LIST_COLS}, c.tcgplayer_usd, "
            "  MAX(CASE WHEN o.qty > 0 THEN 1 ELSE 0 END) AS owned, "
            "  COALESCE(SUM(CASE WHEN o.qty > 0 THEN o.qty ELSE 0 END), 0) AS owned_qty, "
            "  MAX(COALESCE(o.wishlist, 0)) AS wishlist, "
            "  MAX(COALESCE(o.favorite, 0)) AS favorite, "
            "  MAX(o.updated_ms) AS updated_ms "
            "FROM cards c LEFT JOIN card_ownership o ON o.card_id = c.id "
            f"{join_sets}{where}"
            f"GROUP BY c.id {having} "
            f"ORDER BY {order_by} LIMIT ?",
            params,
        ).fetchall()
        return [dict(r) for r in rows]


def get_card(card_id):
    """One card's full metadata (incl. prices) + its ownership rows, or None."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, setid, number, sort_order, name, supertype, subtypes, "
            "rarity, types, hp, artist, image_small, image_large, national_dex, "
            "tcgplayer_usd, cardmarket_eur, price_updated FROM cards WHERE id = ?",
            (card_id,),
        ).fetchone()
        if not row:
            return None
        card = dict(row)
        owns = conn.execute(
            "SELECT variant, qty, condition, wishlist, favorite, notes, printing, source, updated_ms "
            "FROM card_ownership WHERE card_id = ? ORDER BY variant",
            (card_id,),
        ).fetchall()
        card["ownership"] = [dict(o) for o in owns]
        return card


def get_card_image_urls(card_id):
    """(image_small, image_large) source URLs for a card, or (None, None)."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT image_small, image_large FROM cards WHERE id = ?", (card_id,)
        ).fetchone()
        return (row["image_small"], row["image_large"]) if row else (None, None)


def collection_stats():
    """Headline collection figures for the Cards hub hero: distinct owned cards,
    total copies, sets completed, overall completion %, and total market value
    (None until prices are populated)."""
    with get_conn() as conn:
        # Join `cards` so a stray ownership row for a card the catalog has since
        # pruned/renamed doesn't count — otherwise owned_unique could exceed the
        # (now smaller) catalog and push completion above 100%.
        own = conn.execute(
            "SELECT COUNT(DISTINCT o.card_id) AS owned_unique, "
            "COALESCE(SUM(o.qty), 0) AS owned_qty "
            "FROM card_ownership o JOIN cards c ON c.id = o.card_id "
            "WHERE o.qty > 0"
        ).fetchone()
        sets_total = conn.execute("SELECT COUNT(*) AS n FROM card_sets").fetchone()["n"]
        cards_total = conn.execute("SELECT COUNT(*) AS n FROM cards").fetchone()["n"]
        # Sets you've STARTED — own ≥1 card in (joined to the catalog so an orphaned
        # ownership row for a pruned card doesn't count a phantom set).
        in_progress = conn.execute(
            "SELECT COUNT(DISTINCT c.setid) AS n "
            "FROM card_ownership o JOIN cards c ON c.id = o.card_id WHERE o.qty > 0"
        ).fetchone()["n"]
        completed = conn.execute(
            "SELECT COUNT(*) AS n FROM ("
            "  SELECT s.setid, COUNT(DISTINCT c.id) AS cc, "
            "         COUNT(DISTINCT o.card_id) AS oo "
            "  FROM card_sets s "
            "  JOIN cards c ON c.setid = s.setid "
            "  LEFT JOIN card_ownership o ON o.card_id = c.id AND o.qty > 0 "
            "  GROUP BY s.setid HAVING cc > 0 AND oo = cc"
            ")"
        ).fetchone()["n"]
        value = conn.execute(
            "SELECT COALESCE(SUM(c.tcgplayer_usd * o.qty), 0) AS v "
            "FROM card_ownership o JOIN cards c ON c.id = o.card_id "
            "WHERE o.qty > 0 AND c.tcgplayer_usd IS NOT NULL"
        ).fetchone()["v"]
    owned_unique = own["owned_unique"] or 0
    return {
        "owned_unique": owned_unique,
        "owned_total_qty": own["owned_qty"] or 0,
        "sets": sets_total,
        "sets_in_progress": in_progress,
        "sets_completed": completed,
        "completion_pct": round(100 * owned_unique / cards_total, 1) if cards_total else 0.0,
        # None (not 0) when there's no priced value — so the UI hides the value tile
        # instead of showing "$0.00" (before a price refresh, or when owned cards
        # carry only a Cardmarket EUR price and no TCGplayer USD one).
        "total_value_usd": round(value, 2) if value else None,
    }


def owned_card_ids(stale_before=None):
    """Distinct card ids you own (qty>0) — the bounded set the price refresh
    fetches, so we never price all ~20k cards. With `stale_before` set, only
    return owned cards whose price is missing or older than that epoch time, so a
    daily refresh re-fetches just what's gone stale."""
    sql = (
        "SELECT DISTINCT o.card_id FROM card_ownership o "
        "JOIN cards c ON c.id = o.card_id WHERE o.qty > 0"
    )
    params: list = []
    if stale_before is not None:
        sql += " AND (c.price_updated IS NULL OR c.price_updated < ?)"
        params.append(stale_before)
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
        return [r["card_id"] for r in rows]


def update_card_prices(card_id, tcgplayer_usd, cardmarket_eur, now=None):
    """Write refreshed market prices onto a card (the owned-only price refresh)."""
    now = now if now is not None else time.time()
    with get_conn() as conn:
        conn.execute(
            "UPDATE cards SET tcgplayer_usd = ?, cardmarket_eur = ?, price_updated = ? "
            "WHERE id = ?",
            (tcgplayer_usd, cardmarket_eur, now, card_id),
        )


def replace_ownership(source, rows, now_ms=None):
    """Replace every `source` row with `rows` (each a dict with at least
    `card_id`), in one transaction. A (card_id, variant) already held by a
    DIFFERENT source (e.g. a 'manual' in-app edit) is preserved, never clobbered —
    so a re-import can't undo your changes. Returns (inserted, skipped) where
    skipped = rows that collided with a preserved row."""
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    with get_conn() as conn:
        conn.execute("DELETE FROM card_ownership WHERE source = ?", (source,))
        taken = {
            (r["card_id"], r["variant"])
            for r in conn.execute(
                "SELECT card_id, variant FROM card_ownership"
            ).fetchall()
        }
        insert = [
            r for r in rows
            if (r["card_id"], r.get("variant", "normal")) not in taken
        ]
        conn.executemany(
            "INSERT INTO card_ownership "
            "(card_id, variant, qty, condition, wishlist, notes, source, updated_ms) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    r["card_id"], r.get("variant", "normal"),
                    int(r.get("qty", 1) or 0), r.get("condition"),
                    int(r.get("wishlist", 0) or 0), r.get("notes"), source, now_ms,
                )
                for r in insert
            ],
        )
        return len(insert), len(rows) - len(insert)


def upsert_ownership(card_id, variant="normal", qty=1, condition=None,
                     wishlist=0, favorite=0, notes=None, printing=None, source="manual", now_ms=None):
    """Upsert one ownership row (the living-tracker edit path). Defaults to
    source='manual' so it survives a later re-import."""
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO card_ownership "
            "(card_id, variant, qty, condition, wishlist, favorite, notes, printing, source, updated_ms) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(card_id, variant) DO UPDATE SET "
            "qty = excluded.qty, condition = excluded.condition, "
            "wishlist = excluded.wishlist, favorite = excluded.favorite, notes = excluded.notes, "
            "printing = excluded.printing, "
            "source = excluded.source, updated_ms = excluded.updated_ms",
            (card_id, variant, int(qty or 0), condition, int(wishlist or 0),
             int(favorite or 0), notes, printing, source, now_ms),
        )


def delete_ownership(card_id, variant="normal"):
    """Remove one ownership row. Returns whether a row was deleted."""
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM card_ownership WHERE card_id = ? AND variant = ?",
            (card_id, variant),
        )
        return cur.rowcount > 0
