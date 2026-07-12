"""Tests for the Pokémon Cards module: catalog parsing, the indexer's ingest +
prune, the ownership query/import logic (esp. re-import preserving in-app edits),
and the HTTP endpoints."""

import io
import json

import pytest
from PIL import Image

from app import card_sync, cards as cards_mod, db, images
from app.config import settings


def _png_bytes(w=800, h=1100, color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, format="PNG")
    return buf.getvalue()

# --- pure parsing (app/cards.py) -------------------------------------------


def test_sort_order_numeric_and_promo():
    assert cards_mod.sort_order("4") == 4
    assert cards_mod.sort_order("58") == 58
    # Letter-prefixed promos/holos have no numeric lead → a high sentinel so they
    # sort after the numbered cards, deterministically.
    assert cards_mod.sort_order("TG01") == cards_mod.sort_order("SWSH001")
    assert cards_mod.sort_order("4") < cards_mod.sort_order("TG01")


def test_parse_card_shapes_row():
    raw = {
        "id": "base1-4", "name": "Charizard", "supertype": "Pokémon",
        "subtypes": ["Stage 2"], "hp": "120", "types": ["Fire"], "number": "4",
        "rarity": "Rare Holo", "nationalPokedexNumbers": [6],
        "images": {"small": "s.png", "large": "l.png"}, "set": {"id": "base1"},
    }
    row = cards_mod.parse_card(raw, "base1")
    assert row["id"] == "base1-4"
    assert row["setid"] == "base1"
    assert row["sort_order"] == 4
    assert json.loads(row["types"]) == ["Fire"]
    assert row["image_large"] == "l.png"


def test_parse_card_and_set_skip_incomplete():
    assert cards_mod.parse_card({"name": "no id"}, "s") is None
    assert cards_mod.parse_set({"name": "no id"}) is None


def test_parse_ownership_csv_and_json_and_dedupe():
    csv_rows = cards_mod.parse_ownership(
        "setid,number,variant,qty\nbase1,4,holofoil,2\nbase1,58,,1\n", "own.csv"
    )
    by_id = {r["card_id"]: r for r in csv_rows}
    assert by_id["base1-4"]["variant"] == "holofoil"
    assert by_id["base1-4"]["qty"] == 2
    assert by_id["base1-58"]["variant"] == "normal"  # blank → default

    json_rows = cards_mod.parse_ownership(
        json.dumps([
            {"setid": "base1", "number": "4", "wishlist": "yes"},
            {"id": "swsh1-1", "qty": 3},
            {"setid": "base1", "number": "4", "qty": 9},  # dup (card_id,variant) → last wins
        ]),
        "own.json",
    )
    by_id = {r["card_id"]: r for r in json_rows}
    assert by_id["base1-4"]["qty"] == 9  # deduped, last row
    assert by_id["swsh1-1"]["qty"] == 3
    assert len(json_rows) == 2


def test_massentry_line_format():
    # TCGplayer Mass Entry resolves name-only lines: "<qty> <name>" (set/number omitted).
    assert cards_mod.massentry_line("Dragonite", "FO", "4") == "1 Dragonite"
    assert cards_mod.massentry_line("Alakazam", None, "1") == "1 Alakazam"
    assert cards_mod.massentry_line("Pikachu", "BS", "58", qty=2) == "2 Pikachu"


def test_extract_prices_prefers_holofoil_market():
    api_card = {
        "tcgplayer": {"prices": {
            "normal": {"market": 1.5},
            "holofoil": {"market": 42.0},
        }},
        "cardmarket": {"prices": {"trendPrice": 38.0}},
    }
    usd, eur = cards_mod.extract_prices(api_card)
    assert usd == 42.0 and eur == 38.0
    assert cards_mod.extract_prices({}) == (None, None)


# --- catalog fixtures ------------------------------------------------------

