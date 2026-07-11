"""Image helpers — turn full-size card faces into small WebP thumbnails so the
card grids load fast.

The card-image proxy (routers/cards.py) fetches a full-size face once, runs it
through `to_thumbnail`, and caches the WebP result — so every later load is a
small, locally-served file. Pure + isolated here so it's unit-tested without the
HTTP machinery.
"""

import io
import os
import tempfile

from PIL import Image

# Cap the decoded pixel count so a crafted/huge source image can't decompress
# into enough RAM to OOM the box. Real card faces are a few MP;
# 50 MP is generous. Pillow raises DecompressionBombError past 2x this, which the
# to_thumbnail try/except turns into a clean None (caller falls back).
Image.MAX_IMAGE_PIXELS = 50_000_000


def write_atomic(path: str, data: bytes) -> None:
    """Write bytes to `path` atomically: a temp file in the same dir, then
    os.replace() into place. Without this, two near-simultaneous requests for the
    same uncached image can interleave their writes, and a reader that opens the
    file mid-write sees — and then caches forever — a truncated image."""
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

# WebP is supported by every browser we target (incl. iOS Safari). 400px wide
# covers the grid thumbnails and the larger detail-page poster (~2.5x at the
# 160px display size) while shrinking a typical box-art/poster PNG from a few
# hundred KB down to ~20-40 KB.
DEFAULT_MAX_WIDTH = 400
DEFAULT_QUALITY = 80


def to_thumbnail(
    raw: bytes,
    max_width: int = DEFAULT_MAX_WIDTH,
    quality: int = DEFAULT_QUALITY,
) -> bytes | None:
    """Downscale `raw` to at most `max_width` (preserving aspect ratio, never
    upscaling) and re-encode as WebP. Returns the WebP bytes, or None if the
    input isn't a decodable image (caller then falls back to the original)."""
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception:
        return None

    # WebP saves RGB / RGBA; normalize palettes, CMYK, etc.
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")

    if img.width > max_width:
        height = max(1, round(img.height * max_width / img.width))
        img = img.resize((max_width, height), Image.LANCZOS)

    out = io.BytesIO()
    try:
        img.save(out, format="WEBP", quality=quality, method=6)
    except Exception:
        return None
    return out.getvalue()
