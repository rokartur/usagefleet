"use client";

import { useEffect } from "react";

// Error boundary for the dashboard/devices/groups subtree. Catches a thrown
// render (e.g. a transient DB failure) and offers a retry instead of dropping
// the user onto Next's unstyled production error screen. Wraps this segment's
// page.tsx but NOT (dash)/layout.tsx — failures there are caught by
// app/global-error.tsx.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md rounded-xl border border-white/10 bg-[#0a0a0a] p-6 text-center">
        <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
        <p className="mt-2 text-sm text-neutral-400">
          We couldn&apos;t load this page. This is usually temporary.
        </p>
        <button
          onClick={() => unstable_retry()}
          className="mt-4 rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
