import { useState } from 'react'
import CardImage from './CardImage.jsx'
import OwnToggle from './OwnToggle.jsx'
import { ownCard, unownCard } from '../../lib/ownership.js'

// One card in a browse grid: the face seated in a recessed binder pocket (opens
// the detail modal) plus a corner owned-toggle for fast in-place collecting.
// Toggling optimistically flips the tile — which plays the reveal when it becomes
// owned — then persists; a failure rolls the optimistic state back.
// `onOwnedChange(id, owned)` lets the parent update its edits overlay + stats.
export default function CardTile({ card, label, onOpen, onOwnedChange }) {
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
        onClick={() => onOpen(card.id)}
        className="block w-full text-left active:scale-[0.97]"
        title={card.name}
      >
        <div className="pb-pocket rounded-[11px] p-1">
          <CardImage card={card} owned={card.owned} dim={!card.owned} />
        </div>
        {label && <span className="mt-1 block truncate text-xs text-[var(--dim)]">{label}</span>}
      </button>
      <OwnToggle owned={card.owned} busy={busy} onToggle={toggle} />
    </div>
  )
}
