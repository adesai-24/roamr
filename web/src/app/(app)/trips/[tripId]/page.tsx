import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MomentPhoto } from "@/components/moments/moment-photo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { formatMomentDate } from "@/lib/moments/format";
import { formatTripDates } from "@/lib/trips/format";
import { getTrip, listAssignableMoments } from "@/lib/trips/queries";
import { AssignMomentsList, DeleteTripButton } from "../trip-forms";

export const metadata: Metadata = {
  title: "Trip · roamr",
};

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);

  const detail = await getTrip(tripId);
  // getTrip returns null for both "no such trip" and "not visible to you". The assignable list
  // signs up to 60 photos, so it waits until the trip is known to exist.
  if (!detail) notFound();

  const { trip, groups, momentCount } = detail;
  const dates = formatTripDates(trip.startsOn, trip.endsOn);
  const assignable = await listAssignableMoments(session.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/trips" className="text-muted text-sm hover:underline">
          ← Trips
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{trip.name}</h1>
        <p className="text-muted text-sm">
          {dates ? `${dates} · ` : ""}
          {momentCount === 0
            ? "No moments yet"
            : `${momentCount} ${momentCount === 1 ? "moment" : "moments"} across ${groups.length} ${
                groups.length === 1 ? "place" : "places"
              }`}
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.cityId} className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{group.cityName}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {group.moments.map((moment) => (
              <li key={moment.id}>
                <Link href={`/moments/${moment.id}`} className="flex flex-col gap-1">
                  <MomentPhoto
                    url={moment.photoUrl}
                    alt={moment.caption ?? `Moment in ${group.cityName}`}
                    width={moment.width}
                    height={moment.height}
                    className="rounded-card aspect-square w-full object-cover"
                  />
                  <span className="text-muted truncate text-xs">
                    {moment.caption || formatMomentDate(moment.takenAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>{momentCount === 0 ? "Add moments" : "Add or remove moments"}</CardTitle>
        </CardHeader>
        <CardContent>
          <AssignMomentsList tripId={trip.id} moments={assignable} />
        </CardContent>
      </Card>

      <DeleteTripButton tripId={trip.id} tripName={trip.name} />
    </div>
  );
}
