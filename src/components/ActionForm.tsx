"use client";

import { useTransition } from "react";
import { toast } from "@/components/ui/toast";

type ActionFormProps = Omit<React.ComponentProps<"form">, "action"> & {
  action: (formData: FormData) => Promise<void>;
  loadingMessage: string;
  successMessage: string;
  errorMessage?: string;
};

/** A server-action form that reports its promise state through the global toast. */
export function ActionForm({
  action,
  loadingMessage,
  successMessage,
  errorMessage = "Action failed. Please try again.",
  ...props
}: ActionFormProps) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      {...props}
      aria-busy={pending}
      action={(formData) =>
        startTransition(async () => {
          try {
            await toast.promise(action(formData), {
              loading: { title: loadingMessage },
              success: { title: successMessage },
              error: { title: errorMessage, priority: "high" },
            });
          } catch {
            // The toast reports the error; leave the form available for retry.
          }
        })
      }
    />
  );
}
