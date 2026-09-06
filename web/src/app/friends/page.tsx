import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/actions/auth";
import { listFriendships } from "@/lib/actions/friends";
import { AppNav } from "@/components/app-nav";
import { Card } from "@/components/ui/input";
import { FriendRequestForm } from "@/components/forms/friend-request-form";
import { AcceptFriendButton } from "@/components/forms/accept-friend-button";

export default async function FriendsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { accepted, incoming, outgoing } = await listFriendships();

  return (
    <>
      <AppNav username={profile.username} />
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
        <h1 className="text-xl font-semibold tracking-tight">Friends</h1>

        <section className="flex flex-col gap-2">
          <h2 className="text-muted text-xs font-medium tracking-wide uppercase">Add a friend</h2>
          <FriendRequestForm />
        </section>

        {incoming.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
              Requests for you
            </h2>
            {incoming.map((row) => (
              <Card key={row.friendshipId} className="flex items-center justify-between">
                <span>@{row.profile.username}</span>
                <AcceptFriendButton friendshipId={row.friendshipId} />
              </Card>
            ))}
          </section>
        )}

        {outgoing.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
              Waiting on them
            </h2>
            {outgoing.map((row) => (
              <Card key={row.friendshipId} className="text-muted text-sm">
                @{row.profile.username}
              </Card>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-muted text-xs font-medium tracking-wide uppercase">Friends</h2>
          {accepted.length === 0 && <p className="text-muted text-sm">No friends yet.</p>}
          {accepted.map((row) => (
            <Card key={row.friendshipId} className="text-sm">
              @{row.profile.username}
            </Card>
          ))}
        </section>
      </main>
    </>
  );
}
