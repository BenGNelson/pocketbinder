// A small owned/unowned toggle in the corner of a card tile: tap to seat a card
// in your binder (or lift it out) without opening the detail modal — the fast way
// to fill a set. Rendered as a sibling of the card-face button so its tap is
// independent (no nested-button / propagation issues).
export default function OwnToggle({ owned, busy, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={owned}
      aria-label={owned ? 'Owned — tap to remove' : 'Mark owned'}
      title={owned ? 'Owned — tap to remove' : 'Mark owned'}
      className={`absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-sm font-extrabold leading-none shadow transition active:scale-90 disabled:opacity-60 ${
        owned ? 'pb-foil' : 'pb-chip-off'
      }`}
    >
      {owned ? '✓' : '+'}
    </button>
  )
}
