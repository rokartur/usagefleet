"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTokens } from "@/lib/format";
import type { DonutDatum } from "./ShareDonut";
import { AXIS, ChartTooltip } from "./chart-theme";

/** Horizontal ranked bar chart — used for per-model comparison. Height scales
 *  with the row count so bars stay readable. */
export function TokenBarChart({ data }: { data: DonutDatum[] }) {
  const rows = data.filter((d) => d.value > 0);
  const height = Math.max(80, rows.length * 34 + 16);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={rows} margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
          <XAxis type="number" {...AXIS} tickFormatter={formatTokens} hide />
          <YAxis
            type="category"
            dataKey="name"
            {...AXIS}
            width={96}
            tick={{ fill: "#a3a3a3", fontSize: 12 }}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {rows.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
