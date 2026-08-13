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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { createGroup, updateGroup } from "@/lib/actions";

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
            <Field orientation="horizontal">
              <FieldLabel htmlFor="group-color">Color</FieldLabel>
              <input
                id="group-color"
                name="color"
                type="color"
                defaultValue={group?.color ?? "#6366f1"}
                className="h-8 w-14 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
              />
              <FieldDescription>Used for this group everywhere in the charts.</FieldDescription>
            </Field>
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
