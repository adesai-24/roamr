import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MomentPhoto } from "@/components/moments/moment-photo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { formatTripCities, formatTripDates } from "@/lib/trips/format";
import { listTrips } from "@/lib/trips/queries";
import { CreateTripForm } from "./trip-forms";

export const metadata: Metadata = {
  title: "Trips · roamr",
};

export default async function TripsPage() {
  const current = await getCurrentUser();
  if (!current) redirect(LOGIN_PATH);

  const trips = await listTrips();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Trips</h1>
          <p className="text-muted text-sm">
            Group moments from one stretch of time, even across several cities.
          </p>
        </div>
        <CreateTripForm />
      </div>

      {trips.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No trips yet</CardTitle>
            <CardDescription>
              A label over some moments. “July 4th”, “Pinnacles”. Nothing has to belong to one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted text-sm">
              Your moments already collect by city on{" "}
              <Link href="/places" className="text-accent underline">
                Places
              </Link>
              . Trips are the other way of looking at the same photos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {trips.map((trip) => {
            const dates = formatTripDates(trip.startsOn, trip.endsOn);
            const cities = formatTripCities(trip.cityNames);
            return (
              <li key={trip.id}>
                <Link
                  href={`/trips/${trip.id}`}
                  className="border-border bg-surface rounded-card hover:border-accent flex flex-col overflow-hidden border transition-colors"
                >
                  <MomentPhoto
                    url={trip.coverPhotoUrl}
                    alt=""
                    width={4}
                    height={3}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <span className="flex flex-col gap-1 p-4">
                    <span className="truncate font-medium">{trip.name}</span>
                    {dates && <span className="text-muted text-sm">{dates}</span>}
                    <span className="text-muted text-sm">
                      {trip.momentCount === 0
                        ? "No moments yet"
                        : `${trip.momentCount} ${trip.momentCount === 1 ? "moment" : "moments"}`}
                      {cities && ` · ${cities}`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
