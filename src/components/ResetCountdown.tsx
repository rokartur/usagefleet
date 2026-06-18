"use client";

import { useEffect, useState } from "react";

function countdown(resetsAt: string | null): string {
  if (!resetsAt) return "";
  const target = new Date(resetsAt).getTime();
  if (Number.isNaN(target)) return "";
  let secs = Math.round((target - Date.now()) / 1000);
  if (secs <= 0) return "resetting…";
  const days = Math.floor(secs / 86400);
  secs -= days * 86400;
  const hours = Math.floor(secs / 3600);
  secs -= hours * 3600;
  const mins = Math.floor(secs / 60);
  secs -= mins * 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  if (!days && !hours) parts.push(`${secs}s`); // tick by seconds when close
  return `resets in ${parts.join(" ")}`;
}

/** Live reset label: ticks every second and shows the absolute reset time in
 *  the viewer's local timezone (e.g. "resets in 3h 4m · at 04:50"). */
function clockLabel(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const d = new Date(resetsAt);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const moreThanADay = d.getTime() - Date.now() > 24 * 60 * 60 * 1000;
  const day = moreThanADay
    ? d.toLocaleDateString([], { weekday: "short" }) + " "
    : "";
  return `${day}${time}`;
}

export function ResetCountdown({ resetsAt }: { resetsAt: string | null }) {
  // Single state bumped each second; both labels recompute from `resetsAt` and
  // the current time, so the weekday prefix stays correct across the 24h boundary.
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const label = countdown(resetsAt);
  if (!label) return null;
  const clock = clockLabel(resetsAt);
  return (
    <span suppressHydrationWarning>
      {label}
      {clock && <span className="text-neutral-500"> · at {clock}</span>}
    </span>
  );
}
