import { useEffect, useState } from 'react'
import { useApi, API_BASE } from '../../lib/useApi.js'
import { formatUsd } from '../../lib/cards.js'
import { formatAgo } from '../../lib/format.js'
import CardImage from './CardImage.jsx'

// Which printing of a card you own. Defaults to Unlimited (by far the most common
// for most collectors); the vintage runs are the pricier First Edition / Shadowless.
const PRINTINGS = [
  { id: 'unlimited', label: 'Unlimited' },
  { id: '1st_edition', label: '1st Edition' },
  { id: 'shadowless', label: 'Shadowless' },
]

// A card detail overlay, opened over a grid. Fetches the full card (metadata +
// market price + your ownership) and lets you edit your ownership — mark it
// owned, set a quantity, or add it to your wishlist. Those edits are `manual`
// (they survive a later re-import). Closes on backdrop click / Escape.
// `onMutated` lets the parent refresh its grid/stats after a change.
export default function CardModal({ cardId, onClose, onMutated }) {
  const { data, loading } = useApi(cardId ? `/cards/card/${encodeURIComponent(cardId)}` : null, 0)
  const [busy, setBusy] = useState(false)
  const [local, setLocal] = useState(null)
  useEffect(() => setLocal(null), [cardId])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!cardId) return null
  const usd = data ? formatUsd(data.tcgplayer_usd) : null
  const baseNormal = data?.ownership?.find((o) => o.variant === 'normal')
  const eff = local ?? {
    qty: baseNormal?.qty ?? 0,
    wishlist: !!(baseNormal && baseNormal.qty === 0 && baseNormal.wishlist),
    printing: baseNormal?.printing ?? 'unlimited',
  }
  const isOwned = eff.qty > 0
  const isWishlist = eff.qty === 0 && eff.wishlist
  const qty = eff.qty
  const printing = eff.printing ?? 'unlimited'
  const others = data?.ownership?.filter((o) => o.variant !== 'normal' && o.qty > 0) ?? []

  const apply = async (next, method, body) => {
    if (busy) return
    const prev = local
    setLocal(next)
    setBusy(true)
    onMutated?.(cardId, { owned: next.qty > 0, qty: next.qty })
    try {
      let url = `${API_BASE}/cards/ownership`
      const opts = { method }
      if (method === 'PUT') {
        opts.headers = { 'Content-Type': 'application/json' }
        opts.body = JSON.stringify(body)
      } else {
        url += `?card_id=${encodeURIComponent(body.card_id)}&variant=${encodeURIComponent(body.variant)}`
      }
      const res = await fetch(url, opts)
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
    } catch {
      setLocal(prev)
      const back = prev ?? { qty: baseNormal?.qty ?? 0 }
      onMutated?.(cardId, { owned: (back.qty ?? 0) > 0, qty: back.qty ?? 0 })
    } finally {
      setBusy(false)
    }
  }

  const markOwned = () =>
    apply({ qty: 1, wishlist: false, printing }, 'PUT', { card_id: cardId, variant: 'normal', qty: 1, wishlist: false, printing })
  const unown = () => apply({ qty: 0, wishlist: false }, 'DELETE', { card_id: cardId, variant: 'normal' })
  const setQty = (n) =>
    n <= 0
      ? unown()
      : apply({ qty: n, wishlist: false, printing }, 'PUT', { card_id: cardId, variant: 'normal', qty: n, wishlist: false, printing })
  const setPrinting = (p) =>
    apply({ qty: Math.max(1, qty), wishlist: false, printing: p }, 'PUT', {
      card_id: cardId,
      variant: 'normal',
      qty: Math.max(1, qty),
      wishlist: false,
      printing: p,
    })
  const toggleWishlist = () =>
    isWishlist
      ? unown()
      : apply({ qty: 0, wishlist: true }, 'PUT', { card_id: cardId, variant: 'normal', qty: 0, wishlist: true })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="pb-card relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-[var(--shadow)] sm:max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="pb-btn-ghost absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full active:scale-95"
        >
          ✕
        </button>

        {loading && !data ? (
          <div className="flex h-64 items-center justify-center text-sm text-[var(--dim)]">loading…</div>
        ) : data ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
            <div className="mx-auto w-48 shrink-0 sm:mx-0 sm:w-[46%] sm:max-w-[380px] sm:self-start">
              <CardImage card={data} size="large" owned={isOwned} dim={!isOwned} className="w-full" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <h2 className="pb-display text-lg font-semibold text-[var(--ink)]">{data.name}</h2>
                <p className="text-sm text-[var(--dim)]">
                  {data.set_name} · #{data.number}
                </p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                {data.rarity && <Field label="Rarity" value={data.rarity} />}
                {data.supertype && <Field label="Type" value={data.supertype} />}
                {data.types?.length > 0 && <Field label="Energy" value={data.types.join(', ')} />}
                {data.hp && <Field label="HP" value={data.hp} />}
                {data.artist && <Field label="Artist" value={data.artist} />}
              </dl>

              {usd && (
                <div className="pb-pocket rounded-xl p-3">
                  <div className="text-xs uppercase tracking-wide text-[var(--dim)]">Market value</div>
                  <div className="pb-val pb-display text-2xl font-bold">{usd}</div>
                  {data.price_updated && (
                    <div className="text-[11px] text-[var(--dim)]">as of {formatAgo(data.price_updated)}</div>
                  )}
                </div>
              )}

              <div className="pb-pocket rounded-xl p-3">
                <div className="text-xs uppercase tracking-wide text-[var(--accent)]">Your collection</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {isOwned ? (
                    <>
                      <span className="pb-tint rounded-lg px-2.5 py-1 text-sm font-medium">Owned</span>
                      <div className="flex items-center gap-1">
                        <StepBtn onClick={() => setQty(qty - 1)} disabled={busy} label="−" aria="Decrease quantity" />
                        <span className="w-6 text-center text-sm tabular-nums text-[var(--ink)]">{qty}</span>
                        <StepBtn onClick={() => setQty(qty + 1)} disabled={busy} label="+" aria="Increase quantity" />
                      </div>
                      <button
                        onClick={unown}
                        disabled={busy}
                        className="pb-btn-ghost rounded-lg px-2.5 py-1 text-sm active:scale-95 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={markOwned}
                        disabled={busy}
                        className="pb-btn-accent rounded-lg px-3 py-1.5 text-sm font-medium active:scale-95 disabled:opacity-50"
                      >
                        Mark owned
                      </button>
                      <button
                        onClick={toggleWishlist}
                        disabled={busy}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium active:scale-95 disabled:opacity-50 ${
                          isWishlist
                            ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-300'
                            : 'pb-btn-ghost'
                        }`}
                      >
                        {isWishlist ? 'On wishlist ✓' : 'Wishlist'}
                      </button>
                    </>
                  )}
                </div>
                {isOwned && (
                  <div className="mt-3">
                    <div className="text-[11px] uppercase tracking-wide text-[var(--dim)]">Printing</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {PRINTINGS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setPrinting(p.id)}
                          disabled={busy}
                          aria-pressed={printing === p.id}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium active:scale-95 disabled:opacity-50 ${
                            printing === p.id ? 'pb-tint' : 'pb-btn-ghost'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {others.length > 0 && (
                  <ul className="mt-2 text-xs text-[var(--dim)]">
                    {others.map((o) => (
                      <li key={o.variant}>
                        also owned: {o.qty}× {o.variant}
                        {o.condition ? ` · ${o.condition}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-[var(--dim)]">Your edits here survive a re-import.</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--accent)]">Couldn’t load this card.</p>
        )}
      </div>
    </div>
  )
}

function StepBtn({ onClick, disabled, label, aria }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      className="pb-btn-ghost flex h-7 w-7 items-center justify-center rounded-lg active:scale-95 disabled:opacity-50"
    >
      {label}
    </button>
  )
}

function Field({ label, value }) {
  return (
    <>
      <dt className="text-[var(--dim)]">{label}</dt>
      <dd className="truncate text-[var(--ink)]">{value}</dd>
    </>
  )
}
