import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useApi } from '../lib/useApi.js'
import { setHref, completionPct } from '../lib/cards.js'
import { SkeletonLine } from './ui.jsx'

// Master-detail set navigation, one source of truth rendered two ways so cards stay
// the focus of the page:
//   - desktop (lg+): a persistent left <nav> column, always visible (plain landmark,
//     no dialog semantics) — pick a set and the card grid beside it updates.
//   - mobile (<lg): an off-canvas dialog drawer the header hamburger opens.
// Sets you're collecting float to the top; a filter finds any of ~170 by name; the
// active set is highlighted (aria-current) and scrolled into view. Polls the set list
// so completion bars stay fresh after edits.
//
// Props: `open`/`onClose` drive the MOBILE drawer only (desktop is always shown).
export default function SetSidebar({ open, onClose }) {
  const [filter, setFilter] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const desktopActive = useRef(null)
  const mobileActive = useRef(null)
  const panelRef = useRef(null)
  const closeRef = useRef(null)

  const { data, loading } = useApi('/cards/sets', 60000)
  const sets = data?.sets ?? []
  const currentSetId = decodeURIComponent(location.pathname.match(/^\/sets\/(.+)$/)?.[1] ?? '')

  const q = filter.trim().toLowerCase()
  const { collecting, rest } = useMemo(() => {
    const matches = (s) => !q || s.name.toLowerCase().includes(q) || (s.series || '').toLowerCase().includes(q)
    const collecting = sets
      .filter((s) => s.owned > 0 && matches(s))
      .sort(
        (a, b) =>
          completionPct(b.owned, b.card_count) - completionPct(a.owned, a.card_count) || b.owned - a.owned,
      )
    const rest = sets.filter((s) => s.owned === 0 && matches(s))
    return { collecting, rest }
  }, [sets, q])

  // Mobile drawer only: Escape closes, background scroll locks, focus lands on the
  // close button (not the filter — avoids popping the phone keyboard), and the active
  // set scrolls into view. Desktop `open` is always false, so none of this runs there.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    mobileActive.current?.scrollIntoView({ block: 'center' })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose, sets.length])

  // Off-screen mobile drawer: mark it inert so its controls aren't tabbable / seen by
  // a screen reader while closed. (The desktop <nav> is a separate, always-live element.)
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    open ? el.removeAttribute('inert') : el.setAttribute('inert', '')
  }, [open])

  // Keep the active set visible in the desktop column as you navigate between sets.
  useEffect(() => {
    desktopActive.current?.scrollIntoView({ block: 'nearest' })
  }, [currentSetId, sets.length])

  const row = (s, activeRef, onPick) => {
    const active = s.setid === currentSetId
    const pct = completionPct(s.owned, s.card_count)
    return (
      <button
        key={s.setid}
        ref={active ? activeRef : null}
        type="button"
        onClick={() => onPick(s.setid)}
        aria-current={active ? 'page' : undefined}
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

  // The shared innards — filter, primary links, and the grouped set list. `onPick`
  // navigates (and, on mobile, closes); `onNav` closes the drawer after a top link.
  const contents = (activeRef, onPick, onNav) => (
    <>
      <div className="shrink-0 space-y-2 border-b border-[var(--line)] px-3 py-3">
        <div className="space-y-0.5">
          <NavItem to="/" end onNav={onNav}>Your collection</NavItem>
          <NavItem to="/search" onNav={onNav}>Search all cards</NavItem>
          <NavItem to="/shop" onNav={onNav}>Shop for cards</NavItem>
        </div>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter sets…"
          aria-label="Filter sets"
          className="pb-input w-full rounded-xl px-3 py-2 text-sm"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading && !data ? (
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonLine key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : sets.length === 0 ? (
          <p className="px-1 pt-1 text-sm text-[var(--dim)]">No sets yet.</p>
        ) : collecting.length === 0 && rest.length === 0 ? (
          <p className="px-1 pt-1 text-sm text-[var(--dim)]">No sets match.</p>
        ) : (
          <>
            {collecting.length > 0 && (
              <>
                {!q && <Group>Collecting</Group>}
                <div className="space-y-0.5">{collecting.map((s) => row(s, activeRef, onPick))}</div>
              </>
            )}
            {rest.length > 0 && (
              <>
                {!q && <Group>All sets</Group>}
                <div className="space-y-0.5">{rest.map((s) => row(s, activeRef, onPick))}</div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )

  const pickDesktop = (setid) => navigate(setHref(setid))
  const pickMobile = (setid) => {
    navigate(setHref(setid))
    onClose()
  }

  return (
    <>
      {/* Desktop: a persistent, sticky, self-scrolling column. Plain landmark nav. */}
      <nav
        aria-label="Sets"
        className="hidden shrink-0 border-r border-[var(--line)] lg:sticky lg:top-14 lg:flex lg:h-[calc(100dvh-3.5rem)] lg:w-64 lg:flex-col"
      >
        {contents(desktopActive, pickDesktop, undefined)}
      </nav>

      {/* Mobile: an off-canvas dialog drawer. Backdrop + slide-in panel. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sets"
        className={`fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col border-r border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)] transition-transform duration-200 motion-reduce:transition-none lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <h2 className="pb-display text-base font-semibold text-[var(--ink)]">Jump to a set</h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="pb-btn-ghost flex h-8 w-8 items-center justify-center rounded-full active:scale-95"
          >
            ✕
          </button>
        </div>
        {contents(mobileActive, pickMobile, onClose)}
      </aside>
    </>
  )
}

function NavItem({ to, end, onNav, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNav}
      className={({ isActive }) =>
        `block rounded-lg px-2.5 py-1.5 text-sm ${
          isActive
            ? 'pb-tint font-medium text-[var(--accent)]'
            : 'text-[var(--dim)] hover:bg-[var(--pocket)] hover:text-[var(--ink)]'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

function Group({ children }) {
  return (
    <div className="px-1 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wide text-[var(--dim)] first:pt-1">
      {children}
    </div>
  )
}
