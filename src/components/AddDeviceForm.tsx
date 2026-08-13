"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { createDevice } from "@/lib/actions";

/** The one-time token step: the plaintext token is never retrievable again, so
 *  it stays on screen (with a copy button) until the user dismisses it. */
function TokenReveal({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-muted p-3 font-mono text-xs">
          {token}
        </code>
        <Button
          variant="outline"
          size="icon"
          aria-label="Copy token"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(token);
              setCopied(true);
              toast.add({ title: "Token copied to clipboard", type: "success" });
            } catch {
              toast.add({
                title: "Couldn't copy token",
                description: "Select the token and copy it manually.",
                type: "error",
                priority: "high",
              });
            }
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
      <FieldDescription>
        Configure the collector with{" "}
        <code className="font-mono">USAGEFLEET_TOKEN=&lt;token&gt;</code>
      </FieldDescription>
    </div>
  );
}

export function AddDeviceForm({
  groups,
  atCap,
}: {
  groups: { id: string; name: string }[];
  atCap: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  // Default to the first group so a new device is never left ungrouped.
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await toast.promise(createDevice(name, groupId || null), {
        loading: { title: "Creating device…" },
        success: { title: "Device created" },
        error: {
          title: "Failed to create device",
          description: "Please try again.",
          priority: "high",
        },
      });
      setToken(res.token);
      setName("");
      // createDevice already calls revalidatePath("/devices"), which refreshes
      // the server-rendered device list; no manual router.refresh() needed.
    } catch {
      setError("Failed to create device. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setToken(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button disabled={atCap} />}>
        <PlusIcon />
        Add device
      </DialogTrigger>
      <DialogContent>
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>Device token</DialogTitle>
              <DialogDescription>Copy it now — it won&apos;t be shown again.</DialogDescription>
            </DialogHeader>
            <TokenReveal token={token} />
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Add device</DialogTitle>
              <DialogDescription>
                Creates an API token for one machine running the collector.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="device-name">Device name</FieldLabel>
                <Input
                  id="device-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. work-macbook"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="device-group">Group</FieldLabel>
                <NativeSelect
                  id="device-group"
                  className="w-full"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  {groups.length === 0 && (
                    <NativeSelectOption value="">
                      Default (created automatically)
                    </NativeSelectOption>
                  )}
                  {groups.map((g) => (
                    <NativeSelectOption key={g.id} value={g.id}>
                      {g.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>
                  The group whose limit share this device counts against.
                </FieldDescription>
              </Field>
              {error && <FieldDescription className="text-destructive">{error}</FieldDescription>}
            </FieldGroup>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create device"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
