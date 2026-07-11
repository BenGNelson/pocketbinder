// A small owned/unowned toggle in the corner of a card tile: tap to add a card
// to your collection (or remove it) without opening the detail modal — the fast
// way to tick through a set. Rendered as a sibling of the card-face button so
// its tap is independent (no nested-button / propagation issues).
export default function OwnToggle({ owned, busy, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={owned}
      aria-label={owned ? 'Owned — tap to remove' : 'Mark owned'}
      title={owned ? 'Owned — tap to remove' : 'Mark owned'}
      className={`absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold shadow-md transition active:scale-90 disabled:opacity-60 ${
        owned
          ? 'border-fuchsia-300/60 bg-fuchsia-500 text-white'
          : 'border-white/20 bg-slate-950/70 text-slate-200 hover:text-white'
      }`}
    >
      {owned ? '✓' : '+'}
    </button>
  )
}
