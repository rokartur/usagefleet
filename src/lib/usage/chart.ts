const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** UTC day key ("YYYY-MM-DD") for an instant. */
export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Dense, ascending bucket keys covering [lo, hi] (both UTC day keys): one per
 * day, or one per month ("YYYY-MM") when `monthly`. Empty buckets are included
 * so the chart's x-axis has no gaps.
 */
export function bucketKeys(lo: string, hi: string, monthly: boolean): string[] {
  const out: string[] = [];
  if (monthly) {
    let y = Number(lo.slice(0, 4));
    let m = Number(lo.slice(5, 7));
    const ey = Number(hi.slice(0, 4));
    const em = Number(hi.slice(5, 7));
    while (y < ey || (y === ey && m <= em)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      if (++m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  }
  for (let t = Date.parse(`${lo}T00:00:00Z`); t <= Date.parse(`${hi}T00:00:00Z`); t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Inclusive day span between two UTC day keys ("2026-06-01".."2026-06-02" = 2). */
export function daySpan(lo: string, hi: string): number {
  return (Date.parse(`${hi}T00:00:00Z`) - Date.parse(`${lo}T00:00:00Z`)) / DAY_MS + 1;
}

/** Short axis label for a bucket key: "Jun 18" (day) or "Jun 26" (month). */
export function bucketLabel(key: string): string {
  const month = MONTHS[Number(key.slice(5, 7)) - 1] ?? "?";
  return key.length === 7 ? `${month} ${key.slice(2, 4)}` : `${month} ${Number(key.slice(8, 10))}`;
}
