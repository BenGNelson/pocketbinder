import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useApi } from '../../lib/useApi.js'
import { SkeletonLine } from '../../components/ui.jsx'
import { completionPct, massEntryLine } from '../../lib/cards.js'
import CardTile from './CardTile.jsx'
import CardModal from './CardModal.jsx'
import WantlistModal from './WantlistModal.jsx'

// One set: its completion header + a grid of EVERY card seated in binder pockets,
// with the ones you own in full colour and the ones you don't dimmed — so the
// gaps read at a glance. Tap a card's badge to seat it; an "owned only" toggle
// (kept in the URL) filters to what you have.
export default function SetView() {
  const { setid } = useParams()
  const { data, loading, error } = useApi(`/cards/sets/${encodeURIComponent(setid)}`, 0)
  const [params, setParams] = useSearchParams()
  const ownedOnly = params.get('owned') === '1'
  const [modalId, setModalId] = useState(null)
  const [edits, setEdits] = useState({})
  // Buy-list selection: tap cards to hand-pick which to buy (vs. "all missing").
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [buyLines, setBuyLines] = useState(null) // non-null → the buy modal is open

  const setOwnedOnly = (on) => {
    const next = new URLSearchParams(params)
    if (on) next.set('owned', '1')
    else next.delete('owned')
    setParams(next, { replace: true })
  }

  const meta = data?.set
  const allCards = useMemo(
    () =>
      (data?.cards ?? []).map((c) =>
        edits[c.id] ? { ...c, owned: edits[c.id].owned, owned_qty: edits[c.id].qty } : c,
      ),
    [data, edits],
  )
  const ownedCount = allCards.filter((c) => c.owned).length
  const cards = ownedOnly ? allCards.filter((c) => c.owned) : allCards
  const missingCards = allCards.filter((c) => !c.owned)
  const missingCount = missingCards.length

  const toggleSelect = (id) =>
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
  }
  const openBuySelected = () =>
    setBuyLines(
      allCards.filter((c) => selected.has(c.id)).map((c) => massEntryLine(c.name, meta?.ptcgo_code, c.number)),
    )

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-[var(--dim)]">
        <Link to="/" className="hover:text-[var(--ink)]">
          Binder
        </Link>
        <span className="px-1 opacity-60">/</span>
        <span className="text-[var(--ink)]">{meta?.name || setid}</span>
      </nav>

      {error && <p className="text-sm text-[var(--accent)]">unavailable — {error}</p>}
      {loading && !data && <HeaderSkeleton />}

      {meta && (
        <>
          <header className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="pb-display text-xl font-semibold text-[var(--ink)]">{meta.name}</h2>
              <span className="shrink-0 text-sm tabular-nums text-[var(--dim)]">
                {ownedCount.toLocaleString()} / {meta.card_count.toLocaleString()} ·{' '}
                {completionPct(ownedCount, meta.card_count)}%
              </span>
            </div>
            <span className="pb-bar block h-1.5 rounded">
              <span style={{ width: `${completionPct(ownedCount, meta.card_count)}%` }} />
            </span>
            {selectMode ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <span className="font-medium text-[var(--ink)]">{selected.size.toLocaleString()} selected</span>
                <button
                  onClick={() => setSelected(new Set(missingCards.map((c) => c.id)))}
                  className="pb-btn-ghost rounded-lg px-3 py-1.5 font-medium active:scale-95"
                >
                  Select all missing{missingCount ? ` (${missingCount.toLocaleString()})` : ''}
                </button>
                {selected.size > 0 && (
                  <button
                    onClick={() => setSelected(new Set())}
                    className="pb-btn-ghost rounded-lg px-3 py-1.5 font-medium active:scale-95"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={openBuySelected}
                  disabled={selected.size === 0}
                  className="pb-btn-accent rounded-lg px-3 py-1.5 font-medium active:scale-95 disabled:opacity-50"
                >
                  Buy selected ({selected.size.toLocaleString()})
                </button>
                <button
                  onClick={exitSelect}
                  className="rounded-lg px-3 py-1.5 font-medium text-[var(--dim)] hover:text-[var(--ink)] active:scale-95"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--ink)]">
                  <input
                    type="checkbox"
                    checked={ownedOnly}
                    onChange={(e) => setOwnedOnly(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  Owned only
                </label>
                {missingCount > 0 && (
                  <button
                    onClick={() => setSelectMode(true)}
                    className="pb-tint rounded-lg px-3 py-1.5 text-sm font-medium active:scale-95"
                  >
                    Select cards to buy
                  </button>
                )}
              </div>
            )}
          </header>

          {cards.length === 0 ? (
            <p className="text-sm text-[var(--dim)]">
              {ownedOnly ? 'You don’t own any cards from this set yet.' : 'No cards in this set.'}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {cards.map((c) => (
                <CardTile
                  key={c.id}
                  card={c}
                  label={`#${c.number}`}
                  onOpen={setModalId}
                  onOwnedChange={(id, owned) =>
                    setEdits((e) => ({ ...e, [id]: { owned, qty: owned ? 1 : 0 } }))
                  }
                  selectable={selectMode}
                  selected={selected.has(c.id)}
                  onSelect={toggleSelect}
                />
              ))}
            </div>
          )}
        </>
      )}

      {modalId && (
        <CardModal
          cardId={modalId}
          onClose={() => setModalId(null)}
          onMutated={(id, patch) => setEdits((e) => ({ ...e, [id]: patch }))}
        />
      )}
      {buyLines && meta && (
        <WantlistModal
          lines={buyLines}
          title={`${meta.name} — ${buyLines.length.toLocaleString()} hand-picked card${
            buyLines.length === 1 ? '' : 's'
          }`}
          onClose={() => setBuyLines(null)}
        />
      )}
    </div>
  )
}

function HeaderSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <SkeletonLine className="h-6 w-40" />
      <SkeletonLine className="h-2 w-full" />
    </div>
  )
}
