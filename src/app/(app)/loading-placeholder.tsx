/**
 * What the main area shows while an app page loads: a title bar and two content blocks in quiet
 * greys, still when the user has turned off motion. The header and the email-verification banner
 * sit in the layout above it, so they stay put. One placeholder for every app page, not one shaped
 * like each.
 */
export function LoadingPlaceholder() {
  return (
    <div role="status" className="motion-safe:animate-pulse">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-56 max-w-full rounded-lg bg-stone-200" />
      <div className="mt-6 h-40 rounded-xl bg-stone-200" />
      <div className="mt-4 h-24 rounded-xl bg-stone-200" />
    </div>
  );
}
