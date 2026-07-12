import { useEffect, useMemo, useRef, useState } from 'react'

// The Shop page's set scope: a multi-select dropdown that narrows the hunt to one
// or more sets (no selection = the whole catalog). Sets you're already collecting
// float to the top; a search box finds any of the ~160 by name. Same ghost-button
// + `.pb-card` panel + outside-click/Escape pattern as CollectionSortMenu.
export default function SetFilter({ sets = [], selected = [], onToggle, onClear }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

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

  // Collecting sets first (own ≥1 card), then the rest — each already newest-first
  // from the API. A name filter searches across all of them.
  const ordered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const match = (s) => !term || s.name.toLowerCase().includes(term)
    const collecting = sets.filter((s) => s.owned > 0 && match(s))
    const rest = sets.filter((s) => s.owned <= 0 && match(s))
    return { collecting, rest }
  }, [sets, q])

  const selectedSet = new Set(selected)
  const label = selected.length === 0 ? 'All sets' : `${selected.length} set${selected.length === 1 ? '' : 's'}`

  const row = (s) => {
    const active = selectedSet.has(s.setid)
    return (
      <button
        key={s.setid}
        type="button"
        role="menuitemcheckbox"
        aria-checked={active}
        onClick={() => onToggle(s.setid)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm active:scale-[0.98] ${
          active ? 'pb-tint' : 'text-[var(--ink)] hover:bg-[var(--pocket)]'
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{s.name}</span>
        {active && <span aria-hidden="true">✓</span>}
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium active:scale-95 ${
          selected.length ? 'pb-btn-accent' : 'pb-btn-ghost'
        }`}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div role="menu" className="pb-card absolute left-0 z-50 mt-2 w-72 rounded-xl p-2 shadow-[var(--shadow)]">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter sets…"
            aria-label="Filter sets"
            autoFocus
            className="pb-input mb-1 w-full rounded-lg px-3 py-1.5 text-sm"
          />
          {selected.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="mb-1 w-full rounded-lg px-2 py-1 text-left text-xs font-medium text-[var(--dim)] hover:text-[var(--ink)]"
            >
              Clear {selected.length} selected
            </button>
          )}
          <div className="max-h-72 overflow-y-auto">
            {ordered.collecting.length > 0 && (
              <>
                <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-wide text-[var(--dim)]">
                  Sets you collect
                </div>
                {ordered.collecting.map(row)}
              </>
            )}
            {ordered.rest.length > 0 && (
              <>
                <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wide text-[var(--dim)]">
                  All sets
                </div>
                {ordered.rest.map(row)}
              </>
            )}
            {ordered.collecting.length === 0 && ordered.rest.length === 0 && (
              <p className="px-2 py-2 text-sm text-[var(--dim)]">No sets match.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
