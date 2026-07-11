import { useSyncExternalStore } from 'react'

// Light/dark theme, defaulting to light. The choice is stamped on
// <html data-theme> (see index.html's no-flash init) and persisted. Components
// read it with useTheme(); toggleTheme() flips it.
const KEY = 'pb-theme'

function current() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* private mode / storage disabled — the in-memory attribute still applies */
  }
  window.dispatchEvent(new Event('pb-theme'))
}

export function toggleTheme() {
  setTheme(current() === 'dark' ? 'light' : 'dark')
}

export function useTheme() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('pb-theme', cb)
      return () => window.removeEventListener('pb-theme', cb)
    },
    current,
    () => 'light',
  )
}
