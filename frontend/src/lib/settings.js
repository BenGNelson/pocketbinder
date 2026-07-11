import { useSyncExternalStore } from 'react'

// User preferences that live only in the browser (no server round-trip), the
// same pattern as lib/theme.js: persisted in localStorage, changes broadcast on
// a window event so any component reading them re-renders.

const KEY = 'pb-collection-sort'

// How the "Your collection" wall is ordered. `id` is the backend `sort` value
// (see db._SEARCH_SORTS); `label` is what the settings menu shows.
export const COLLECTION_SORTS = [
  { id: 'value', label: 'Value · high to low', short: 'value' },
  { id: 'name', label: 'Name · A to Z', short: 'name' },
  { id: 'recent', label: 'Recently added', short: 'recently added' },
  { id: 'set', label: 'Set · newest first', short: 'set' },
]
const DEFAULT = 'value'
const IDS = COLLECTION_SORTS.map((s) => s.id)

function read() {
  try {
    const v = localStorage.getItem(KEY)
    return IDS.includes(v) ? v : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function setCollectionSort(id) {
  const val = IDS.includes(id) ? id : DEFAULT
  try {
    localStorage.setItem(KEY, val)
  } catch {
    /* private mode / storage disabled — falls back to the default next read */
  }
  window.dispatchEvent(new Event('pb-settings'))
}

export function useCollectionSort() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('pb-settings', cb)
      return () => window.removeEventListener('pb-settings', cb)
    },
    read,
    () => DEFAULT,
  )
}
