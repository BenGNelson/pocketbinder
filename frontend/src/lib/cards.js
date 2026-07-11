import { API_BASE } from './useApi.js'

// A card face, served same-origin through the backend proxy (never the external
// CDN — the proxy caches a downscaled WebP, and the CSP blocks external image
// hosts). size: 'small' (grid thumb) | 'large' (detail face).
export function cardImageUrl(id, size = 'small') {
  return `${API_BASE}/cards/image?id=${encodeURIComponent(id)}&size=${size}`
}

export function setHref(setid) {
  return `/sets/${encodeURIComponent(setid)}`
}

// TCGplayer's bulk-entry tool: paste a want-list, then optimize the cart to the
// fewest sellers to minimize shipping. The buy-helper hands off to it (no
// pre-fill URL exists, so it's copy-list → paste).
export const MASSENTRY_URL = 'https://www.tcgplayer.com/massentry'

// One TCGplayer Mass Entry line: "<qty> <name> <setcode> <number>" (mirrors the
// backend's massentry_line). Set code is the ptcgo code; it's omitted when absent
// (Mass Entry still matches on name + number). Used to build a buy-list from a
// hand-picked selection client-side, no round-trip needed.
export function massEntryLine(name, ptcgoCode, number, qty = 1) {
  return [qty, name?.trim(), ptcgoCode?.trim(), number != null ? String(number).trim() : '']
    .filter((p) => p !== '' && p != null)
    .join(' ')
}

// Build the /search href, optionally scoped to owned-only and/or ordered.
// `q`, the owned flag, and the sort all live in the URL so a search is
// refresh/share-safe. `sort` is omitted when it's the backend default ('name').
export function cardsSearchHref(q = '', { owned = false, sort = 'name' } = {}) {
  const parts = []
  if (q) parts.push(`q=${encodeURIComponent(q)}`)
  if (owned) parts.push('owned=1')
  if (sort && sort !== 'name') parts.push(`sort=${encodeURIComponent(sort)}`)
  return parts.length ? `/search?${parts.join('&')}` : '/search'
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
