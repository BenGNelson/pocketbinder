import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi, API_BASE } from '../../lib/useApi.js'
import { SkeletonLine } from '../../components/ui.jsx'
import { setHref, cardsSearchHref, completionPct, formatUsd } from '../../lib/cards.js'
import { useCollectionSort } from '../../lib/settings.js'
import CollectionSortMenu from '../../components/CollectionSortMenu.jsx'
import CardImage from './CardImage.jsx'
import CardModal from './CardModal.jsx'

// The Cards hub: your Pokémon TCG collection as a binder. A cover-style value
// hero, a show-off wall of the cards you own, and a grid of every set with a
// foil completion bar. Tap cards to seat them, or seed from a CSV/JSON import.
export default function Cards() {
  // Bumped after an ownership edit (or import) to re-fetch stats/sets/showcase so
  // the hub reflects it immediately (the `_r` param is ignored by the backend).
  const [reloadKey, setReloadKey] = useState(0)
  const refresh = () => setReloadKey((k) => k + 1)
  const sort = useCollectionSort()
  const { data: sync } = useApi('/cards/sync-status', 10000)
  const { data: stats } = useApi(`/cards/stats?_r=${reloadKey}`, 60000)
  const { data: setsData, loading, error } = useApi(`/cards/sets?_r=${reloadKey}`, 60000)
  const { data: showcase } = useApi(`/cards/search?owned=1&limit=24&sort=${sort}&_r=${reloadKey}`, 60000)
  const [modalId, setModalId] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const navigate = useNavigate()

  if (sync && !sync.configured) return <NotConfigured />

  const sets = setsData?.sets ?? []
  const owned = showcase?.items ?? []
  const catalogEmpty = sync && sync.indexed === 0 && sync.enabled

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="pb-display text-lg font-semibold text-[var(--ink)]">Your binder</h2>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/shop"
            className="pb-btn-ghost rounded-xl px-3 py-2 text-sm font-medium active:scale-95"
          >
            Shop for cards
          </Link>
          <ImportButton
            onResult={(r) => {
              setImportResult(r)
              refresh()
            }}
          />
        </div>
      </div>

      {importResult && <ImportBanner result={importResult} onDismiss={() => setImportResult(null)} />}

      {catalogEmpty ? (
        <BuildingCatalog sync={sync} />
      ) : (
        <>
          <Hero stats={stats} />

          <form
            onSubmit={(e) => {
              e.preventDefault()
              navigate(cardsSearchHref(new FormData(e.target).get('q')?.trim() || ''))
            }}
          >
            <input
              name="q"
              type="search"
              placeholder="Search every card by name…"
              aria-label="Search cards"
              className="pb-input w-full rounded-xl px-4 py-3"
            />
          </form>

          <ShowcaseWall cards={owned} stats={stats} sort={sort} onOpen={setModalId} />
          <SetsGrid sets={sets} loading={loading && !setsData} error={error} />
          <ImportHelp />
        </>
      )}

      {modalId && <CardModal cardId={modalId} onClose={() => setModalId(null)} onMutated={refresh} />}
    </div>
  )
}

// The cover, as one compact strip: your value (or card count) as a foil lead,
// then the stats inline so nothing wastes the width.
function Hero({ stats }) {
  const s = stats ?? {}
  const value = formatUsd(s.total_value_usd)
  return (
    <section className="pb-cover flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl px-6 py-5">
      <div className="flex items-baseline gap-2.5">
        <span className="pb-display text-4xl font-bold leading-none text-white sm:text-5xl">
          {value ?? fmt(s.owned_unique)}
        </span>
        <span className="text-[11px] uppercase tracking-[0.16em] text-white/70">
          {value ? 'Binder value' : 'cards owned'}
        </span>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-8 gap-y-3">
        {value && <Stat label="owned" value={fmt(s.owned_unique)} />}
        {s.owned_total_qty !== s.owned_unique && <Stat label="copies" value={fmt(s.owned_total_qty)} />}
        {s.sets_completed > 0 && (
          <Stat label={`set${s.sets_completed === 1 ? '' : 's'} complete`} value={fmt(s.sets_completed)} />
        )}
        <Stat label="of catalog" value={s.completion_pct != null ? `${s.completion_pct}%` : '—'} />
      </div>
    </section>
  )
}

function Stat({ label, value }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="pb-display text-2xl font-bold tabular-nums text-[var(--ink)]">{value}</span>
      <span className="text-sm text-[var(--dim)]">{label}</span>
    </span>
  )
}

