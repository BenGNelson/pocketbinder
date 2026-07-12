import { useRef, useState } from 'react'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import Cards from './modules/cards/Cards.jsx'
import SetView from './modules/cards/SetView.jsx'
import Search from './modules/cards/Search.jsx'
import Shop from './modules/cards/Shop.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import SetSidebar from './components/SetSidebar.jsx'

// PocketBinder — a self-hosted Pokémon TCG collection tracker. The shell is a
// master-detail app: a persistent sets sidebar on desktop (an off-canvas drawer on
// mobile, opened by the header hamburger) next to the card content, so cards stay
// the focus and switching sets never means scrolling back to a grid.
export default function App() {
  const [navOpen, setNavOpen] = useState(false)
  const navBtnRef = useRef(null)
  // Closing restores focus to the hamburger that opened the drawer (a11y).
  const closeNav = () => {
    setNavOpen(false)
    navBtnRef.current?.focus()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="pb-topbar sticky top-0 z-40 border-b border-[var(--line)] backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4 sm:gap-3">
          <button
            ref={navBtnRef}
            type="button"
            onClick={() => setNavOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={navOpen}
            aria-label="Browse sets"
            className="pb-btn-ghost flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-medium active:scale-95 lg:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">Sets</span>
          </button>
          <Link to="/" className="flex items-center gap-2">
            <span className="pb-ring block h-3.5 w-3.5 rounded-full" aria-hidden="true"></span>
            <span className="pb-wm pb-display text-xl font-bold tracking-tight">
              <span className="p">Pocket</span>
              <span>Binder</span>
            </span>
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <SetSidebar open={navOpen} onClose={closeNav} />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
            <Routes>
              <Route path="/" element={<Cards />} />
              <Route path="/search" element={<Search />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/sets/:setid" element={<SetView />} />
              {/* Back-compat: the hub used to live under /cards. */}
              <Route path="/cards" element={<Navigate to="/" replace />} />
              <Route path="/cards/search" element={<Navigate to="/search" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>

          <footer className="border-t border-[var(--line)] px-4 py-6 text-center text-xs text-[var(--dim)]">
            <p>
              Not affiliated with, endorsed by, or sponsored by Nintendo / The Pokémon Company.
              Pokémon and card images © their respective owners.
            </p>
            <p className="mt-1">
              Card data from{' '}
              <a
                href="https://github.com/PokemonTCG/pokemon-tcg-data"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-[var(--line)] hover:text-[var(--ink)]"
              >
                pokemon-tcg-data
              </a>
              .
            </p>
          </footer>
        </main>
      </div>
    </div>
  )
}
