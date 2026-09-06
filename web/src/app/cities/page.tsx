import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/actions/auth";
import { listMyCities } from "@/lib/actions/moments";
import { AppNav } from "@/components/app-nav";
import { Card } from "@/components/ui/input";

export default async function MyCitiesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const cities = await listMyCities();

  return (
    <>
      <AppNav username={profile.username} />
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="text-xl font-semibold tracking-tight">My Cities</h1>
        {cities.length === 0 && (
          <p className="text-muted text-sm">
            Nothing here yet -- log a moment and its city shows up automatically.
          </p>
        )}
        {cities.map((city) => (
          <Link key={city.cityId} href={`/cities/${city.cityId}`}>
            <Card className="flex items-center justify-between hover:opacity-80">
              <span>
                {city.name}
                {city.region ? `, ${city.region}` : ""} · {city.country}
              </span>
              <span className="text-muted text-sm">
                {city.momentCount} moment{city.momentCount === 1 ? "" : "s"}
              </span>
            </Card>
          </Link>
        ))}
      </main>
    </>
  );
}
