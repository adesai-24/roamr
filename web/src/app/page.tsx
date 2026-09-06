import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonStyles } from "@/components/ui/button";
import { APP_HOME_PATH, LOGIN_PATH } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

// Reads the session, so it can never be prerendered. Stating it keeps
// `next build` from touching the Supabase config during the Docker build, which
// only carries the public half of it.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed in: this page has nothing for you. Middleware takes it from here and
  // routes on to onboarding if the username is still missing.
  if (user) redirect(APP_HOME_PATH);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">roamr</h1>
      <p className="text-muted">Brag about touching grass to only your friends.</p>
      <p className="text-muted text-sm">
        Collect the cities you have been to, keep the photos from them, and share the lot with the
        handful of people who actually want to see it.
      </p>
      <Link href={LOGIN_PATH} className={buttonStyles({ size: "lg", fullWidth: true })}>
        Sign in
      </Link>
    </main>
  );
}
