import { AutoRefresh } from "@/components/AutoRefresh";
import { createGroup, deleteGroup } from "@/lib/actions";
import { listGroups } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const user = await requireUser();
  const groups = await listGroups(user.id);

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh />
      <h1 className="text-2xl font-semibold">Groups</h1>

      <form
        action={createGroup}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-[#0a0a0a] p-5"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-200">Name</span>
          <input
            name="name"
            required
            placeholder="e.g. Laptops"
            className="rounded-md border border-white/15 bg-[#0a0a0a] text-white placeholder:text-neutral-600 px-3 py-2 outline-none focus:border-white/30"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-200">Color</span>
          <input
            name="color"
            type="color"
            defaultValue="#6366f1"
            className="h-10 w-16 rounded-md border border-white/15"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200"
        >
          Add group
        </button>
      </form>

      <div className="rounded-lg border border-white/10 bg-[#0a0a0a]">
        {groups.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">No groups yet.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between p-4">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: g.color }}
                  />
                  <span className="font-medium">{g.name}</span>
                  <span className="text-sm text-neutral-500">
                    {g.deviceCount} device{g.deviceCount === 1 ? "" : "s"}
                  </span>
                </span>
                <form action={deleteGroup}>
                  <input type="hidden" name="id" value={g.id} />
                  <button className="rounded-md px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Deleting a group leaves its devices ungrouped (their usage moves to
        &quot;Ungrouped&quot;).
      </p>
    </div>
  );
}
