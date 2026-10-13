import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MomentPhoto } from "@/components/moments/moment-photo";
import { buttonStyles } from "@/components/ui/button";
import { getSession } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { formatCollectionSpan, formatMomentCount } from "@/lib/moments/format";
import { listPlaces } from "@/lib/moments/queries";
import styles from "../app.module.css";

export const metadata: Metadata = {
  title: "Places · roamr",
};

/** The cover images are square crops, so a fixed aspect keeps the grid even. */
const COVER_ASPECT = { width: 1, height: 1 };

export default async function PlacesPage() {
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);

  const places = await listPlaces(session.id);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Places</h1>
          <p className="text-muted text-sm">Your city collections, most recent first.</p>
        </div>
        <Link href="/moments/new" className={buttonStyles({ size: "md" })}>
          Add a moment
        </Link>
      </div>

      {places.length === 0 ? (
        <section className={styles.empty}>
          <h2>No places yet</h2>
          <p>Add a photo to start a city collection. Future moments from the same city join it.</p>
          <Link href="/moments/new" className={buttonStyles()}>
            Add your first moment
          </Link>
        </section>
      ) : (
        <ul className={styles.collectionGrid}>
          {places.map((place) => {
            const span = formatCollectionSpan(place.firstMomentAt, place.lastMomentAt);
            return (
              <li key={place.cityId}>
                <Link href={`/places/${place.cityId}`} className={styles.collectionLink}>
                  <MomentPhoto
                    url={place.coverPhotoUrl}
                    alt={`Cover photo from ${place.cityDisplayName}`}
                    width={COVER_ASPECT.width}
                    height={COVER_ASPECT.height}
                    className="aspect-square"
                  />
                  <div className={styles.collectionCaption}>
                    <span className={styles.collectionTitle}>{place.cityName}</span>
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
