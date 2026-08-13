import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AuthForm } from "@/components/AuthForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signupEnabled } from "@/lib/flags";
import { getSession } from "@/lib/session";

/** Signed-in visitors skip the form; ALLOW_SIGNUP is a server-side flag, so the
 *  "Create one" link has to be resolved on the server too. */
const loginPage = createServerFn().handler(async () => {
  if (await getSession()) throw redirect({ to: "/dashboard" });
  return { signupEnabled: signupEnabled() };
});

export const Route = createFileRoute("/login")({
  loader: () => loginPage(),
  component: LoginPage,
});

function LoginPage() {
  const { signupEnabled } = Route.useLoaderData();
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm [--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>Welcome back to UsageFleet.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AuthForm mode="login" />
          {signupEnabled && (
            <p className="text-center text-sm text-muted-foreground">
              No account?{" "}
              <Link
                to="/signup"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Create one
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
