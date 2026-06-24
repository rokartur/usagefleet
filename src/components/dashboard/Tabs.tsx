"use client";

export interface TabOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Minimal hand-built pill switcher. Serves both the breakdown tabs (md) and the
 *  in-chart mode toggle (sm). Controlled. */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: TabOption<T>[];
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#0a0a0a] p-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`rounded-md transition-colors ${
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
            } ${
              active
                ? "bg-white/10 text-white"
                : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            }`}
          >
            {o.label}
            {o.count != null && (
              <span className="ml-1.5 text-xs text-neutral-500 tabular-nums">
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
