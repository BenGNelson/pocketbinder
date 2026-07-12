import { useRef, useState } from 'react'
import CardImage from './CardImage.jsx'
import OwnToggle from './OwnToggle.jsx'
import { PriceChip, FavoriteStar } from '../../components/ui.jsx'
import { ownCard, unownCard } from '../../lib/ownership.js'

// How long you hold before a press becomes a "peek" instead of a tap.
const HOLD_MS = 200

// One card in a browse grid: the face seated in a recessed binder pocket (opens
// the detail modal) plus a corner owned-toggle for fast in-place collecting.
// Toggling optimistically flips the tile — which plays the reveal when it becomes
// owned — then persists; a failure rolls the optimistic state back.
// `onOwnedChange(id, owned)` lets the parent update its edits overlay + stats.
//
// In `selectable` mode the card instead toggles a shopping-list selection: tapping
// it calls `onSelect(card)` and it shows a check when `selected`.
//
// A card you DON'T own is grayed; press-and-HOLD it to peek the full-color
// version (a soft bloom), release to let it settle back. A quick tap still
// opens/selects — the hold just suppresses that one click.
export default function CardTile({ card, label, onOpen, onOwnedChange, selectable = false, selected = false, onSelect }) {
  const [busy, setBusy] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const holdTimer = useRef(null)
  const peekedRef = useRef(false) // did this press turn into a peek? (suppresses the click)

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

  const startHold = (e) => {
    if (card.owned || e.button > 0) return // only grayed cards peek; ignore non-primary buttons
    peekedRef.current = false
    holdTimer.current = setTimeout(() => {
      peekedRef.current = true
      setPeeking(true)
    }, HOLD_MS)
  }
  const endHold = () => {
    clearTimeout(holdTimer.current)
    setPeeking(false)
  }
  const activate = () => {
    if (peekedRef.current) {
      peekedRef.current = false // that press was a peek, not a tap — swallow it
      return
    }
    selectable ? onSelect(card) : onOpen(card.id)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={activate}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={selectable ? selected : undefined}
        className={`block w-full select-none text-left [-webkit-touch-callout:none] ${
          peeking ? '' : 'active:scale-[0.97]'
        }`}
        title={card.name}
      >
        <div
          className={`pb-pocket relative rounded-[11px] p-1 ${
            selectable && selected ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]' : ''
          }`}
        >
          <CardImage card={card} owned={card.owned} dim={!card.owned} peek={peeking} />
          <PriceChip usd={card.tcgplayer_usd} />
          <FavoriteStar on={card.favorite} />
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
