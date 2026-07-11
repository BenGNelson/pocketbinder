import { useEffect, useState } from 'react'
import { useApi } from '../../lib/useApi.js'
import { MASSENTRY_URL } from '../../lib/cards.js'

// The buy-helper: shows a set of cards as a TCGplayer Mass Entry want-list. Copy
// it, open Mass Entry, paste, then optimize the cart to the fewest sellers to
// minimize shipping — TCGplayer does the seller-matching; we just generate the
// list. Feed it either a `url` (server builds the list — e.g. all missing in a
// set) or ready-made `lines` (a hand-picked selection built client-side).
export default function WantlistModal({ url, lines, title, onClose }) {
  const { data, error, loading } = useApi(lines ? null : url, 0)
  const [copied, setCopied] = useState(false)
  const rows = lines ?? data?.lines ?? []
  const missing = lines ? lines.length : data?.missing ?? 0
  const ready = lines ? true : !!data
  const text = rows.join('\n')

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false) // clipboard blocked (rare) — the textarea is selectable as a fallback
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="pb-card relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl p-5 shadow-[var(--shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="pb-btn-ghost absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full active:scale-95"
        >
          ✕
        </button>

        <h2 className="pb-display text-lg font-semibold text-[var(--ink)]">Buy missing cards</h2>
        <p className="mt-0.5 text-sm text-[var(--dim)]">{title}</p>

        {!ready && loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-[var(--dim)]">building list…</div>
        ) : !ready && error ? (
          <p className="mt-4 text-sm text-[var(--accent)]">Couldn’t build the list — {error}.</p>
        ) : missing > 0 ? (
          <>
            <p className="mt-3 text-sm text-[var(--ink)]">
              <span className="font-semibold text-[var(--accent)]">{missing.toLocaleString()}</span> cards to
              go. Copy this list, open TCGplayer Mass Entry, paste it, then in the cart choose{' '}
              <span className="font-medium">Optimize → fewest sellers</span> to cut shipping.
            </p>
            <textarea
              readOnly
              value={text}
              onFocus={(e) => e.target.select()}
              className="pb-input mt-3 h-48 w-full resize-none rounded-xl p-3 font-mono text-xs"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={copy} className="pb-btn-accent rounded-xl px-4 py-2 text-sm font-medium active:scale-95">
                {copied ? 'Copied ✓' : 'Copy list'}
              </button>
              <a
                href={MASSENTRY_URL}
                target="_blank"
                rel="noreferrer"
                className="pb-btn-ghost rounded-xl px-4 py-2 text-sm font-medium active:scale-95"
              >
                Open TCGplayer Mass Entry ↗
              </a>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-[var(--dim)]">Nothing missing here — you’ve got them all. 🎉</p>
        )}
      </div>
    </div>
  )
}
