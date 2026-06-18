"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      disabled={pending}
      onClick={async () => {
        if (pending) return;
        setPending(true);
        try {
          await signOut();
        } catch {
          // network failure: still send the user to /login (best-effort)
        } finally {
          router.push("/login");
          router.refresh();
          setPending(false);
        }
      }}
      className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
