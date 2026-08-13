import { useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { toast } from "@/components/ui/toast";

/** Structural shape of a `createServerFn` fetcher that takes a FormData. Kept
 *  structural (not the generated fetcher type) so the forms don't have to name
 *  one specific server function. */
export type FormAction = (opts: { data: FormData }) => Promise<unknown>;

type ActionFormProps = Omit<React.ComponentProps<"form">, "action"> & {
  action: FormAction;
  loadingMessage: string;
  successMessage: string;
  errorMessage?: string;
};

/** A server-function form that reports its promise state through the global
 *  toast and refetches the route's loaders on success (the replacement for
 *  Next's revalidatePath). */
export function ActionForm({
  action,
  loadingMessage,
  successMessage,
  errorMessage = "Action failed. Please try again.",
  ...props
}: ActionFormProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      {...props}
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          try {
            await toast.promise(
              action({ data: formData }).then(() => router.invalidate()),
              {
                loading: { title: loadingMessage },
                success: { title: successMessage },
                error: { title: errorMessage, priority: "high" },
              },
            );
          } catch {
            // The toast reports the error; leave the form available for retry.
          }
        });
      }}
    />
  );
}
