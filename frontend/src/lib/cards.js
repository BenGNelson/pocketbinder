import { API_BASE } from './useApi.js'

// The app accent (fuchsia) as an "r,g,b" string, for the back-lit radiance motif
// on the hub hero + show-off wall.
export const CARDS_RGB = '217,70,239' // fuchsia-500

// A card face, served same-origin through the backend proxy (never the external
// CDN — the proxy caches a downscaled WebP, and the CSP blocks external image
// hosts). size: 'small' (grid thumb) | 'large' (detail face).
export function cardImageUrl(id, size = 'small') {
  return `${API_BASE}/cards/image?id=${encodeURIComponent(id)}&size=${size}`
}

export function setHref(setid) {
  return `/cards/sets/${encodeURIComponent(setid)}`
}

// TCGplayer's bulk-entry tool: paste a want-list, then optimize the cart to the
// fewest sellers to minimize shipping. The buy-helper hands off to it (no
// pre-fill URL exists, so it's copy-list → paste).
export const MASSENTRY_URL = 'https://www.tcgplayer.com/massentry'

// Build the /cards/search href, optionally scoped to owned-only. `q` and the
// owned flag both live in the URL so a search is refresh/share-safe.
export function cardsSearchHref(q = '', { owned = false } = {}) {
  const parts = []
  if (q) parts.push(`q=${encodeURIComponent(q)}`)
  if (owned) parts.push('owned=1')
  return parts.length ? `/cards/search?${parts.join('&')}` : '/cards/search'
}

// Whole-number completion percentage, guarding a zero denominator.
export function completionPct(owned, total) {
  return total ? Math.round((100 * owned) / total) : 0
}

// A USD money string, or null when there's no value to show (so callers can hide
// the tile rather than print "$0" before prices are configured).
export function formatUsd(v) {
  if (v == null) return null
  return `$${Number(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
