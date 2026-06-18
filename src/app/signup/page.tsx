import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { signupEnabled } from "@/lib/flags";
import { getSession } from "@/lib/session";

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  if (!signupEnabled()) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[#0a0a0a] p-8 text-center">
          <h1 className="text-xl font-semibold">Sign-up disabled</h1>
          <p className="mb-6 mt-1 text-sm text-neutral-400">
            New accounts are turned off on this instance.
          </p>
          <Link
            href="/login"
            className="inline-block rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[#0a0a0a] p-8">
        <h1 className="text-xl font-semibold">Create account</h1>
        <p className="mb-6 mt-1 text-sm text-neutral-400">
          Start tracking your Claude usage.
        </p>
        <AuthForm mode="signup" />
        <p className="mt-6 text-center text-sm text-neutral-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-white underline underline-offset-2 hover:text-neutral-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
