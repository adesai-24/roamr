import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MomentPhoto } from "@/components/moments/moment-photo";
import { buttonStyles } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { formatCollectionSpan, formatMomentCount, formatMomentDate } from "@/lib/moments/format";
import { getPlace } from "@/lib/moments/queries";

export const metadata: Metadata = {
  title: "Place · roamr",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PlacePage({ params }: { params: Promise<{ cityId: string }> }) {
  const { cityId } = await params;

  const current = await getCurrentUser();
  if (!current) redirect(LOGIN_PATH);

  if (!UUID.test(cityId)) notFound();

  const place = await getPlace(current.id, cityId);
  if (!place) notFound();

  const span = formatCollectionSpan(place.collection.firstMomentAt, place.collection.lastMomentAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/places" className="text-muted w-fit text-sm hover:underline">
          ← Places
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{place.city.name}</h1>
        <p className="text-muted text-sm">
          {place.city.display_name} · {formatMomentCount(place.collection.momentCount)}
          {span ? ` · ${span}` : ""}
        </p>
      </div>

      {place.moments.length === 0 ? (
        <div className="border-border rounded-card flex flex-col gap-3 border border-dashed p-6">
          <p className="text-muted text-sm">Nothing here yet. Add a photo and it fills back up.</p>
          <Link href="/moments/new" className={buttonStyles({ size: "md" })}>
            Add a moment
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {place.moments.map((moment, index) => (
            <li key={moment.id}>
              <Link
                href={`/moments/${moment.id}`}
                className="rounded-card focus-visible:outline-accent block overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <MomentPhoto
                  url={moment.photoUrl}
                  alt={moment.caption ?? `A moment from ${place.city.name}`}
                  width={moment.width}
                  height={moment.height}
                  className="aspect-square"
                  // Only the first row is above the fold; the rest can wait.
                  eager={index < 3}
                />
                <span className="text-muted mt-1 block text-xs">
                  {formatMomentDate(moment.takenAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
