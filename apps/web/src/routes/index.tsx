import { createFileRoute, redirect } from "@tanstack/react-router";

// The app has no marketing page; / is just a doorway. The _dash loader bounces
// signed-out visitors on to /login.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
