import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApi } from '../../lib/useApi.js'
import { massEntryLine } from '../../lib/cards.js'
import { useShopList, shopToggle, shopClear } from '../../lib/shopList.js'
import CardTile from './CardTile.jsx'
import SetFilter from '../../components/SetFilter.jsx'
import WantlistModal from './WantlistModal.jsx'

// Shop for cards: the hunting page. Search the whole catalog (defaulting to the
// cards you're MISSING), tap to drop them into a shopping list that spans any
// number of sets, then hand the list off to TCGplayer to find + buy. The list is
// browser-local (lib/shopList) so it survives a reload mid-hunt; picking here is
// the ONLY place cards get selected — the rest of the app stays a clean binder.
const SCOPES = [
  { id: 'missing', label: "Cards I'm missing", param: '&missing=1' },
  { id: 'all', label: 'All cards', param: '' },
]

export default function Shop() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const scope = SCOPES.some((s) => s.id === params.get('scope')) ? params.get('scope') : 'missing'
  const setids = params.getAll('set')
  const [showList, setShowList] = useState(false)
  const [showAll, setShowAll] = useState(false) // the "everything I'm missing" shortcut
  const list = useShopList()
  const picked = Object.values(list)

  const patch = (mut) => {
    const next = new URLSearchParams(params)
    mut(next)
    setParams(next, { replace: true })
  }
  const setQuery = (v) => patch((n) => (v ? n.set('q', v) : n.delete('q')))
  const setScope = (v) => patch((n) => (v === 'missing' ? n.delete('scope') : n.set('scope', v)))
  const toggleSet = (id) =>
    patch((n) => {
      const cur = n.getAll('set')
      n.delete('set')
      const next = cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]
      next.forEach((s) => n.append('set', s))
    })
  const clearSets = () => patch((n) => n.delete('set'))

  const { data: setsData } = useApi('/cards/sets', 0)
  const q = encodeURIComponent(query.trim())
  const scopeParam = SCOPES.find((s) => s.id === scope)?.param ?? ''
  const setParam = setids.map((s) => `&setid=${encodeURIComponent(s)}`).join('')
  const { data, loading } = useApi(`/cards/search?q=${q}${scopeParam}${setParam}&sort=name`, 0)
  const items = data?.items ?? []
  const lines = picked.map((c) => massEntryLine(c.name))

  return (
    <div className="space-y-4 pb-24">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-[var(--dim)]">
        <Link to="/" className="hover:text-[var(--ink)]">
          Binder
        </Link>
        <span className="px-1 opacity-60">/</span>
        <span className="text-[var(--ink)]">Shop for cards</span>
      </nav>

      <div>
        <h2 className="pb-display text-xl font-semibold text-[var(--ink)]">Shop for cards</h2>
        <p className="mt-0.5 text-sm text-[var(--dim)]">
          Tap cards from any set to build a shopping list, then find them on TCGplayer.{' '}
          <button
            onClick={() => setShowAll(true)}
            className="font-medium text-[var(--accent)] underline decoration-[var(--line)] underline-offset-2 hover:decoration-[var(--accent)]"
          >
            Or grab everything you’re missing →
          </button>
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={data ? `Search ${data.total.toLocaleString()} cards…` : 'Search cards…'}
        aria-label="Search cards"
        autoFocus
        className="pb-input w-full rounded-xl px-4 py-3"
      />

      <div className="flex flex-wrap items-center gap-2">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            onClick={() => setScope(s.id)}
            aria-pressed={scope === s.id}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium active:scale-95 ${
              scope === s.id ? 'pb-btn-accent' : 'pb-btn-ghost'
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="mx-0.5 hidden h-5 w-px self-center bg-[var(--line)] sm:block" aria-hidden="true" />
        <SetFilter sets={setsData?.sets ?? []} selected={setids} onToggle={toggleSet} onClear={clearSets} />
      </div>

      {loading && !data ? (
        <p className="text-sm text-[var(--dim)]">searching…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--dim)]">
          {scope === 'missing' && !query.trim()
            ? `You own every card ${setids.length ? 'in the selected set' + (setids.length === 1 ? '' : 's') : 'in the catalog'}. 🎉`
            : 'No matching cards.'}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((c) => (
            <CardTile
              key={c.id}
              card={c}
              label={c.name}
              selectable
              selected={!!list[c.id]}
              onSelect={shopToggle}
            />
          ))}
        </div>
      )}

      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <span className="text-sm font-medium text-[var(--ink)]">
              <span className="text-[var(--accent)]">{picked.length.toLocaleString()}</span> in your shopping list
            </span>
            <button
              onClick={shopClear}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--dim)] hover:text-[var(--ink)] active:scale-95"
            >
              Clear
            </button>
            <button
              onClick={() => setShowList(true)}
              className="pb-btn-accent ml-auto rounded-xl px-4 py-2 text-sm font-medium active:scale-95"
            >
              Get list ↗
            </button>
          </div>
        </div>
      )}

      {showList && (
        <WantlistModal
          lines={lines}
          title={`${picked.length.toLocaleString()} hand-picked card${picked.length === 1 ? '' : 's'}`}
          onClose={() => setShowList(false)}
        />
      )}
      {showAll && (
        <WantlistModal
          url="/cards/wantlist"
          title="Every card you’re missing from the sets you’re collecting"
          onClose={() => setShowAll(false)}
        />
      )}
    </div>
  )
}
