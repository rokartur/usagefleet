"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ChartTooltip } from "./chart-theme";

export interface DonutDatum {
  key: string;
  name: string;
  value: number;
  color: string;
}

/** Donut share chart, reused across the group / device / model tabs. Renders an
 *  empty state when nothing has any value. */
export function ShareDonut({
  data,
  centerLabel,
  centerValue,
}: {
  data: DonutDatum[];
  centerLabel?: string;
  centerValue?: string;
}) {
  const slices = data.filter((d) => d.value > 0);
  if (slices.length === 0) {
    return <EmptyState>No activity to chart yet.</EmptyState>;
  }
  return (
    <div className="relative h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="#0a0a0a"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums text-neutral-100">
            {centerValue}
          </span>
          {centerLabel && (
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">
              {centerLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
