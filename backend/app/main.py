"""
PocketBinder backend — FastAPI application entry point.

Creates the app, starts the background catalog indexer, and mounts the Cards API
under /api. A self-hosted Pokémon TCG collection tracker.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.card_sync import init_indexer
from app.config import settings
from app.db import init_db
from app.routers import cards


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the SQLite tables if they don't exist yet. Idempotent.
    init_db()
    # Catalog indexer: parses the pokemon-tcg-data clone into SQLite so every set
    # is browsable (no-op unless CARD_DATA_DIR is present). Also runs the
    # owned-only daily price refresh when a pokemontcg.io API key is set.
    card_indexer = init_indexer(settings.cards_index_enabled, settings.cards_index_interval)
    card_indexer.start()
    try:
        yield
    finally:
        card_indexer.stop()


tags_metadata = [
    {"name": "Cards", "description": "The Pokémon TCG collection — browse every set, track what you own, buy what you're missing."},
]

app = FastAPI(
    title="PocketBinder API",
    description=(
        "Backend for **PocketBinder**, a self-hosted Pokémon TCG collection "
        "tracker. Browse every set from a local catalog, track what you own, and "
        "generate a TCGplayer want-list for the cards you're missing. All routes "
        "are under `/api`; interactive docs live at `/api/docs`."
    ),
    version="1.0.0",
    openapi_tags=tags_metadata,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# CORS. The SPA is served same-origin (nginx proxies /api), so it needs no allowed
# origin — an empty CORS_ALLOW_ORIGINS denies all cross-origin browser access.
_cors_origins = [o.strip() for o in (settings.cors_allow_origins or "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


class HealthModel(BaseModel):
    status: str = Field(description="'ok' when the API process is responding")
    server: str


@app.get("/api/health", tags=["Cards"], response_model=HealthModel)
def health():
    """Liveness check — is the API process up and responding?"""
    return {"status": "ok", "server": settings.server_name}


app.include_router(cards.router, prefix="/api", tags=["Cards"])
