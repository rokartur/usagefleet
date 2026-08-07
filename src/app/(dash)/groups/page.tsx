import { LayersIcon, Trash2 } from "lucide-react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ConfirmAction } from "@/components/ConfirmAction";
import { GroupFormDialog } from "@/components/groups/GroupFormDialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteGroup } from "@/lib/actions";
import { backfillUngroupedDevices, ensureSettings, listGroups } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const user = await requireUser();
  await backfillUngroupedDevices(user.id);
  const groups = await listGroups(user.id);
  const { maxGroups } = await ensureSettings(user.id);
  const atCap = groups.length >= maxGroups;

  return (
    <>
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="tabular-nums">
            {groups.length} / {maxGroups}
          </span>{" "}
          groups · each is measured against a 1/{maxGroups} slice of the account limit
          {atCap && (
            <span className="text-amber-600 dark:text-amber-500">
              {" "}
              · limit reached, delete one or raise it in Settings
            </span>
          )}
        </p>
        <GroupFormDialog atCap={atCap} />
      </div>

      {groups.length === 0 ? (
        <Card className="py-8">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayersIcon />
              </EmptyMedia>
              <EmptyTitle>No groups yet</EmptyTitle>
              <EmptyDescription>
                Create a group (e.g. &quot;Laptops&quot;) and assign devices to it to see its share
                of your limits.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Devices</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: g.color }}
                          aria-hidden
                        />
                        <span className="font-medium">{g.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {g.deviceCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <GroupFormDialog group={{ id: g.id, name: g.name, color: g.color }} />
                        <ConfirmAction
                          action={deleteGroup}
                          id={g.id}
                          title={`Delete ${g.name}?`}
                          description="Its devices move to another group (a fresh Default is created if this was the last one). Reported usage is kept."
                          confirmLabel="Delete"
                        >
                          <Trash2 />
                          Delete
                        </ConfirmAction>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
