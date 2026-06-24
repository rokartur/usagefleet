import { AddDeviceForm } from "@/components/AddDeviceForm";
import { AutoRefresh } from "@/components/AutoRefresh";
import { assignDeviceGroup, deleteDevice, revokeDevice } from "@/lib/actions";
import { backfillUngroupedDevices, listDevices, listGroups } from "@/lib/data";
import { OS_LABEL, formatRelative } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const user = await requireUser();
  // Enforce the "every device is grouped" invariant before listing.
  await backfillUngroupedDevices(user.id);
  const [devices, groups] = await Promise.all([
    listDevices(user.id),
    listGroups(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh />
      <h1 className="text-2xl font-semibold">Devices</h1>

      <AddDeviceForm groups={groups.map((g) => ({ id: g.id, name: g.name }))} />

      <div className="rounded-lg border border-white/10 bg-[#0a0a0a]">
        {devices.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">No devices yet.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{d.name}</span>
                    {d.os && (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-neutral-300">
                        {OS_LABEL[d.os] ?? d.os}
                      </span>
                    )}
                    {d.revoked && (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                        revoked
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {d.hostname ? `${d.hostname} · ` : ""}
                    token {d.tokenPrefix}… · last seen {formatRelative(d.lastSeenAt)}
                    {d.collectorVersion ? ` · v${d.collectorVersion}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={assignDeviceGroup}>
                    <input type="hidden" name="deviceId" value={d.id} />
                    <select
                      name="groupId"
                      defaultValue={d.groupId ?? ""}
                      className="rounded-md border border-white/15 bg-[#0a0a0a] text-white placeholder:text-neutral-600 px-2 py-1.5 text-sm focus:border-white/30"
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <button className="ml-2 rounded-md border border-white/15 px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/5">
                      Save
                    </button>
                  </form>
                  {!d.revoked && (
                    <form action={revokeDevice}>
                      <input type="hidden" name="id" value={d.id} />
                      <button className="rounded-md px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-500/10">
                        Revoke
                      </button>
                    </form>
                  )}
                  <form action={deleteDevice}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="rounded-md px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
