import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MomentPhoto } from "@/components/moments/moment-photo";
import { getSession } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { formatTripCities, formatTripDates } from "@/lib/trips/format";
import { listTrips } from "@/lib/trips/queries";
import { CreateTripForm } from "./trip-forms";
import styles from "../app.module.css";

export const metadata: Metadata = {
  title: "Trips · roamr",
};

export default async function TripsPage() {
  if (!(await getSession())) redirect(LOGIN_PATH);

  const trips = await listTrips();

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Trips</h1>
          <p className="text-muted text-sm">Moments grouped by trip, across every stop.</p>
        </div>
        <CreateTripForm />
      </div>

      {trips.length === 0 ? (
        <section className={styles.empty}>
          <h2>No trips yet</h2>
          <p>
            Create a trip, then add moments from your collection. Photos stay in their city
            collections too.
          </p>
          <Link href="/places" className="text-accent text-sm underline underline-offset-4">
            Browse your places →
          </Link>
        </section>
      ) : (
        <ul className={styles.tripGrid}>
          {trips.map((trip) => {
            const dates = formatTripDates(trip.startsOn, trip.endsOn);
            const cities = formatTripCities(trip.cityNames);
            return (
              <li key={trip.id}>
                <Link href={`/trips/${trip.id}`} className={styles.collectionLink}>
                  <MomentPhoto
                    url={trip.coverPhotoUrl}
                    alt=""
                    width={4}
                    height={3}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <span className={styles.collectionCaption}>
                    <span className={styles.collectionTitle}>{trip.name}</span>
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
