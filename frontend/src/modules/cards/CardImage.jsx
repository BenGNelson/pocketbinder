import { useEffect, useRef, useState } from 'react'
import { cardImageUrl } from '../../lib/cards.js'

// A card face with a graceful fallback: if the proxy 404s (no image), show a
// titled placeholder instead of a broken image. `dim` grays + fades the whole
// tile — used for cards you DON'T own in a set grid, so owned cards pop.
// Aspect 5:7 is the standard Pokémon card ratio (63×88mm).
//
// When `owned` transitions false→true (you just added it), the tile plays a
// one-shot "reveal": a flip-to-colour pop with a holographic shine. Managed
// here off the owned prop so both the grid badge and the modal trigger it; it's
// self-clearing (onAnimationEnd) and honours prefers-reduced-motion via CSS.
export default function CardImage({ card, size = 'small', owned = false, dim = false, className = '' }) {
  const [failed, setFailed] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const wasOwned = useRef(owned)

  useEffect(() => {
    if (owned && !wasOwned.current) setRevealing(true)
    wasOwned.current = owned
  }, [owned])

  return (
    <div
      onAnimationEnd={() => setRevealing(false)}
      className={`relative aspect-[5/7] overflow-hidden rounded-lg bg-slate-800 ${
        dim && !revealing ? 'opacity-40 grayscale' : ''
      } ${revealing ? 'pb-reveal pb-shine' : ''} ${className}`}
    >
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
          <span className="line-clamp-3 text-xs font-medium text-slate-300">{card.name}</span>
          <span className="text-[11px] text-slate-500">#{card.number}</span>
        </div>
      ) : (
        <img
          src={cardImageUrl(card.id, size)}
          alt={card.name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  )
}
