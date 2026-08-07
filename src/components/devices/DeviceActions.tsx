"use client";

import { Ban, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { assignDeviceGroup, deleteDevice, revokeDevice } from "@/lib/actions";

/** Moves a device between groups on change — no separate Save button. */
export function DeviceGroupSelect({
  deviceId,
  deviceName,
  groupId,
  groups,
}: {
  deviceId: string;
  deviceName: string;
  groupId: string | null;
  groups: { id: string; name: string }[];
}) {
  return (
    <ActionForm
      action={assignDeviceGroup}
      loadingMessage={`Moving ${deviceName}…`}
      successMessage={`${deviceName} moved`}
      errorMessage={`Couldn't move ${deviceName}. Please try again.`}
    >
      <input type="hidden" name="deviceId" value={deviceId} />
      <NativeSelect
        key={groupId ?? ""}
        name="groupId"
        size="sm"
        defaultValue={groupId ?? ""}
        aria-label={`Group for ${deviceName}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {groups.map((g) => (
          <NativeSelectOption key={g.id} value={g.id}>
            {g.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </ActionForm>
  );
}

export function RevokeDeviceButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmAction
      action={revokeDevice}
      id={id}
      title={`Revoke ${name}?`}
      description="Its token stops working immediately and the collector on that machine can no longer report usage. Past usage is kept."
      confirmLabel="Revoke"
      successMessage={`${name} revoked`}
    >
      <Ban />
      Revoke
    </ConfirmAction>
  );
}

export function DeleteDeviceButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmAction
      action={deleteDevice}
      id={id}
      title={`Delete ${name}?`}
      description="This removes the device and the usage history it reported. This cannot be undone."
      confirmLabel="Delete"
      successMessage={`${name} deleted`}
    >
      <Trash2 />
      Delete
    </ConfirmAction>
  );
}
