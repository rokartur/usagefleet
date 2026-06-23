// Instant fallback shown while a force-dynamic data page awaits its server data,
// so route transitions don't block on a slow DB round-trip.
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-8" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-md bg-white/10" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-32 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-32 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-white/[0.06]" />
    </div>
  );
}
