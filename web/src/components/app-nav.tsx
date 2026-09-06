import Link from "next/link";
import { logOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export function AppNav({ username }: { username: string }) {
  return (
    <header className="border-border bg-surface sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3">
      <nav className="flex items-center gap-4 text-sm font-medium">
        <Link href="/feed">Feed</Link>
        <Link href="/cities">My Cities</Link>
        <Link href="/friends">Friends</Link>
        <Link href="/moments/new" className="text-accent">
          + Moment
        </Link>
      </nav>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">@{username}</span>
        <form action={logOut}>
          <Button variant="secondary" type="submit" className="px-2 py-1 text-xs">
            Log out
          </Button>
        </form>
      </div>
    </header>
  );
}
