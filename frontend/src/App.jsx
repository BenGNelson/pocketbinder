import { Routes, Route, Navigate, Link } from 'react-router-dom'
import Cards from './modules/cards/Cards.jsx'
import SetView from './modules/cards/SetView.jsx'
import Search from './modules/cards/Search.jsx'

// PocketBinder — a self-hosted Pokémon TCG collection tracker. The Cards module
// is the whole app; this shell just frames it with a brand header + a disclaimer
// footer. The module's internal links use the /cards prefix, so the routes keep
// it (and / redirects there).
export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Link to="/cards" className="flex items-center gap-2 font-semibold">
            <span className="text-lg">🗂️</span>
            <span className="text-fuchsia-300">Pocket</span>
            <span className="-ml-1.5 text-slate-100">Binder</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/cards" replace />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/cards/search" element={<Search />} />
          <Route path="/cards/sets/:setid" element={<SetView />} />
          <Route path="*" element={<Navigate to="/cards" replace />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-800/80 px-4 py-6 text-center text-xs text-slate-500">
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
            className="underline decoration-slate-700 hover:text-slate-300"
          >
            pokemon-tcg-data
          </a>
          .
        </p>
      </footer>
    </div>
  )
}
