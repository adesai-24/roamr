import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MomentPhoto } from "@/components/moments/moment-photo";
import { getCurrentUser } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { formatMomentDate } from "@/lib/moments/format";
import { getMoment } from "@/lib/moments/queries";
import { MomentEditor } from "./moment-editor";

export const metadata: Metadata = {
  title: "Moment · roamr",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MomentPage({ params }: { params: Promise<{ momentId: string }> }) {
  const { momentId } = await params;

  const current = await getCurrentUser();
  if (!current) redirect(LOGIN_PATH);

  if (!UUID.test(momentId)) notFound();

  // A moment nobody has shared with the caller comes back as null from the select policy.
  const detail = await getMoment(current.id, momentId);
  if (!detail) notFound();

  const { moment, city, isOwner } = detail;
  const takenAt = formatMomentDate(moment.takenAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/places/${city.id}`} className="text-muted w-fit text-sm hover:underline">
          ← {city.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{city.display_name}</h1>
        {takenAt ? <p className="text-muted text-sm">{takenAt}</p> : null}
      </div>

      <MomentPhoto
        url={moment.photoUrl}
        alt={moment.caption ?? `A moment from ${city.name}`}
        width={moment.width}
        height={moment.height}
        className="rounded-card"
        eager
      />

      {moment.caption ? <p className="text-base whitespace-pre-line">{moment.caption}</p> : null}

      {moment.pinLat !== null && moment.pinLng !== null ? (
        <p className="text-muted text-sm">
          Pinned at {moment.pinLat.toFixed(5)}, {moment.pinLng.toFixed(5)}
        </p>
      ) : null}

      {isOwner ? (
        <>
          <hr className="border-border" />
          <MomentEditor
            momentId={moment.id}
            caption={moment.caption}
            pin={
              moment.pinLat !== null && moment.pinLng !== null
                ? { lat: moment.pinLat, lng: moment.pinLng }
                : null
            }
            city={{
              id: city.id,
              displayName: city.display_name,
              providerPlaceId: city.provider_place_id,
              lat: city.lat,
              lng: city.lng,
            }}
          />
        </>
      ) : null}
    </div>
  );
}
