import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

// Subscribed via useSyncExternalStore rather than the registry's
// useEffect+setState (which trips react-hooks/set-state-in-effect and renders a
// wrong value on the first client pass).
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false, // SSR: assume desktop, matching the server-rendered sidebar
  );
}