// The show-off wall: the cards you own, big. Empty until you start collecting.
function ShowcaseWall({ cards, stats, sort, onOpen }) {
  if (!cards.length) {
    return (
      <section className="space-y-2">
        <ShelfHeading>Your collection</ShelfHeading>
        <div className="pb-card rounded-2xl p-6 text-sm text-[var(--dim)]">
          Nothing here yet. Open a set and tap the cards you own — they’ll light up and show off here.
          Got a big collection already? Use <span className="text-[var(--ink)]">Import</span> above.
        </div>
      </section>
    )
  }
  const total = stats?.owned_unique ?? cards.length
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ShelfHeading>Your collection</ShelfHeading>
        <CollectionSortMenu />
        <Link
          to={cardsSearchHref('', { owned: true, sort })}
          className="ml-auto text-xs text-[var(--dim)] hover:text-[var(--ink)]"
        >
          {total > cards.length ? `See all ${fmt(total)} ›` : 'Search yours ›'}
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {cards.map((c) => (
          <button key={c.id} onClick={() => onOpen(c.id)} className="block text-left active:scale-[0.97]">
            <div className="pb-pocket rounded-[11px] p-1">
              <CardImage card={c} owned />
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

// Sets, reorganized so the ones you actually collect sit up top: a "collecting"
// grid first, then everything else behind a "Browse all" disclosure. A name
// filter searches across every set (and takes over the view while it has text).
function SetsGrid({ sets, loading, error }) {
  const [filter, setFilter] = useState('')

  if (loading) {
    return (
      <section className="space-y-2">
        <ShelfHeading>Sets</ShelfHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pb-card rounded-2xl p-4">
              <SkeletonLine className="h-4 w-28" />
              <SkeletonLine className="mt-3 h-2 w-full" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  const q = filter.trim().toLowerCase()
  const matches = (s) =>
    s.name.toLowerCase().includes(q) || (s.series || '').toLowerCase().includes(q)
  const collecting = sets
    .filter((s) => s.owned > 0)
    .sort(
      (a, b) =>
        completionPct(b.owned, b.card_count) - completionPct(a.owned, a.card_count) ||
        b.owned - a.owned,
    )
  const rest = sets.filter((s) => s.owned === 0)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ShelfHeading>Sets</ShelfHeading>
        {error && <p className="text-sm text-[var(--accent)]">unavailable — {error}</p>}
        {sets.length > 0 && (
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter sets…"
            aria-label="Filter sets by name"
            className="pb-input ml-auto w-full rounded-xl px-3 py-2 text-sm sm:w-56"
          />
        )}
      </div>

      {q ? (
        <SetTiles sets={sets.filter(matches)} empty="No sets match." />
      ) : collecting.length > 0 ? (
        <>
          <div className="space-y-2">
            <SubHeading>Sets you’re collecting</SubHeading>
            <SetTiles sets={collecting} />
          </div>
          {rest.length > 0 && (
            <details>
              <summary className="cursor-pointer select-none text-sm text-[var(--dim)] hover:text-[var(--ink)]">
                Browse all {fmt(rest.length)} other set{rest.length === 1 ? '' : 's'}
              </summary>
              <div className="mt-3">
                <SetTiles sets={rest} />
              </div>
            </details>
          )}
        </>
      ) : (
        <SetTiles sets={sets} />
      )}
    </section>
  )
}

function SetTiles({ sets, empty }) {
  if (!sets.length) return empty ? <p className="text-sm text-[var(--dim)]">{empty}</p> : null
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sets.map((s) => (
        <SetCard key={s.setid} s={s} />
      ))}
    </div>
  )
}

function SubHeading({ children }) {
  return <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--dim)]">{children}</h4>
}

function SetCard({ s }) {
  const pct = completionPct(s.owned, s.card_count)
  const year = s.release_date ? s.release_date.slice(0, 4) : null
  const complete = s.card_count > 0 && pct >= 100
  // The series is often just the set's own family name ("Base" / "Base") — only
  // show it when it adds something.
  const series = s.series && s.series.toLowerCase() !== s.name.toLowerCase() ? s.series : ''
  return (
    <Link to={setHref(s.setid)} className="pb-card block rounded-2xl p-4 transition-colors hover:border-[var(--accent-line)]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="min-w-0 truncate font-medium text-[var(--ink)]">{s.name}</span>
          {complete && (
            <span
              className="pb-foil shrink-0 rounded-full px-1.5 text-[10px] font-semibold leading-tight"
              title="Set complete"
            >
              ✓
            </span>
          )}
        </span>
        {year && <span className="shrink-0 text-xs text-[var(--dim)]">{year}</span>}
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-[var(--dim)]">
        <span className="truncate">{series || ' '}</span>
        <span className="shrink-0 tabular-nums">
          {fmt(s.owned)} / {fmt(s.card_count)}
        </span>
      </div>
      <span className="pb-bar mt-2 block h-1.5 rounded">
        <span style={{ width: `${pct}%` }} />
      </span>
    </Link>
  )
}

// Upload a CSV/JSON collection file. Seeds/refreshes owned cards.
function ImportButton({ onResult }) {
  const [busy, setBusy] = useState(false)
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`${API_BASE}/cards/ownership/import`, { method: 'POST', body })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onResult(await res.json())
    } catch (err) {
      onResult({ error: err.message })
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }
  return (
    <label className="pb-btn-accent cursor-pointer rounded-xl px-3 py-2 text-sm font-medium active:scale-95">
      {busy ? 'Importing…' : 'Import'}
      <input type="file" accept=".csv,.json,text/csv,application/json" onChange={onFile} className="hidden" />
    </label>
  )
}

