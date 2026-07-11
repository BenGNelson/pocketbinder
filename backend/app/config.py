"""
Central configuration for the PocketBinder backend.

Everything host-specific (paths, keys) is read from the environment here and
nowhere else, so the app is reusable: clone it, supply your own .env. This is the
12-factor config principle. pydantic-settings reads env vars (and a local .env in
dev), coerces types, and gives one typed `settings` object to import anywhere.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Attribute names are lowercase; pydantic matches the UPPERCASE env vars
    # case-insensitively (CARD_DATA_DIR -> card_data_dir).

    server_name: str = "PocketBinder"
    api_port: int = 8000

    # SQLite lives on a Docker volume so it survives rebuilds (catalog + your
    # collection). Not a secret; configurable for non-Docker dev.
    db_path: str = "/data/pocketbinder.db"

    # The IN-CONTAINER path of the pokemon-tcg-data clone (sets/en.json +
    # cards/en/*.json). The compose file mounts the host clone here read-only
    # (default: the committed tiny example; set CARD_DATA_SRC in .env to your full
    # `git clone`). A background indexer ingests it into SQLite. Empty/missing dir
    # = "not configured". Named differently from the CARD_DATA_SRC mount var on
    # purpose so the host path never overrides this container path.
    card_data_dir: str = "/card-data"
    # OPTIONAL local originals of the card face images (archival full-res dump,
    # read-only). When set and a file is present the image endpoint serves it;
    # otherwise it proxies images.pokemontcg.io. Unset = proxy + cache on demand.
    cards_dir: str = ""
    # Where downscaled card face thumbnails are cached (WebP, keyed by card id +
    # size). On the writable data volume.
    card_art_dir: str = "/data/card-art"
    # The catalog indexer: parses the clone into SQLite. Set false to disable;
    # interval is how often it re-scans for a refreshed clone (unchanged set files
    # skipped by mtime). Default daily.
    cards_index_enabled: bool = True
    cards_index_interval: int = 86400
    # OPTIONAL free pokemontcg.io API key (dev.pokemontcg.io). Present = the
    # indexer refreshes market prices for the cards you OWN (a bounded set) on its
    # daily cadence, so collection value stays <=1 day stale. Absent = no prices.
    pokemontcg_api_key: str = ""

    # Comma-separated browser origins allowed to call the API cross-origin (CORS).
    # The SPA is served same-origin behind nginx, so it needs NOTHING here; leave
    # empty to deny all cross-origin browser access (the secure default).
    cors_allow_origins: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
