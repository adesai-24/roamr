import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MomentPhoto } from "@/components/moments/moment-photo";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { formatCollectionSpan, formatMomentCount } from "@/lib/moments/format";
import { listPlaces } from "@/lib/moments/queries";

export const metadata: Metadata = {
  title: "Places · roamr",
};

/** The cover images are square crops, so a fixed aspect keeps the grid even. */
const COVER_ASPECT = { width: 1, height: 1 };

export default async function PlacesPage() {
  // The layout has already established a session. Asking again costs nothing
  // (`cache`) and means this page does not depend on a layout staying put.
  const current = await getCurrentUser();
  if (!current) redirect(LOGIN_PATH);

  const places = await listPlaces(current.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Places</h1>
          <p className="text-muted text-sm">
            Every city you have added a moment from, most recent first.
          </p>
        </div>
        <Link href="/moments/new" className={buttonStyles({ size: "md" })}>
          Add a moment
        </Link>
      </div>

      {places.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No places yet</CardTitle>
            <CardDescription>
              Add a photo and it starts your collection for the city it came from. Add another from
              the same city later and it joins the same one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/moments/new" className={buttonStyles({ size: "lg", fullWidth: true })}>
              Add your first moment
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {places.map((place) => {
            const span = formatCollectionSpan(place.firstMomentAt, place.lastMomentAt);
            return (
              <li key={place.cityId}>
                <Link
                  href={`/places/${place.cityId}`}
                  className="border-border bg-surface rounded-card focus-visible:outline-accent block overflow-hidden border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <MomentPhoto
                    url={place.coverPhotoUrl}
                    alt={`Cover photo from ${place.cityDisplayName}`}
                    width={COVER_ASPECT.width}
                    height={COVER_ASPECT.height}
                    className="aspect-square"
                  />
                  <div className="flex flex-col gap-0.5 p-3">
                    <span className="truncate text-sm font-medium">{place.cityName}</span>
                    <span className="text-muted truncate text-xs">{place.cityDisplayName}</span>
                    <span className="text-muted text-xs">
                      {formatMomentCount(place.momentCount)}
                      {span ? ` · ${span}` : ""}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
