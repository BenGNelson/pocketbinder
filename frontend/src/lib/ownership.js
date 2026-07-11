import { API_BASE } from './useApi.js'

// Ownership mutations shared by the card modal and the in-grid quick-toggle.
// Both write 'manual' edits (server-side) that survive a later re-import.

// Mark a card owned (qty ≥ 1).
export async function ownCard(cardId, { qty = 1, variant = 'normal' } = {}) {
  const res = await fetch(`${API_BASE}/cards/ownership`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_id: cardId, variant, qty, wishlist: false }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// Remove a card from your collection. A 404 (already gone) counts as success.
export async function unownCard(cardId, { variant = 'normal' } = {}) {
  const url = `${API_BASE}/cards/ownership?card_id=${encodeURIComponent(
    cardId,
  )}&variant=${encodeURIComponent(variant)}`
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
}
