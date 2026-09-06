import Link from "next/link";
import { LoginForm } from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="text-muted text-sm">Welcome back to roamr.</p>
      </div>
      <LoginForm />
      <p className="text-muted text-sm">
        No account?{" "}
        <Link href="/signup" className="text-accent underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
