import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/actions/auth";
import { listMyCityMoments } from "@/lib/actions/moments";
import { AppNav } from "@/components/app-nav";
import { Card } from "@/components/ui/input";

export default async function CityDetailPage({ params }: { params: Promise<{ cityId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { cityId } = await params;
  const moments = await listMyCityMoments(cityId);

  return (
    <>
      <AppNav username={profile.username} />
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="text-xl font-semibold tracking-tight">
          {moments[0]?.city.name ?? "This city"}
        </h1>
        {moments.length === 0 && <p className="text-muted text-sm">No moments here yet.</p>}
        {moments.map((moment) => (
          <Card key={moment.id} className="flex flex-col gap-2">
            {moment.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- see feed page for the same rationale.
              <img
                src={moment.photoUrl}
                alt={moment.caption ?? moment.city.name}
                className="rounded-card w-full object-cover"
              />
            )}
            {moment.caption && <p className="text-sm">{moment.caption}</p>}
          </Card>
        ))}
      </main>
    </>
  );
}
