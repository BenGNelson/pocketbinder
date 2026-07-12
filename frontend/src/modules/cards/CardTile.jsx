import { useState } from 'react'
import CardImage from './CardImage.jsx'
import OwnToggle from './OwnToggle.jsx'
import { PriceChip } from '../../components/ui.jsx'
import { ownCard, unownCard } from '../../lib/ownership.js'

// One card in a browse grid: the face seated in a recessed binder pocket (opens
// the detail modal) plus a corner owned-toggle for fast in-place collecting.
// Toggling optimistically flips the tile — which plays the reveal when it becomes
// owned — then persists; a failure rolls the optimistic state back.
// `onOwnedChange(id, owned)` lets the parent update its edits overlay + stats.
//
// In `selectable` mode the card instead toggles a shopping-list selection: tapping
// it calls `onSelect(card)` and it shows a check when `selected`.
export default function CardTile({ card, label, onOpen, onOwnedChange, selectable = false, selected = false, onSelect }) {
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (busy) return
    const next = !card.owned
    setBusy(true)
    onOwnedChange(card.id, next) // optimistic
    try {
      if (next) await ownCard(card.id)
      else await unownCard(card.id)
    } catch {
      onOwnedChange(card.id, card.owned) // revert
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (selectable ? onSelect(card) : onOpen(card.id))}
        aria-pressed={selectable ? selected : undefined}
        className="block w-full text-left active:scale-[0.97]"
        title={card.name}
      >
        <div
          className={`pb-pocket relative rounded-[11px] p-1 ${
            selectable && selected ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]' : ''
          }`}
        >
          <CardImage card={card} owned={card.owned} dim={!card.owned} />
          <PriceChip usd={card.tcgplayer_usd} />
        </div>
        {label && <span className="mt-1 block truncate text-xs text-[var(--dim)]">{label}</span>}
      </button>
      {selectable ? (
        selected && (
          <span
            className="pb-foil pointer-events-none absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
            aria-hidden="true"
          >
            ✓
          </span>
        )
      ) : (
        <OwnToggle owned={card.owned} busy={busy} onToggle={toggle} />
      )}
    </div>
  )
}
