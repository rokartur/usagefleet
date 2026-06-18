"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createDevice } from "@/lib/actions";

export function AddDeviceForm({
  groups,
}: {
  groups: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await createDevice(name, groupId || null);
      setToken(res.token);
      setName("");
      router.refresh();
    } catch {
      setError("Failed to create device. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-200">Device name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. work-macbook"
            className="rounded-md border border-white/15 bg-[#0a0a0a] text-white placeholder:text-neutral-600 px-3 py-2 outline-none focus:border-white/30"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-200">Group</span>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-md border border-white/15 bg-[#0a0a0a] text-white placeholder:text-neutral-600 px-3 py-2 outline-none focus:border-white/30"
          >
            <option value="">Ungrouped</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Add device"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {token && (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
          <p className="text-sm font-medium text-emerald-300">
            Device token — copy it now, it won&apos;t be shown again:
          </p>
          <code className="mt-2 block break-all rounded-lg bg-black border border-white/10 p-3 font-mono text-sm text-neutral-200">
            {token}
          </code>
          <p className="mt-2 text-xs text-emerald-400">
            Configure the collector with{" "}
            <code className="font-mono">CLAUDE_TRACK_TOKEN={token.slice(0, 12)}…</code>
          </p>
        </div>
      )}
    </div>
  );
}
