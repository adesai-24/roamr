import type { Metadata } from "next";
import Link from "next/link";
import { LOGIN_PATH, ONBOARDING_PATH, safeRedirectPath } from "@/lib/auth/routes";
import { LoginForm } from "./login-form";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const signup = firstValue((await searchParams).mode) === "signup";
  return { title: signup ? "Sign up · roamr" : "Log in · roamr" };
}

/** Failure codes the callback can hand back. */
const CALLBACK_ERRORS: Record<string, string> = {
  link_expired: "That sign-in link has expired. Here is a fresh start.",
  link_invalid: "That sign-in link is not valid any more. Request a new one.",
  link_missing_code: "That link was missing its sign-in code. Request a new one.",
  exchange_failed: "We could not finish signing you in. Request a new link.",
  google_sign_in_failed: "We could not start Google sign-in. Try again or use email.",
};

const GENERIC_ERROR = "Something went wrong signing you in. Try again.";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const signup = firstValue(params.mode) === "signup";
  const next = safeRedirectPath(firstValue(params.next));
  const switchPath = signup
    ? LOGIN_PATH
    : `${LOGIN_PATH}?mode=signup&next=${encodeURIComponent(ONBOARDING_PATH)}`;

  const errorCode = firstValue(params.error);
  const initialError = errorCode ? (CALLBACK_ERRORS[errorCode] ?? GENERIC_ERROR) : undefined;

  return (
    <main className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {signup ? "Sign up to roamr" : "Log in to roamr"}
        </h1>
        <p className="text-muted text-lg">
          {signup
            ? "Collect the places you go. Share the moments with your people."
            : "Brag about touching grass to only your friends."}
        </p>
      </div>

      <LoginForm mode={signup ? "signup" : "login"} next={next} initialError={initialError} />

      <p className="text-muted text-base">
        {signup ? "Already on roamr? " : "New to roamr? "}
        <Link href={switchPath} className="text-accent font-medium underline underline-offset-4">
          {signup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </main>
  );
}

function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}
