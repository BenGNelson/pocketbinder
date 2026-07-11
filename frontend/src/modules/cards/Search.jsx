import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApi } from '../../lib/useApi.js'
import CardTile from './CardTile.jsx'
import CardModal from './CardModal.jsx'

// Search across every card by name, with an "owned only" toggle. Both the query
// and the toggle live in the URL (?q=&owned=1) so a search is refresh/share-safe
// and survives opening a card. Results dim the cards you don't own.
export default function Search() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const ownedOnly = params.get('owned') === '1'
  const sort = params.get('sort') || 'name'
  const [modalId, setModalId] = useState(null)
  const [edits, setEdits] = useState({})

  const patch = (mut) => {
    const next = new URLSearchParams(params)
    mut(next)
    setParams(next, { replace: true })
  }
  const setQuery = (val) => patch((n) => (val ? n.set('q', val) : n.delete('q')))
  const setOwnedOnly = (on) => patch((n) => (on ? n.set('owned', '1') : n.delete('owned')))

  const q = encodeURIComponent(query.trim())
  const { data, loading } = useApi(`/cards/search?q=${q}&owned=${ownedOnly ? 1 : 0}&sort=${sort}`, 0)
  const items = (data?.items ?? []).map((c) => (edits[c.id] ? { ...c, owned: edits[c.id].owned } : c))

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-[var(--dim)]">
        <Link to="/" className="hover:text-[var(--ink)]">
          Binder
        </Link>
        <span className="px-1 opacity-60">/</span>
        <span className="text-[var(--ink)]">Search</span>
      </nav>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={data ? `Search ${data.total.toLocaleString()} cards…` : 'Search cards…'}
        aria-label="Search cards"
        autoFocus
        className="pb-input w-full rounded-xl px-4 py-3"
      />
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--ink)]">
        <input
          type="checkbox"
          checked={ownedOnly}
          onChange={(e) => setOwnedOnly(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        Owned only
      </label>

      {loading && !data ? (
        <p className="text-sm text-[var(--dim)]">searching…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--dim)]">
          {query.trim() || ownedOnly ? 'No matching cards.' : 'Type to search, or browse a set.'}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((c) => (
            <CardTile
              key={c.id}
              card={c}
              label={c.name}
              onOpen={setModalId}
              onOwnedChange={(id, owned) => setEdits((e) => ({ ...e, [id]: { owned } }))}
            />
          ))}
        </div>
      )}

      {modalId && (
        <CardModal
          cardId={modalId}
          onClose={() => setModalId(null)}
          onMutated={(id, patch) => setEdits((e) => ({ ...e, [id]: patch }))}
        />
      )}
    </div>
  )
}
