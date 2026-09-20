import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MomentPhoto } from "@/components/moments/moment-photo";
import { Avatar } from "@/components/ui/avatar";
import { buttonStyles } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { getFeedPage } from "@/lib/feed/queries";
import { formatMomentDate } from "@/lib/moments/format";
import styles from "../app.module.css";

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

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Feed</h1>
          <p className="text-muted text-sm">Moments from you and your friends, newest first.</p>
        </div>
        <Link href="/moments/new" className={buttonStyles()}>
          Add a moment
        </Link>
      </header>

      {items.length === 0 && (
        <section className={styles.empty}>
          <h2>Nothing here yet</h2>
          <p>Add your first photo or find a friend to start your feed.</p>
          <Link href="/friends" className={buttonStyles({ variant: "secondary" })}>
            Find friends
          </Link>
        </section>
      )}

      <ul className={styles.feedList}>
        {items.map((item, index) => (
          <li key={item.id} className={styles.feedItem}>
            <div className={styles.feedMeta}>
              <div className={styles.feedAuthor}>
                <Avatar name={item.authorName} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.authorName}</p>
                  <p className="text-muted truncate text-xs">{item.cityName}</p>
                </div>
              </div>
              <span className="text-muted shrink-0 text-xs">{formatMomentDate(item.takenAt)}</span>
            </div>

            <Link href={`/moments/${item.id}`} className={styles.photoLink}>
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
