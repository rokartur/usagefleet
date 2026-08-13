import { useRouter } from "@tanstack/react-router";
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
import { toast } from "@/components/ui/toast";
import type { FormAction } from "@/components/ActionForm";

/** Confirm-then-run wrapper for the irreversible actions (revoke/delete). The
 *  action is invoked in a transition rather than by submitting a form inside
 *  the dialog, so the dialog stays mounted until the round-trip finishes. */
export function ConfirmAction({
  action,
  id,
  title,
  description,
  confirmLabel,
  successMessage,
  children,
}: {
  /** Server function taking a FormData with a single `id` field. */
  action: FormAction;
  id: string;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  /** Trigger button content. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
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
                try {
                  await toast.promise(
                    action({ data: fd }).then(() => router.invalidate()),
                    {
                      loading: { title: "Working…" },
                      success: { title: successMessage },
                      error: {
                        title: "Action failed",
                        description: "Please try again.",
                        priority: "high",
                      },
                    },
                  );
                  setOpen(false);
                } catch {
                  // The toast reports the error; keep the dialog open for retry.
                }
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
