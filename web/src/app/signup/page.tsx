import Link from "next/link";
import { SignupForm } from "@/components/forms/signup-form";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign up</h1>
        <p className="text-muted text-sm">Brag about touching grass to only your friends.</p>
      </div>
      <SignupForm />
      <p className="text-muted text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-accent underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
