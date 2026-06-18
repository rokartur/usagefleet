"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res =
      mode === "signup"
        ? await signUp.email({ email, password, name: name || email })
        : await signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Something went wrong");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === "signup" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-300">Name</span>
          <input
            className="rounded-md border border-white/15 bg-[#0a0a0a] px-3 py-2 text-white outline-none placeholder:text-neutral-600 focus:border-white/30"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-300">Email</span>
        <input
          type="email"
          required
          className="rounded-md border border-white/15 bg-[#0a0a0a] px-3 py-2 text-white outline-none placeholder:text-neutral-600 focus:border-white/30"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-300">Password</span>
        <input
          type="password"
          required
          minLength={8}
          className="rounded-md border border-white/15 bg-[#0a0a0a] px-3 py-2 text-white outline-none placeholder:text-neutral-600 focus:border-white/30"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {loading
          ? "Please wait…"
          : mode === "signup"
            ? "Create account"
            : "Sign in"}
      </button>
    </form>
  );
}
