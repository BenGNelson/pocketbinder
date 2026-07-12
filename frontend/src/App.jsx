import { Routes, Route, Navigate, Link } from 'react-router-dom'
import Cards from './modules/cards/Cards.jsx'
import SetView from './modules/cards/SetView.jsx'
import Search from './modules/cards/Search.jsx'
import Shop from './modules/cards/Shop.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'

// PocketBinder — a self-hosted Pokémon TCG collection tracker. The Cards module
// is the whole app; this shell frames it with a brand header (serif wordmark +
// binder ring, a light/dark toggle) and a disclaimer footer.
export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="pb-topbar sticky top-0 z-40 border-b border-[var(--line)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
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
      </main>

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
    </div>
  )
}
