import { Skeleton } from "@/components/ui/skeleton";

// Instant fallback shown while a force-dynamic data page awaits its server data,
// so route transitions don't block on a slow DB round-trip. Mirrors the
// dashboard shape (status line → KPI pair → table card) so the swap doesn't jump.
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-5 w-64" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
