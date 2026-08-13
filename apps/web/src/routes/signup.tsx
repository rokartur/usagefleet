import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AuthForm } from "@/components/AuthForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signupEnabled } from "@/lib/flags";
import { getSession } from "@/lib/session";

const signupPage = createServerFn().handler(async () => {
  if (await getSession()) throw redirect({ to: "/dashboard" });
  // ALLOW_SIGNUP also disables the endpoint in better-auth; this only stops the
  // UI from offering a form that would be rejected.
  return { signupEnabled: signupEnabled() };
});

export const Route = createFileRoute("/signup")({
  loader: () => signupPage(),
  component: SignupPage,
});

function SignupPage() {
  const { signupEnabled } = Route.useLoaderData();

  if (!signupEnabled) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm text-center [--card-spacing:--spacing(6)]">
          <CardHeader>
            <CardTitle className="text-lg">Sign-up disabled</CardTitle>
            <CardDescription>New accounts are turned off on this instance.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link to="/login" />}>Go to sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm [--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="text-lg">Create account</CardTitle>
          <CardDescription>Track usage across groups and devices.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AuthForm mode="signup" />
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
