import { useSyncExternalStore } from 'react'

// The in-progress shopping list — cards you've hand-picked to go find on TCGplayer.
// A hunt is a session, not saved collection state, so this lives only in the browser
// (localStorage, keyed by card id) — persisted so an accidental reload doesn't lose
// your picks, and broadcast on a window event so the picker grid + the header count
// stay in sync (same pattern as lib/settings.js). Each entry keeps just what a
// want-list line + a review row need. Clear it when the hunt's done.

const KEY = 'pb-shop-list'

let cache = load()

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function commit(next) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode / storage disabled — stays in memory for this session */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pb-shop'))
}

// A trimmed card record — enough to build the line and render a row (name-only
// lines mean `name` is what actually ships; the rest is for display/future use).
function pick(card) {
  return { id: card.id, name: card.name, number: card.number, setid: card.setid }
}

export function shopAdd(card) {
  if (!card?.id || cache[card.id]) return
  commit({ ...cache, [card.id]: pick(card) })
}

export function shopRemove(id) {
  if (!cache[id]) return
  const next = { ...cache }
  delete next[id]
  commit(next)
}

export function shopToggle(card) {
  if (!card?.id) return
  cache[card.id] ? shopRemove(card.id) : shopAdd(card)
}

export function shopClear() {
  if (Object.keys(cache).length) commit({})
}

// The picked cards as a stable object (id → record), re-rendering on any change.
export function useShopList() {
  return useSyncExternalStore(
    (cb) => {
      const reload = () => {
        cache = load() // another tab wrote the list — re-sync before notifying
        cb()
      }
      window.addEventListener('pb-shop', cb)
      window.addEventListener('storage', reload)
      return () => {
        window.removeEventListener('pb-shop', cb)
        window.removeEventListener('storage', reload)
      }
    },
    () => cache,
    () => cache,
  )
}