_SETS = [
    {"id": "base1", "name": "Base", "series": "Base", "printedTotal": 102,
     "total": 102, "ptcgoCode": "BS", "releaseDate": "1999/01/09", "images": {"logo": "lg"}},
    {"id": "swsh1", "name": "Sword & Shield", "series": "Sword & Shield",
     "printedTotal": 202, "total": 216, "ptcgoCode": "SSH", "releaseDate": "2020/02/07", "images": {}},
]
_CARDS = {
    "base1": [
        {"id": "base1-2", "name": "Blastoise", "number": "2", "rarity": "Rare Holo",
         "types": ["Water"], "images": {"small": "s", "large": "l"}},
        {"id": "base1-4", "name": "Charizard", "number": "4", "rarity": "Rare Holo",
         "types": ["Fire"], "images": {"small": "s", "large": "l"}},
        {"id": "base1-58", "name": "Pikachu", "number": "58", "rarity": "Common",
         "types": ["Lightning"], "images": {"small": "s", "large": "l"}},
    ],
    "swsh1": [
        {"id": "swsh1-1", "name": "Celebi V", "number": "1", "rarity": "Rare Holo V",
         "types": ["Grass"], "images": {"small": "s", "large": "l"}},
        {"id": "swsh1-25", "name": "Snom", "number": "25", "rarity": "Common",
         "types": ["Water"], "images": {"small": "s", "large": "l"}},
    ],
}


@pytest.fixture
def catalog():
    """Seed the catalog (2 sets, 5 cards) directly into the temp DB."""
    db.upsert_card_sets_many(cards_mod.parse_set(s) for s in _SETS)
    for setid, raws in _CARDS.items():
        db.upsert_cards_many(cards_mod.parse_card(c, setid) for c in raws)


def _write_data_dir(tmp_path, sets, cards):
    (tmp_path / "sets").mkdir()
    (tmp_path / "sets" / "en.json").write_text(json.dumps(sets))
    cdir = tmp_path / "cards" / "en"
    cdir.mkdir(parents=True)
    for setid, raws in cards.items():
        (cdir / f"{setid}.json").write_text(json.dumps(raws))


# --- indexer (app/card_sync.py) --------------------------------------------


def test_index_once_ingests_and_prunes(tmp_path, monkeypatch):
    _write_data_dir(tmp_path, _SETS, _CARDS)
    monkeypatch.setattr(settings, "card_data_dir", str(tmp_path))
    idx = card_sync.CardIndexer(enabled=True, interval=3600)

    n = idx.index_once()
    assert n == 5
    assert db.count_cards() == 5
    assert db.count_card_sets() == 2
    assert "base1-4" in db.card_ids()

    # Drop a card + a whole set from the source and re-index → both are pruned.
    trimmed_cards = {"base1": _CARDS["base1"][:2]}  # only base1, only 2 cards
    _write_data_dir_overwrite(tmp_path, _SETS[:1], trimmed_cards)
    idx.index_once()
    assert db.count_card_sets() == 1
    assert db.count_cards() == 2
    assert "swsh1-1" not in db.card_ids()


def _write_data_dir_overwrite(tmp_path, sets, cards):
    (tmp_path / "sets" / "en.json").write_text(json.dumps(sets))
    cdir = tmp_path / "cards" / "en"
    for f in cdir.glob("*.json"):
        f.unlink()
    for setid, raws in cards.items():
        (cdir / f"{setid}.json").write_text(json.dumps(raws))


def test_unreadable_set_file_does_not_prune(tmp_path, monkeypatch):
    """A corrupt/transient read of ONE set file must not delete that set's cards —
    the pass is marked unclean and the prune is skipped (regression guard)."""
    _write_data_dir(tmp_path, _SETS, _CARDS)
    monkeypatch.setattr(settings, "card_data_dir", str(tmp_path))
    idx = card_sync.CardIndexer(enabled=True, interval=3600)
    idx.index_once()
    assert db.count_cards() == 5

    # Corrupt swsh1's card file → its read raises; base1 still reads fine.
    (tmp_path / "cards" / "en" / "swsh1.json").write_text("{ this is not valid json")
    idx.index_once()
    # Nothing pruned — swsh1's cards survive the bad pass.
    assert db.count_cards() == 5
    assert "swsh1-1" in db.card_ids()


