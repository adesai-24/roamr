import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/actions/auth";
import { listFriendships } from "@/lib/actions/friends";
import { listMyTrips } from "@/lib/actions/trips";
import { AppNav } from "@/components/app-nav";
import { AddMomentForm } from "@/components/forms/add-moment-form";

export default async function NewMomentPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [{ accepted }, trips] = await Promise.all([listFriendships(), listMyTrips()]);

  return (
    <>
      <AppNav username={profile.username} />
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="text-xl font-semibold tracking-tight">New moment</h1>
        <AddMomentForm friends={accepted.map((f) => f.profile)} trips={trips} />
      </main>
    </>
  );
}
