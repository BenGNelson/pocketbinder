// Shared UI primitives.

// A shimmering placeholder line, sized by the caller via className (used by the
// loading skeletons so the layout holds its shape instead of bouncing).
export function SkeletonLine({ className = '' }) {
  return <span className={`block animate-pulse rounded bg-[var(--line)] ${className}`} />
}
