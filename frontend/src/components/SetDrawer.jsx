import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useApi } from '../lib/useApi.js'
import { setHref, completionPct } from '../lib/cards.js'
import { SkeletonLine } from './ui.jsx'

// A left slide-out drawer for jumping between sets from anywhere — so you don't
// have to bounce back to the hub and scroll to the sets grid to pick the next one.
// The sets you're collecting float to the top; a filter finds any of the ~170 by
// name; picking one navigates and closes (the header button reopens in a tap).
// Self-contained: renders its own trigger button (the fixed overlay escapes the
// header's layout), fetches the set list lazily the first time it's opened.
export default function SetDrawer() {
  const [open, setOpen] = useState(false)
  const [everOpened, setEverOpened] = useState(false)
  const [filter, setFilter] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const activeRef = useRef(null)
  const panelRef = useRef(null)

  // Only fetch once the drawer has actually been opened — no request on set/search
  // pages the user never opens it from.
  const { data, loading } = useApi(everOpened ? '/cards/sets' : null, 0)
  const sets = data?.sets ?? []

  const currentSetId = decodeURIComponent(location.pathname.match(/^\/sets\/(.+)$/)?.[1] ?? '')

  const openDrawer = () => {
    setEverOpened(true)
    setOpen(true)
  }
  const go = (setid) => {
    navigate(setHref(setid))
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden' // lock background scroll while open
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  // Bring the set you're on into view when the drawer opens (also once the list
  // arrives, if it loaded after opening) — you land looking at where you are.
  useEffect(() => {
    if (open && activeRef.current) activeRef.current.scrollIntoView({ block: 'center' })
  }, [open, sets.length])

  // The panel stays mounted (for the slide) but sits off-screen when closed —
  // mark it `inert` so its controls aren't tabbable / read by a screen reader.
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    if (open) el.removeAttribute('inert')
    else el.setAttribute('inert', '')
  }, [open])

  const q = filter.trim().toLowerCase()
  const matches = (s) => !q || s.name.toLowerCase().includes(q) || (s.series || '').toLowerCase().includes(q)
  const { collecting, rest } = useMemo(() => {
    const collecting = sets
      .filter((s) => s.owned > 0 && matches(s))
      .sort(
        (a, b) =>
          completionPct(b.owned, b.card_count) - completionPct(a.owned, a.card_count) || b.owned - a.owned,
      )
    const rest = sets.filter((s) => s.owned === 0 && matches(s))
    return { collecting, rest }
  }, [sets, q])

  const row = (s) => {
    const active = s.setid === currentSetId
    const pct = completionPct(s.owned, s.card_count)
    return (
      <button
        key={s.setid}
        ref={active ? activeRef : null}
        type="button"
        onClick={() => go(s.setid)}
        aria-current={active ? 'true' : undefined}
        className={`block w-full rounded-lg px-2.5 py-2 text-left active:scale-[0.99] ${
          active ? 'pb-tint' : 'hover:bg-[var(--pocket)]'
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className={`min-w-0 truncate text-sm ${active ? 'font-semibold text-[var(--accent)]' : 'text-[var(--ink)]'}`}>
            {s.name}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-[var(--dim)]">
            {s.owned}/{s.card_count}
          </span>
        </div>
        <span className="pb-bar mt-1.5 block h-1 rounded">
          <span style={{ width: `${pct}%` }} />
        </span>
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Browse sets"
        className="pb-btn-ghost flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-medium active:scale-95"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">Sets</span>
      </button>

      {/* Portal to <body>: the sticky header has backdrop-blur, which would make a
          position:fixed child position/clip to the header instead of the viewport. */}
      {createPortal(
        <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sets"
        className={`fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col border-r border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)] transition-transform duration-200 motion-reduce:transition-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <h2 className="pb-display text-base font-semibold text-[var(--ink)]">
            Jump to a set
            {sets.length > 0 && <span className="ml-1.5 text-xs font-normal text-[var(--dim)]">{sets.length}</span>}
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="pb-btn-ghost flex h-8 w-8 items-center justify-center rounded-full active:scale-95"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2 px-3 pb-2 pt-3">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter sets…"
            aria-label="Filter sets"
            className="pb-input w-full rounded-xl px-3 py-2 text-sm"
          />
          <Link
            to="/search"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2.5 py-1.5 text-sm text-[var(--dim)] hover:bg-[var(--pocket)] hover:text-[var(--ink)]"
          >
            Search all cards →
          </Link>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {loading && !data ? (
            <div className="space-y-2 pt-1" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonLine key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          ) : sets.length === 0 ? (
            <p className="px-1 pt-2 text-sm text-[var(--dim)]">No sets yet.</p>
          ) : (
            <>
              {collecting.length > 0 && (
                <>
                  {!q && <Group>Collecting</Group>}
                  <div className="space-y-0.5">{collecting.map(row)}</div>
                </>
              )}
              {rest.length > 0 && (
                <>
                  {!q && <Group>All sets</Group>}
                  <div className="space-y-0.5">{rest.map(row)}</div>
                </>
              )}
              {collecting.length === 0 && rest.length === 0 && (
                <p className="px-1 pt-2 text-sm text-[var(--dim)]">No sets match.</p>
              )}
            </>
          )}
        </div>
      </aside>
        </>,
        document.body,
      )}
    </>
  )
}

function Group({ children }) {
  return (
    <div className="px-1 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wide text-[var(--dim)] first:pt-1">
      {children}
    </div>
  )
}
