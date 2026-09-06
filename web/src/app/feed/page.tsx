import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/actions/auth";
import { listFeed } from "@/lib/actions/moments";
import { AppNav } from "@/components/app-nav";
import { Card } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";

export default async function FeedPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const moments = await listFeed();

  return (
    <>
      <AppNav username={profile.username} />
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="text-xl font-semibold tracking-tight">Feed</h1>
        {moments.length === 0 && (
          <p className="text-muted text-sm">
            No moments yet -- yours or a friend&apos;s. Log your first one from the + Moment tab.
          </p>
        )}
        {moments.map((moment) => (
          <Card key={moment.id} className="flex flex-col gap-2" data-testid="moment-card">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">@{moment.author.username}</span>
              <span className="text-muted">
                {formatDistanceToNow(new Date(moment.createdAt), { addSuffix: true })}
              </span>
            </div>
            {moment.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-TTL and not worth Next/Image's remote-pattern config for a demo.
              <img
                src={moment.photoUrl}
                alt={moment.caption ?? `A moment in ${moment.city.name}`}
                className="rounded-card w-full object-cover"
              />
            )}
            <p className="text-muted text-sm">
              {moment.city.name}
              {moment.city.region ? `, ${moment.city.region}` : ""} · {moment.city.country}
              {moment.trip ? ` · ${moment.trip.name}` : ""}
            </p>
            {moment.caption && <p className="text-sm">{moment.caption}</p>}
            {moment.participants.length > 0 && (
              <p className="text-muted text-xs">
                With {moment.participants.map((p) => `@${p.username}`).join(", ")}
              </p>
            )}
          </Card>
        ))}
      </main>
    </>
  );
}
