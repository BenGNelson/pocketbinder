// Shared UI primitives.
import { formatUsdShort } from '../lib/cards.js'

// A shimmering placeholder line, sized by the caller via className (used by the
// loading skeletons so the layout holds its shape instead of bouncing).
export function SkeletonLine({ className = '' }) {
  return <span className={`block animate-pulse rounded bg-[var(--line)] ${className}`} />
}

// A card's market price as a small overlay pill, anchored to a `relative` parent
// (the binder pocket). A translucent-dark background keeps it legible over any
// card art in both themes. Renders nothing when there's no price to show.
export function PriceChip({ usd }) {
  const label = formatUsdShort(usd)
  if (!label) return null
  return (
    <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-white">
      {label}
    </span>
  )
}

// A star badge pinning a favorited card, top-left of the pocket (clear of the
// owned-toggle top-right and the price chip bottom-left). Renders nothing when
// the card isn't a favorite.
export function FavoriteStar({ on }) {
  if (!on) return null
  return (
    <span
      className="pointer-events-none absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/90 text-xs font-bold leading-none text-amber-950 shadow"
      aria-label="Favorite"
      title="Favorite"
    >
      ★
    </span>
  )
}
