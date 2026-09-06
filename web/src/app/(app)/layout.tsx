import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getCurrentUser, hasClaimedUsername } from "@/lib/auth/profile";
import { APP_HOME_PATH, LOGIN_PATH } from "@/lib/auth/routes";
import { signOut } from "./actions";
import { AppNav } from "./app-nav";

// Every page under this layout reads the session, so none of them can be
// prerendered. Saying so explicitly also keeps `next build` from evaluating the
// Supabase config in the Docker builder, which only has the public half of it.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Middleware has already redirected an anonymous request away from here. This
  // is the second of the two checks CLAUDE.md asks for: middleware can be
  // bypassed by a matcher mistake, a server component cannot.
  const current = await getCurrentUser();
  if (!current) redirect(LOGIN_PATH);

  const { profile } = current;
  const onboarded = hasClaimedUsername(profile);
  const displayName = profile?.displayName ?? profile?.username ?? null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border bg-background/85 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            href={onboarded ? APP_HOME_PATH : "/"}
            className="mr-auto font-semibold tracking-tight"
          >
            roamr
          </Link>

          {/* Onboarding renders inside this layout, and a nav bar full of links
              a half-created account cannot use is just a row of traps. Keying
              off the username rather than off the pathname means the decision
              comes from data instead of from string matching. */}
          {onboarded ? (
            <nav aria-label="Primary" className="hidden sm:block">
              <AppNav className="gap-1" />
            </nav>
          ) : null}

          <div className="flex items-center gap-2 sm:ml-2">
            <Avatar name={displayName} size="sm" />
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* pb-24 leaves room for the mobile tab bar, which is fixed and would
          otherwise sit on top of the last item on the page. */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24 sm:pb-6">{children}</main>

      {onboarded ? (
        <nav
          aria-label="Primary"
          className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-10 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        >
          <AppNav className="mx-auto max-w-2xl gap-1 px-2 py-1" />
        </nav>
      ) : null}
    </div>
  );
}
