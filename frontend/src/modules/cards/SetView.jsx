import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useApi } from '../../lib/useApi.js'
import { SkeletonLine } from '../../components/ui.jsx'
import { completionPct, formatUsdShort } from '../../lib/cards.js'
import CardTile from './CardTile.jsx'
import CardModal from './CardModal.jsx'

// One set: its completion header + a grid of EVERY card seated in binder pockets,
// with the ones you own in full colour and the ones you don't dimmed — so the
// gaps read at a glance. Tap a card's badge to seat it; an "owned only" toggle
// (kept in the URL) filters to what you have. Shopping for the gaps lives on its
// own page (Shop) — this view stays a clean binder.
export default function SetView() {
  const { setid } = useParams()
  const { data, loading, error } = useApi(`/cards/sets/${encodeURIComponent(setid)}`, 0)
  const [params, setParams] = useSearchParams()
  const ownedOnly = params.get('owned') === '1'
  const [modalId, setModalId] = useState(null)
  const [edits, setEdits] = useState({})

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
        edits[c.id]
          ? { ...c, owned: edits[c.id].owned, owned_qty: edits[c.id].qty, favorite: edits[c.id].favorite ?? c.favorite }
          : c,
      ),
    [data, edits],
  )
  const ownedCount = allCards.filter((c) => c.owned).length
  // Summed client-side (not the server field) so it tracks optimistic toggles.
  const ownedValue = allCards.reduce(
    (sum, c) => sum + (c.owned && c.tcgplayer_usd ? c.tcgplayer_usd * (c.owned_qty || 1) : 0),
    0,
  )
  const cards = ownedOnly ? allCards.filter((c) => c.owned) : allCards

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
                {ownedValue > 0 && (
                  <>
                    <span className="pb-val font-semibold">{formatUsdShort(ownedValue)}</span>
                    <span className="px-1.5 opacity-50">·</span>
                  </>
                )}
                {ownedCount.toLocaleString()} / {meta.card_count.toLocaleString()} ·{' '}
                {completionPct(ownedCount, meta.card_count)}%
              </span>
            </div>
            <span className="pb-bar block h-1.5 rounded">
              <span style={{ width: `${completionPct(ownedCount, meta.card_count)}%` }} />
            </span>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                checked={ownedOnly}
                onChange={(e) => setOwnedOnly(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Owned only
            </label>
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
