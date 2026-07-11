import { useEffect, useRef, useState } from 'react'
import { COLLECTION_SORTS, useCollectionSort, setCollectionSort } from '../lib/settings.js'

// The in-context sort control for "Your collection": a small ghost button that
// reads "Sorted by <x> ▾" — so the wall's ordering is visible *and* adjustable
// right where it applies. Closes on outside-click / Escape.
export default function CollectionSortMenu() {
  const [open, setOpen] = useState(false)
  const sort = useCollectionSort()
  const ref = useRef(null)
  const current = COLLECTION_SORTS.find((o) => o.id === sort) ?? COLLECTION_SORTS[0]

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="pb-btn-ghost rounded-full px-2.5 py-1 text-xs font-medium text-[var(--dim)] active:scale-95"
      >
        Sorted by {current.short} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div role="menu" className="pb-card absolute left-0 z-50 mt-2 w-52 rounded-xl p-2 shadow-[var(--shadow)]">
          <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-wide text-[var(--dim)]">
            Sort your collection
          </div>
          {COLLECTION_SORTS.map((o) => {
            const active = o.id === sort
            return (
              <button
                key={o.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setCollectionSort(o.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm active:scale-[0.98] ${
                  active ? 'pb-tint' : 'text-[var(--ink)] hover:bg-[var(--pocket)]'
                }`}
              >
                {o.label}
                {active && <span aria-hidden="true">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