def test_index_price_refresh_noop_without_key(catalog, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "card_data_dir", str(tmp_path))
    monkeypatch.setattr(settings, "pokemontcg_api_key", "")
    idx = card_sync.CardIndexer(enabled=True, interval=3600)
    assert idx.refresh_prices() == 0  # no key → never hits the network


# --- ownership queries + import semantics -----------------------------------


def test_ownership_overlay_and_completion(catalog):
    db.replace_ownership("imported", [
        {"card_id": "base1-4", "variant": "holofoil", "qty": 1},
        {"card_id": "base1-58", "variant": "normal", "qty": 3},
    ])
    cards = {c["id"]: c for c in db.list_set_cards("base1")}
    assert cards["base1-4"]["owned"] == 1
    assert cards["base1-58"]["owned_qty"] == 3
    assert cards["base1-2"]["owned"] == 0  # unowned card in the same set

    sets = {s["setid"]: s for s in db.list_card_sets_with_counts()}
    assert sets["base1"]["card_count"] == 3
    assert sets["base1"]["owned"] == 2

    stats = db.collection_stats()
    assert stats["owned_unique"] == 2
    assert stats["owned_total_qty"] == 4
    assert stats["sets_completed"] == 0  # base1 has 3 cards, only 2 owned
    assert stats["total_value_usd"] is None  # no prices configured


def test_set_owned_value(client, catalog):
    """Per-set owned value = price × qty over the copies you own, surfaced on both
    the set list and the set detail; None (omitted) until prices are configured."""
    db.replace_ownership("imported", [
        {"card_id": "base1-4", "variant": "normal", "qty": 2},
        {"card_id": "base1-2", "variant": "normal", "qty": 1},
    ])
    # No prices yet → the value is null (excluded from the response) everywhere.
    sets = {s["setid"]: s for s in client.get("/api/cards/sets").json()["sets"]}
    assert sets["base1"].get("owned_value_usd") is None
    assert client.get("/api/cards/sets/base1").json()["set"].get("owned_value_usd") is None

    db.update_card_prices("base1-4", 300.0, None)  # 2 × 300 = 600
    db.update_card_prices("base1-2", 90.0, None)   # 1 × 90  = 90
    sets = {s["setid"]: s for s in client.get("/api/cards/sets").json()["sets"]}
    assert sets["base1"]["owned_value_usd"] == 690.0
    assert sets["swsh1"].get("owned_value_usd") is None  # own nothing there
    assert client.get("/api/cards/sets/base1").json()["set"]["owned_value_usd"] == 690.0


def test_stats_ignores_orphaned_ownership(catalog):
    """An ownership row for a card the catalog has since pruned must NOT inflate
    owned counts or push completion above 100% (stats join `cards`)."""
    db.upsert_ownership("base1-4", qty=1, source="manual")
    db.delete_cards_many(["base1-4"])  # simulate a catalog prune leaving the row
    stats = db.collection_stats()
    assert stats["owned_unique"] == 0  # the orphan doesn't count
    assert stats["completion_pct"] <= 100


def test_value_hidden_when_no_usd_price(catalog):
    """A priced-but-USD-less owned card (only a Cardmarket EUR price) shows no
    value tile — total_value_usd is None, not 0.0."""
    db.upsert_ownership("base1-4", qty=1, source="manual")
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE cards SET cardmarket_eur = 5.0, price_updated = 1.0 WHERE id = ?",
            ("base1-4",),
        )
    assert db.collection_stats()["total_value_usd"] is None


