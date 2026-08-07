import { MonitorSmartphoneIcon } from "lucide-react";
import { AddDeviceForm } from "@/components/AddDeviceForm";
import { AutoRefresh } from "@/components/AutoRefresh";
import {
  DeleteDeviceButton,
  DeviceGroupSelect,
  RevokeDeviceButton,
} from "@/components/devices/DeviceActions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { backfillUngroupedDevices, ensureSettings, listDevices, listGroups } from "@/lib/data";
import { OS_LABEL, formatRelative } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const user = await requireUser();
  // Enforce the "every device is grouped" invariant before listing.
  await backfillUngroupedDevices(user.id);
  const [devices, groups, settings] = await Promise.all([
    listDevices(user.id),
    listGroups(user.id),
    ensureSettings(user.id),
  ]);
  // Revoked devices don't hold a slot — must match createDevice's count.
  const active = devices.filter((d) => !d.revoked).length;
  const atCap = active >= settings.maxDevices;
  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }));
  // One section per group (empty ones included), then anything still ungrouped.
  const sections = [
    ...groups.map((g) => ({
      key: g.id,
      name: g.name,
      color: g.color,
      items: devices.filter((d) => d.groupId === g.id),
    })),
    {
      key: "ungrouped",
      name: "Ungrouped",
      color: "#94a3b8",
      items: devices.filter((d) => !groups.some((g) => g.id === d.groupId)),
    },
  ].filter((s) => s.key !== "ungrouped" || s.items.length > 0);

  return (
    <>
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="tabular-nums">
            {active} / {settings.maxDevices}
          </span>{" "}
          active devices
          {atCap && (
            <span className="text-amber-600 dark:text-amber-500">
              {" "}
              · limit reached, revoke one or raise it in Settings
            </span>
          )}
        </p>
        <AddDeviceForm groups={groupOptions} atCap={atCap} />
      </div>

      {devices.length === 0 ? (
        <Card className="py-8">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MonitorSmartphoneIcon />
              </EmptyMedia>
              <EmptyTitle>No devices yet</EmptyTitle>
              <EmptyDescription>
                Add a device to get a collector token, then run the collector on that machine.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      ) : (
        sections.map((s) => (
          <Card key={s.key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                {s.name}
                {/* Counts active devices only, like the page header — revoked
                    ones stay listed but don't hold a slot. */}
                <Badge variant="secondary" className="font-normal">
                  {s.items.filter((d) => !d.revoked).length} active
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {s.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No devices in this group.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Last seen</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.items.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{d.name}</span>
                            {d.os && (
                              <Badge variant="outline" className="font-normal">
                                {OS_LABEL[d.os] ?? d.os}
                              </Badge>
                            )}
                            {d.revoked && <Badge variant="destructive">revoked</Badge>}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {d.hostname ? `${d.hostname} · ` : ""}
                            token {d.tokenPrefix}…
                            {d.collectorVersion ? ` · v${d.collectorVersion}` : ""}
                          </p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatRelative(d.lastSeenAt)}
                        </TableCell>
                        <TableCell>
                          <DeviceGroupSelect
                            deviceId={d.id}
                            deviceName={d.name}
                            groupId={d.groupId}
                            groups={groupOptions}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {!d.revoked && <RevokeDeviceButton id={d.id} name={d.name} />}
                            <DeleteDeviceButton id={d.id} name={d.name} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </>
  );
}
