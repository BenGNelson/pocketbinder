import { useEffect, useRef, useState } from 'react'
import { cardImageUrl } from '../../lib/cards.js'

// A card face with a graceful fallback: if the proxy 404s (no image), show a
// titled placeholder instead of a broken image. `dim` grays + fades a card you
// don't own; `owned` seats it with a foil edge. Aspect 5:7 is the standard
// Pokémon card ratio (63×88mm).
//
// When `owned` transitions false→true (you just added it), the face plays a
// one-shot "reveal": a flip-to-color pop with a holographic shine. Self-clearing
// (onAnimationEnd) and honors prefers-reduced-motion via CSS.
//
// `peek` momentarily lifts the grayscale on a card you don't own (a soft color
// bloom) — "hold it up to the light" without collecting it. `lift` adds the scale
// pop (nice in a grid, to rise above neighbors; off in the modal, where the growth
// would just crowd the controls).
export default function CardImage({ card, size = 'small', owned = false, dim = false, peek = false, lift = true, className = '' }) {
  const [failed, setFailed] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [unrevealing, setUnrevealing] = useState(false)
  const wasOwned = useRef(owned)

  useEffect(() => {
    if (owned && !wasOwned.current) {
      setRevealing(true)
      setUnrevealing(false)
    } else if (!owned && wasOwned.current) {
      setUnrevealing(true)
      setRevealing(false)
    }
    wasOwned.current = owned
  }, [owned])

  const animating = revealing || unrevealing
  const grayed = dim && !animating && !peek
  const blooming = dim && peek && !animating

  return (
    <div
      onAnimationEnd={() => {
        setRevealing(false)
        setUnrevealing(false)
      }}
      className={`relative aspect-[5/7] overflow-hidden rounded-md bg-[var(--raised)] ${
        !animating ? 'transition-[filter,opacity,transform] duration-300 motion-reduce:transition-none' : ''
      } ${owned ? 'pb-seated' : ''} ${grayed ? 'opacity-45 grayscale' : ''} ${
        blooming && lift ? 'z-10 scale-[1.04] shadow-[var(--shadow)]' : ''
      } ${revealing ? 'pb-reveal pb-shine' : ''} ${unrevealing ? 'pb-unreveal' : ''} ${className}`}
    >
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
          <span className="line-clamp-3 text-xs font-medium text-[var(--ink)]">{card.name}</span>
          <span className="text-[11px] text-[var(--dim)]">#{card.number}</span>
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
