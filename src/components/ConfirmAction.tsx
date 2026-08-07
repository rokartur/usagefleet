"use client";

import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Confirm-then-run wrapper for the irreversible actions (revoke/delete). The
 *  action is invoked in a transition rather than by submitting a form inside
 *  the dialog, so the dialog stays mounted until the round-trip finishes. */
export function ConfirmAction({
  action,
  id,
  title,
  description,
  confirmLabel,
  children,
}: {
  /** Server action taking a FormData with a single `id` field. */
  action: (formData: FormData) => Promise<void>;
  id: string;
  title: string;
  description: string;
  confirmLabel: string;
  /** Trigger button content. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const fd = new FormData();
                fd.set("id", id);
                await action(fd);
                setOpen(false);
              })
            }
          >
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
