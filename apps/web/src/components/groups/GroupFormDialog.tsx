import { useRouter } from "@tanstack/react-router";
import { useState, useTransition } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { createGroup, updateGroup } from "@/lib/actions";
import { GROUP_COLORS, randomGroupColor } from "@/lib/group-colors";
import { cn } from "@/lib/utils";

/** Swatch picker over the shared palette. Native radios rather than buttons:
 *  arrow-key navigation and form serialisation come for free, so the only state
 *  is the colour a new group opens on. */
function ColorField({ selected }: { selected?: string }) {
  const [initial] = useState(() => selected ?? randomGroupColor());
  // A group saved with a hex outside the palette keeps its swatch, otherwise
  // editing it would silently show nothing selected.
  const swatches = GROUP_COLORS.some((c) => c.hex === initial)
    ? GROUP_COLORS
    : [{ name: initial, hex: initial }, ...GROUP_COLORS];

  return (
    <FieldSet>
      <FieldLegend variant="label" className="mb-2">
        Color
      </FieldLegend>
      <div className="flex flex-wrap gap-2">
        {swatches.map((c) => (
          <label key={c.hex} className="cursor-pointer">
            <input
              type="radio"
              name="color"
              value={c.hex}
              defaultChecked={c.hex === initial}
              aria-label={c.name}
              className="peer sr-only"
            />
            <span
              style={{ backgroundColor: c.hex }}
              className={cn(
                "block size-6 rounded-full ring-offset-2 ring-offset-background",
                "peer-checked:ring-2 peer-checked:ring-foreground",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
              )}
            />
          </label>
        ))}
      </div>
      <FieldDescription>Used for this group everywhere in the charts.</FieldDescription>
    </FieldSet>
  );
}

/** Create (no `group`) or rename/recolor (with `group`) — one dialog, since the
 *  fields and the server-action shape are identical. */
export function GroupFormDialog({
  group,
  atCap = false,
}: {
  group?: { id: string; name: string; color: string };
  atCap?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editing = group != null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={editing ? <Button variant="ghost" size="sm" /> : <Button disabled={atCap} />}
      >
        {editing ? <PencilIcon /> : <PlusIcon />}
        {editing ? "Edit" : "New group"}
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              try {
                const submit = editing ? updateGroup : createGroup;
                await toast.promise(
                  submit({ data: formData }).then(() => router.invalidate()),
                  {
                    loading: { title: editing ? "Saving group…" : "Creating group…" },
                    success: { title: editing ? "Group updated" : "Group created" },
                    error: {
                      title: editing ? "Couldn't update group" : "Couldn't create group",
                      description: "Please try again.",
                      priority: "high",
                    },
                  },
                );
                setOpen(false);
              } catch {
                // The toast reports the error; keep the dialog open for retry.
              }
            });
          }}
        >
          {editing && <input type="hidden" name="id" value={group.id} />}
          <DialogHeader>
            <DialogTitle>{editing ? "Edit group" : "New group"}</DialogTitle>
            <DialogDescription>
              Groups split your account limits between sets of machines.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="group-name">Name</FieldLabel>
              <Input
                id="group-name"
                name="name"
                required
                maxLength={60}
                defaultValue={group?.name}
                placeholder="e.g. Laptops"
              />
            </Field>
            <ColorField selected={group?.color} />
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save" : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
