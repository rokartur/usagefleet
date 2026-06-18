import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { signupEnabled } from "@/lib/flags";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[#0a0a0a] p-8">
        <h1 className="text-xl font-semibold text-white">Sign in</h1>
        <p className="mb-6 mt-1 text-sm text-neutral-400">
          Welcome back to Claude Track.
        </p>
        <AuthForm mode="login" />
        {signupEnabled() && (
          <p className="mt-6 text-center text-sm text-neutral-400">
            No account?{" "}
            <Link href="/signup" className="font-medium text-white underline underline-offset-2 hover:text-neutral-300">
              Create one
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
