import type { Metadata } from "next";
import { safeRedirectPath } from "@/lib/auth/routes";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · roamr",
};

/** Failure codes the callback can hand back. */
const CALLBACK_ERRORS: Record<string, string> = {
  link_expired: "That sign-in link has expired. Here is a fresh start.",
  link_invalid: "That sign-in link is not valid any more. Request a new one.",
  link_missing_code: "That link was missing its sign-in code. Request a new one.",
  exchange_failed: "We could not finish signing you in. Request a new link.",
};

const GENERIC_ERROR = "Something went wrong signing you in. Try again.";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(firstValue(params.next));

  const errorCode = firstValue(params.error);
  const initialError = errorCode ? (CALLBACK_ERRORS[errorCode] ?? GENERIC_ERROR) : undefined;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted text-sm">
          Brag about touching grass to only your friends. Sign in with an email link or your
          password.
        </p>
      </div>

      <LoginForm next={next} initialError={initialError} />
    </main>
  );
}

function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}
