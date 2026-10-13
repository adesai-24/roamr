import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getCurrentUser, hasClaimedUsername } from "@/lib/auth/profile";
import { APP_HOME_PATH, LOGIN_PATH } from "@/lib/auth/routes";
import { signOut } from "./actions";
import { AppNav } from "./app-nav";
import styles from "./app.module.css";

// Every page under this layout reads the session, so none of them can be prerendered.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Middleware has already redirected an anonymous request away from here.
  const current = await getCurrentUser();
  if (!current) redirect(LOGIN_PATH);

  const { profile } = current;
  const onboarded = hasClaimedUsername(profile);
  const displayName = profile?.displayName ?? profile?.username ?? null;

  return (
    <div className={styles.shell}>
      <a href="#app-content" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href={onboarded ? APP_HOME_PATH : "/"} className={styles.brand}>
            roamr<span aria-hidden="true">✳</span>
          </Link>

          {/* Onboarding renders inside this layout, and a nav bar full of links
              a half-created account cannot use is just a row of traps. Keying
              off the username rather than off the pathname means the decision
              comes from data instead of from string matching. */}
          {onboarded ? (
            <nav aria-label="Primary" className={styles.desktopNav}>
              <AppNav />
            </nav>
          ) : null}

          <div className={styles.account}>
            {onboarded ? (
              <Link href="/profile" className={styles.accountLink} aria-label="Your profile">
                <Avatar name={displayName} size="sm" />
              </Link>
            ) : (
              <Avatar name={displayName} size="sm" />
            )}
            <span className={styles.accountName}>{displayName}</span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main id="app-content" className={styles.content}>
        {children}
      </main>

      {onboarded ? (
        <nav aria-label="Primary" className={styles.mobileNav}>
          <AppNav />
        </nav>
      ) : null}
    </div>
  );
}
