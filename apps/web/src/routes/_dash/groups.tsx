import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { LayersIcon, Trash2 } from "lucide-react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ConfirmAction } from "@/components/ConfirmAction";
import { GroupFormDialog } from "@/components/groups/GroupFormDialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { deleteGroup } from "@/lib/actions";
import { accountPlan } from "@/lib/billing";
import { backfillUngroupedDevices, listDevices, listGroups } from "@/lib/data";
import { requireUser } from "@/lib/session";

const groupsData = createServerFn().handler(async () => {
  const user = await requireUser();
  await backfillUngroupedDevices(user.id);
  // One group per device slot the plan pays for.
  const [groups, devices, { deviceLimit }] = await Promise.all([
    listGroups(user.id),
    listDevices(user.id),
    accountPlan(user.id),
  ]);
  return {
    groups: groups.map((g) => ({
      ...g,
      // Naming the members is what makes a group row readable; the count alone
      // never tells you which machine landed where.
      deviceNames: devices.filter((d) => d.groupId === g.id).map((d) => d.name),
    })),
    groupLimit: deviceLimit,
  };
});

export const Route = createFileRoute("/_dash/groups")({
  loader: () => groupsData(),
  component: GroupsPage,
});

function GroupsPage() {
  const { groups, groupLimit } = Route.useLoaderData();
  const atCap = groups.length >= groupLimit;

  return (
    <>
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="tabular-nums">
            {groups.length} / {groupLimit}
          </span>{" "}
          groups · each is measured against a 1/{Math.max(1, groups.length)} slice of the account
          limit
          {atCap && (
            <span className="text-amber-600 dark:text-amber-500">
              {" "}
              · plan limit reached, delete one or upgrade in Billing
            </span>
          )}
        </p>
        {/* When there are none, the empty state below carries the button. */}
        {groups.length > 0 && <GroupFormDialog atCap={atCap} />}
      </div>

      {groups.length === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayersIcon />
            </EmptyMedia>
            <EmptyTitle>No groups yet</EmptyTitle>
            <EmptyDescription>
              A group is a set of devices sharing one slice of your limits, e.g.
              &quot;Laptops&quot;. Create one, then pick it on a device.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <GroupFormDialog atCap={atCap} />
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="[&>li:last-child]:border-b">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-4 border-t py-3.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: g.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{g.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {g.deviceNames.length > 0
                    ? g.deviceNames.join(", ")
                    : "Empty, so its slice of the limit goes unused."}
                </p>
              </div>
              <span className="text-sm tabular-nums text-muted-foreground">
                {g.deviceNames.length} {g.deviceNames.length === 1 ? "device" : "devices"}
              </span>
              <div className="flex gap-1">
                <GroupFormDialog group={{ id: g.id, name: g.name, color: g.color }} />
                <ConfirmAction
                  action={deleteGroup}
                  id={g.id}
                  title={`Delete ${g.name}?`}
                  description="Its devices move to another group (a fresh Default is created if this was the last one). Reported usage is kept."
                  confirmLabel="Delete"
                  successMessage={`${g.name} deleted`}
                >
                  <Trash2 />
                  Delete
                </ConfirmAction>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