def test_search_owned_filter(catalog):
    db.replace_ownership("imported", [{"card_id": "base1-4", "variant": "normal", "qty": 1}])
    all_char = db.search_cards("char", owned=False)
    assert {c["id"] for c in all_char} == {"base1-4"}
    # A card you don't own is excluded when owned=True.
    assert db.search_cards("blastoise", owned=True) == []
    assert {c["id"] for c in db.search_cards("blastoise", owned=False)} == {"base1-2"}


def test_search_missing_filter(catalog):
    """`missing=True` returns only cards you don't own; `owned` wins if both set."""
    db.replace_ownership("imported", [{"card_id": "base1-4", "variant": "normal", "qty": 1}])
    # Charizard is owned, so it's excluded from the missing list…
    assert db.search_cards("char", missing=True) == []
    # …but Blastoise (unowned) shows up.
    assert {c["id"] for c in db.search_cards("blastoise", missing=True)} == {"base1-2"}
    # owned takes precedence when both flags are set.
    assert {c["id"] for c in db.search_cards("char", owned=True, missing=True)} == {"base1-4"}


def test_search_setids_filter(catalog):
    """`setids` scopes the search to the given sets (empty query browses them);
    it combines with the name query and the missing filter."""
    # Empty query, one set → every card in that set (the "shop a whole set" flow).
    assert {c["setid"] for c in db.search_cards("", setids=["base1"])} == {"base1"}
    # Two sets → the union.
    assert {c["setid"] for c in db.search_cards("", setids=["base1", "swsh1"])} == {"base1", "swsh1"}
    # A name query still applies within the scoped sets.
    assert {c["id"] for c in db.search_cards("char", setids=["base1"])} == {"base1-4"}
    assert db.search_cards("char", setids=["swsh1"]) == []
    # Combines with the missing filter.
    db.replace_ownership("imported", [{"card_id": "base1-4", "variant": "normal", "qty": 1}])
    assert "base1-4" not in {c["id"] for c in db.search_cards("", setids=["base1"], missing=True)}


def test_search_sort_by_value(catalog):
    """`sort='value'` orders owned cards by market price, high→low, with unpriced
    cards sinking to the bottom; the price rides along for display."""
    for cid in ("base1-2", "base1-4", "base1-58", "swsh1-1"):
        db.upsert_ownership(cid, qty=1)
    db.update_card_prices("base1-4", 300.0, None)  # Charizard, priciest
    db.update_card_prices("base1-2", 90.0, None)  # Blastoise
    db.update_card_prices("base1-58", 5.0, None)  # Pikachu
    # swsh1-1 stays unpriced (tcgplayer_usd is None).
    rows = db.search_cards("", owned=True, sort="value")
    assert [c["id"] for c in rows] == ["base1-4", "base1-2", "base1-58", "swsh1-1"]
    assert rows[0]["tcgplayer_usd"] == 300.0


def test_search_sort_by_recent(catalog):
    """`sort='recent'` orders by most-recent ownership edit first."""
    db.upsert_ownership("base1-2", qty=1, now_ms=1000)
    db.upsert_ownership("base1-4", qty=1, now_ms=3000)
    db.upsert_ownership("base1-58", qty=1, now_ms=2000)
    ids = [c["id"] for c in db.search_cards("", owned=True, sort="recent")]
    assert ids == ["base1-4", "base1-58", "base1-2"]


def test_search_sort_by_set_newest_first(catalog):
    """`sort='set'` orders by set release date, newest first."""
    for cid in ("base1-4", "swsh1-1"):
        db.upsert_ownership(cid, qty=1)
    ids = [c["id"] for c in db.search_cards("", owned=True, sort="set")]
    assert ids == ["swsh1-1", "base1-4"]  # swsh1 (2020) before base1 (1999)


