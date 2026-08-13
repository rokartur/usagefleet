import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signupEnabled } from "@/lib/flags";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm [--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>Welcome back to UsageFleet.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AuthForm mode="login" />
          {signupEnabled() && (
            <p className="text-center text-sm text-muted-foreground">
              No account?{" "}
              <Link
                href="/signup"
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
