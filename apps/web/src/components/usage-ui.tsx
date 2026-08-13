import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** A limit bar: neutral up to 70%, amber past it, destructive past 90% — so a
 *  group that is about to eat its budget is visible without reading numbers. */
export function UsageBar({ pct, className }: { pct: number; className?: string }) {
  const value = Math.min(100, Math.max(0, pct));
  return (
    <Progress
      value={value}
      aria-label={`${value}% used`}
      className={cn(
        "[&_[data-slot=progress-track]]:h-1.5",
        pct >= 90 && "[&_[data-slot=progress-indicator]]:bg-destructive",
        pct >= 70 && pct < 90 && "[&_[data-slot=progress-indicator]]:bg-amber-500",
        className,
      )}
    />
  );
}