def test_favorite_pins_to_top_and_roundtrips(catalog):
    """A favorited card leads under sort='favorite', carries the flag on the brief,
    and survives a get_card roundtrip."""
    db.upsert_ownership("base1-58", qty=1)              # Pikachu, not favorite
    db.upsert_ownership("base1-2", qty=1, favorite=1)   # Blastoise, favorite
    db.upsert_ownership("base1-4", qty=1)               # Charizard, not favorite
    db.update_card_prices("base1-4", 300.0, None)       # priciest, yet not pinned
    ids = [c["id"] for c in db.search_cards("", owned=True, sort="favorite")]
    assert ids[0] == "base1-2"  # the favorite leads despite Charizard being pricier
    cards = {c["id"]: c for c in db.search_cards("", owned=True)}
    assert cards["base1-2"]["favorite"] == 1
    assert cards["base1-4"]["favorite"] == 0
    # The flag persists on the full card detail.
    assert next(o for o in db.get_card("base1-2")["ownership"])["favorite"] == 1


def test_search_unknown_sort_falls_back_to_name(catalog):
    """An unrecognized sort value degrades to the default name ordering."""
    for cid in ("base1-2", "base1-4", "base1-58"):
        db.upsert_ownership(cid, qty=1)
    bogus = db.search_cards("", owned=True, sort="bogus")
    assert [c["id"] for c in bogus] == [c["id"] for c in db.search_cards("", owned=True, sort="name")]


def test_ownership_printing_roundtrip(catalog):
    """A card's printing (1st Ed / Shadowless / Unlimited) round-trips; unset is
    NULL, which the UI reads as the default Unlimited."""
    db.upsert_ownership("base1-4", qty=1, printing="1st_edition")
    row = next(o for o in db.get_card("base1-4")["ownership"] if o["variant"] == "normal")
    assert row["printing"] == "1st_edition"
    db.upsert_ownership("base1-2", qty=1)  # printing unset
    row2 = next(o for o in db.get_card("base1-2")["ownership"] if o["variant"] == "normal")
    assert row2["printing"] is None


def test_reimport_preserves_manual_edits(catalog):
    # An in-app edit (source='manual') on one card+variant.
    db.upsert_ownership("base1-4", variant="holofoil", qty=2, source="manual")
    # A re-import that also claims base1-4/holofoil, plus a new card.
    inserted, skipped = db.replace_ownership("imported", [
        {"card_id": "base1-4", "variant": "holofoil", "qty": 9},  # collides w/ manual
        {"card_id": "base1-58", "variant": "normal", "qty": 1},
    ])
    assert inserted == 1 and skipped == 1
    detail = db.get_card("base1-4")
    holo = next(o for o in detail["ownership"] if o["variant"] == "holofoil")
    assert holo["qty"] == 2 and holo["source"] == "manual"  # NOT clobbered to 9


def test_reimport_replaces_prior_imported_rows(catalog):
    db.replace_ownership("imported", [{"card_id": "base1-2", "variant": "normal", "qty": 1}])
    db.replace_ownership("imported", [{"card_id": "base1-4", "variant": "normal", "qty": 1}])
    owned = {c["id"] for c in db.search_cards("", owned=True)}
    assert owned == {"base1-4"}  # the first import's card was wiped


# --- endpoints -------------------------------------------------------------


def test_endpoints_over_client(client, catalog):
    sets = client.get("/api/cards/sets").json()["sets"]
    assert sets[0]["setid"] == "swsh1"  # newest release first
    assert {s["setid"] for s in sets} == {"base1", "swsh1"}

    detail = client.get("/api/cards/sets/base1").json()
    assert detail["set"]["card_count"] == 3
    assert len(detail["cards"]) == 3
    assert detail["cards"][0]["number"] == "2"  # sorted by number

    assert client.get("/api/cards/sets/nope").status_code == 404

    search = client.get("/api/cards/search?q=pika").json()
    assert search["total"] == 5
    assert {c["id"] for c in search["items"]} == {"base1-58"}

    card = client.get("/api/cards/card/base1-4").json()
    assert card["name"] == "Charizard" and card["set_name"] == "Base"
    assert card["types"] == ["Fire"]

    assert client.get("/api/cards/card/nope-1").status_code == 404


