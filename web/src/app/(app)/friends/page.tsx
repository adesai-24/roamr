import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { getFriendsOverview } from "@/lib/friends/queries";
import type { FriendPerson } from "@/lib/friends/types";
import { AddFriendForm } from "./add-friend-form";
import { FriendActions, type FriendRowVariant } from "./friend-actions";

export const metadata: Metadata = {
  title: "Friends · roamr",
};

export default async function FriendsPage() {
  // The layout above has already established there is a session.
  const current = await getCurrentUser();
  if (!current) redirect(LOGIN_PATH);

  const { friends, incoming, outgoing } = await getFriendsOverview(current.id);
  const ownUsername = current.profile?.username ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Friends</h1>
        <p className="text-muted text-sm">
          Everything you post is visible to these people and nobody else.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a friend</CardTitle>
          <CardDescription>
            {ownUsername ? (
              <>
                Ask them for their username, and give them yours: <strong>@{ownUsername}</strong>.
              </>
            ) : (
              <>Ask them for their username. There is no search and no suggestions.</>
            )}
          </CardDescription>
        </CardHeader>
        <AddFriendForm />
      </Card>

      <PeopleSection
        title="Requests"
        count={incoming.length}
        people={incoming}
        variant="incoming"
        empty="Nobody is waiting on you. Requests people send you show up here."
      />

      <PeopleSection
        title="Sent"
        count={outgoing.length}
        people={outgoing}
        variant="outgoing"
        empty="You have not asked anyone yet."
      />

      <PeopleSection
        title="Your friends"
        count={friends.length}
        people={friends}
        variant="friend"
        empty="No friends yet. Add someone above and your feed starts filling up."
      />
    </div>
  );
}

interface PeopleSectionProps {
  title: string;
  count: number;
  people: FriendPerson[];
  variant: FriendRowVariant;
  empty: string;
}

function PeopleSection({ title, count, people, variant, empty }: PeopleSectionProps) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`friends-${variant}`}>
      <h2 id={`friends-${variant}`} className="text-lg font-semibold tracking-tight">
        {title}
        {count > 0 ? <span className="text-muted ml-2 text-sm font-normal">{count}</span> : null}
      </h2>

      {people.length === 0 ? (
        <p className="text-muted text-sm">{empty}</p>
      ) : (
        <ul className="border-border bg-surface rounded-card divide-border divide-y border">
          {people.map((person) => (
            <PersonRow key={person.userId} person={person} variant={variant} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PersonRow({ person, variant }: { person: FriendPerson; variant: FriendRowVariant }) {
  const handle = person.username ? `@${person.username}` : "Someone";
  const name = person.displayName ?? handle;

  return (
    <li className="flex items-center gap-3 p-3">
      <Avatar name={person.displayName ?? person.username} size="md" />

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        {person.displayName && person.username ? (
          <p className="text-muted truncate text-sm">{handle}</p>
        ) : null}
      </div>

      <FriendActions userId={person.userId} name={name} variant={variant} />
    </li>
  );
}
