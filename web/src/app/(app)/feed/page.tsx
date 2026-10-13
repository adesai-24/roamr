import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MomentPhoto } from "@/components/moments/moment-photo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { getFeedPage } from "@/lib/feed/queries";
import { formatMomentDate } from "@/lib/moments/format";

export const metadata: Metadata = {
  title: "Feed · roamr",
};

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect(LOGIN_PATH);

  const { after } = await searchParams;
  const { items, nextCursor } = await getFeedPage(after);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>
        <Card>
          <CardHeader>
            <CardTitle>Nothing here yet</CardTitle>
            <CardDescription>
              Moments from you and your friends show up here, newest first.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/moments/new" className={buttonStyles()}>
              Add a moment
            </Link>
            <Link href="/friends" className={buttonStyles({ variant: "secondary" })}>
              Find friends
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>

      <ul className="flex flex-col gap-6">
        {items.map((item, index) => (
          <li key={item.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium">
                {item.authorName}
                <span className="text-muted font-normal"> in {item.cityName}</span>
              </p>
              <span className="text-muted shrink-0 text-xs">{formatMomentDate(item.takenAt)}</span>
            </div>

            <Link href={`/moments/${item.id}`}>
              <MomentPhoto
                url={item.photoUrl}
                alt={item.caption ?? `Moment in ${item.cityName}`}
                width={item.width}
                height={item.height}
                className="rounded-card w-full object-cover"
                eager={index === 0}
              />
            </Link>

            {item.caption && <p className="text-sm">{item.caption}</p>}
          </li>
        ))}
      </ul>

      {nextCursor && (
        <Link
          href={`/feed?after=${encodeURIComponent(nextCursor)}`}
          className={buttonStyles({ variant: "secondary", fullWidth: true })}
        >
          Older moments
        </Link>
      )}
    </div>
  );
}