def test_wantlist_endpoints(client, catalog):
    # Own one Base card → the other two are the want-list; swsh1 owns nothing.
    db.replace_ownership("imported", [{"card_id": "base1-4", "variant": "normal", "qty": 1}])

    per_set = client.get("/api/cards/sets/base1/wantlist").json()
    assert per_set["total"] == 3 and per_set["missing"] == 2
    assert "1 Blastoise" in per_set["lines"]
    assert all("Charizard" not in ln for ln in per_set["lines"])  # owned → not in want-list
    assert client.get("/api/cards/sets/nope/wantlist").status_code == 404

    # Collection-wide: only sets you've started (base1) — swsh1 (0 owned) excluded.
    coll = client.get("/api/cards/wantlist").json()
    assert coll["total"] == 3  # base1's 3 cards; swsh1 not counted
    assert coll["missing"] == 2
    assert coll.get("setid") is None  # whole-collection list → no setid (exclude_none drops it)


def test_import_endpoint_reports_unmatched(client, catalog):
    payload = "setid,number\nbase1,4\nbase1,58\nzzz9,1\n"  # last has no catalog match
    res = client.post(
        "/api/cards/ownership/import",
        files={"file": ("own.csv", payload, "text/csv")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["imported"] == 2
    assert body["unmatched"] == ["zzz9-1"]
    assert body["total_rows"] == 3

    stats = client.get("/api/cards/stats").json()
    assert stats["owned_unique"] == 2


def test_ownership_put_delete(client, catalog):
    assert client.put("/api/cards/ownership", json={"card_id": "base1-4", "qty": 1}).status_code == 200
    assert client.put("/api/cards/ownership", json={"card_id": "nope-1", "qty": 1}).status_code == 404
    assert client.get("/api/cards/card/base1-4").json()["ownership"][0]["qty"] == 1
    assert client.request("DELETE", "/api/cards/ownership", params={"card_id": "base1-4"}).status_code == 204
    assert client.get("/api/cards/card/base1-4").json()["ownership"] == []


def test_image_404_without_source(client, catalog, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "card_art_dir", str(tmp_path / "art"))
    monkeypatch.setattr(settings, "cards_dir", "")
    # No image url on this (unknown) card → 404, no network.
    assert client.get("/api/cards/image?id=nope-1&size=small").status_code == 404


# --- image thumbnailing (app/images.py) ------------------------------------


def test_to_thumbnail_downscales_to_webp():
    raw = _png_bytes(800, 1100)
    out = images.to_thumbnail(raw, max_width=400)
    assert out is not None
    im = Image.open(io.BytesIO(out))
    assert im.format == "WEBP"
    assert (im.width, im.height) == (400, 550)  # aspect preserved, not upscaled
    assert len(out) < len(raw)


def test_to_thumbnail_rejects_non_image():
    assert images.to_thumbnail(b"not an image") is None


def test_write_atomic_overwrites_and_leaves_no_temp(tmp_path):
    p = tmp_path / "x.webp"
    images.write_atomic(str(p), b"hello")
    assert p.read_bytes() == b"hello"
    images.write_atomic(str(p), b"world")  # atomic replace
    assert p.read_bytes() == b"world"
    assert not any(f.suffix == ".tmp" for f in tmp_path.iterdir())  # no .tmp left behind


# --- image endpoint (proxy + cache) ----------------------------------------


def test_image_endpoint_serves_and_caches(client, catalog, tmp_path, monkeypatch):
    art, src = tmp_path / "art", tmp_path / "src"
    src.mkdir()
    (src / "s").write_bytes(_png_bytes(600, 800))  # base1-2's image_small url is "s"
    monkeypatch.setattr(settings, "card_art_dir", str(art))
    monkeypatch.setattr(settings, "cards_dir", str(src))

    r = client.get("/api/cards/image?id=base1-2&size=small")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/webp"
    cached = list(art.glob("*.webp"))
    assert len(cached) == 1  # written to the WebP cache

    # Second request is served from that cache (still 200, same one file).
    assert client.get("/api/cards/image?id=base1-2&size=small").status_code == 200
    assert len(list(art.glob("*.webp"))) == 1


def test_image_rejects_unknown_size(client, catalog):
    # size is constrained to small|large so novel values can't explode the cache.
    assert client.get("/api/cards/image?id=base1-2&size=huge").status_code == 422


# --- price refresh (app/card_sync.py) --------------------------------------


class _FakeResp:
    def __init__(self, data):
        self.status_code = 200
        self._data = data

    def json(self):
        return {"data": self._data}


def test_refresh_prices_updates_owned(catalog, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "card_data_dir", str(tmp_path))  # _configured()
    monkeypatch.setattr(settings, "pokemontcg_api_key", "k")
    db.upsert_ownership("base1-4", qty=1, source="manual")
    monkeypatch.setattr(
        card_sync.requests, "get",
        lambda *a, **k: _FakeResp([
            {"id": "base1-4", "tcgplayer": {"prices": {"holofoil": {"market": 99.5}}}}
        ]),
    )
    idx = card_sync.CardIndexer(enabled=True, interval=3600)
    assert idx.refresh_prices(now=1000.0) == 1
    card = db.get_card("base1-4")
    assert card["tcgplayer_usd"] == 99.5
    assert card["price_updated"] == 1000.0


def test_refresh_prices_stamps_unpriced_so_it_stops_requerying(catalog, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "card_data_dir", str(tmp_path))
    monkeypatch.setattr(settings, "pokemontcg_api_key", "k")
    db.upsert_ownership("base1-4", qty=1, source="manual")
    monkeypatch.setattr(card_sync.requests, "get", lambda *a, **k: _FakeResp([]))
    idx = card_sync.CardIndexer(enabled=True, interval=3600)
    idx.refresh_prices(now=1000.0)
    card = db.get_card("base1-4")
    assert card["tcgplayer_usd"] is None
    assert card["price_updated"] == 1000.0  # stamped, not left forever-null


# --- incremental indexing (mtime skip + version force) ---------------------


def test_index_skips_unchanged_then_forces_on_version_bump(tmp_path, monkeypatch):
    _write_data_dir(tmp_path, _SETS, _CARDS)
    monkeypatch.setattr(settings, "card_data_dir", str(tmp_path))
    idx = card_sync.CardIndexer(enabled=True, interval=3600)
    assert idx.index_once() == 5   # first pass upserts everything
    assert idx.index_once() == 0   # unchanged files skipped by mtime → nothing upserted
    db.set_meta("card_index_version", "stale")
    assert idx.index_once() == 5   # a parser-version bump forces a full re-upsert


# --- set-code alias + import via the human set code ------------------------


def test_set_code_aliases(catalog):
    alias = db.set_code_aliases()
    assert alias["BS"] == "base1" and alias["BASE1"] == "base1"
    assert alias["SSH"] == "swsh1"


def test_parse_ownership_resolves_set_code(catalog):
    alias = db.set_code_aliases()
    rows = cards_mod.parse_ownership("setid,number\nBS,4\nbase1,58\n", "o.csv", set_alias=alias)
    assert {r["card_id"] for r in rows} == {"base1-4", "base1-58"}


def test_parse_ownership_json_wrapper_and_malformed():
    rows = cards_mod.parse_ownership('{"cards":[{"setid":"base1","number":"4"}]}', "o.json")
    assert rows[0]["card_id"] == "base1-4"
    assert cards_mod.parse_ownership("not json at all", "o.json") == []  # bad json → []
    assert cards_mod.parse_ownership("", "o.csv") == []  # empty → []


def test_import_endpoint_accepts_set_code(client, catalog):
    res = client.post(
        "/api/cards/ownership/import",
        files={"file": ("o.csv", "setid,number\nBS,4\n", "text/csv")},
    )
    assert res.status_code == 200 and res.json()["imported"] == 1
    assert client.get("/api/cards/card/base1-4").json()["ownership"][0]["qty"] == 1
