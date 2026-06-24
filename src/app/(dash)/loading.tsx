// Instant fallback shown while a force-dynamic data page awaits its server data,
// so route transitions don't block on a slow DB round-trip. Mirrors the
// dashboard layout (KPI row → timeline → donut+table) so the swap doesn't jump.
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-8" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-md bg-white/10" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-white/[0.06]" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-white/[0.06]" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_1fr]">
        <div className="h-56 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-64 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>
    </div>
  );
}