function ImportBanner({ result, onDismiss }) {
  const ok = !result.error
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-sm ${
        ok ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-[var(--accent-line)] bg-[var(--accent-tint)]'
      }`}
    >
      <div className="min-w-0 text-[var(--ink)]">
        {ok ? (
          <>
            Imported <span className="font-semibold">{fmt(result.imported)}</span> cards
            {result.skipped > 0 && ` · ${fmt(result.skipped)} kept from your edits`}
            {result.unmatched?.length > 0 && ` · ${fmt(result.unmatched.length)} unmatched`}.
            {result.unmatched?.length > 0 && (
              <p className="mt-1 truncate text-xs text-[var(--dim)]">
                No catalog match: {result.unmatched.slice(0, 8).join(', ')}
                {result.unmatched.length > 8 ? '…' : ''}
              </p>
            )}
          </>
        ) : (
          <span className="text-[var(--accent)]">Import failed — {result.error}</span>
        )}
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-[var(--dim)] hover:text-[var(--ink)]">
        ✕
      </button>
    </div>
  )
}

// A collapsed disclosure explaining the import format, with a downloadable sample
// generated in-browser (no server round-trip). Set code OR dataset id.
function ImportHelp() {
  const sample = ['setid,number,qty', 'BS,4,1', 'base1,58,2', 'swsh1,1,1'].join('\n') + '\n'
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(sample)}`
  return (
    <details className="pb-card rounded-xl p-3 text-sm text-[var(--dim)]">
      <summary className="cursor-pointer select-none text-[var(--ink)]">
        Import a whole collection from a file
      </summary>
      <div className="mt-2 space-y-2">
        <p>
          One row per card — a CSV with a header row, or a JSON list. Required columns{' '}
          <Code>setid,number</Code>; optional <Code>variant,qty,condition,wishlist,notes</Code>.
        </p>
        <p>
          <Code>setid</Code> can be the set code you know (<Code>BS</Code>) or the dataset id (
          <Code>base1</Code>); <Code>number</Code> is the card’s collector number. Re-importing refreshes
          these rows but keeps anything you’ve edited in the app.
        </p>
        <a
          href={href}
          download="pocketbinder-sample.csv"
          className="pb-btn-ghost inline-block rounded-lg px-3 py-1.5 font-medium active:scale-95"
        >
          Download sample.csv
        </a>
      </div>
    </details>
  )
}

function Code({ children }) {
  return <code className="rounded bg-[var(--pocket)] px-1 text-[var(--ink)]">{children}</code>
}

function BuildingCatalog({ sync }) {
  return (
    <div className="pb-card rounded-2xl p-6">
      <p className="text-[var(--ink)]">Building the card catalog…</p>
      <p className="mt-2 text-sm text-[var(--dim)]">
        Indexing every Pokémon set — this runs once and takes a moment
        {sync?.total ? ` (${fmt(sync.processed)} / ${fmt(sync.total)} cards)` : ''}. It’ll fill in
        automatically.
      </p>
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="space-y-5">
      <h2 className="pb-display text-lg font-semibold text-[var(--ink)]">Your binder</h2>
      <div className="pb-card rounded-xl p-6">
        <p className="text-[var(--accent)]">Card catalog not set up yet.</p>
        <p className="mt-2 text-sm text-[var(--dim)]">
          Clone the public <Code>pokemon-tcg-data</Code> dataset to a folder and point{' '}
          <Code>CARD_DATA_SRC</Code> at it in <Code>.env</Code>. The catalog then indexes automatically;
          card images are fetched on demand. See the README.
        </p>
      </div>
    </div>
  )
}

function ShelfHeading({ children }) {
  return <h3 className="pb-display text-base font-semibold text-[var(--ink)]">{children}</h3>
}

function fmt(n) {
  return (n ?? 0).toLocaleString()
}
