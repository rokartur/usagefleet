"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Periodically re-fetches the current route's server components so pages
 *  (devices last-seen, group counts, …) stay live without a manual reload. */
export function AutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();
  const lastRefresh = useRef(0);

  useEffect(() => {
    const doRefresh = () => {
      lastRefresh.current = Date.now();
      router.refresh();
    };
    const id = setInterval(doRefresh, intervalMs);
    const onVisible = () => {
      // Throttle so a focus/visibility burst can't stack refreshes.
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefresh.current >= intervalMs
      ) {
        doRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
