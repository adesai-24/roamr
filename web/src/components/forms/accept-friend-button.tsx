"use client";

import { useTransition } from "react";
import { acceptFriendRequest } from "@/lib/actions/friends";
import { Button } from "@/components/ui/button";

export function AcceptFriendButton({ friendshipId }: { friendshipId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      className="px-2 py-1 text-xs"
      disabled={isPending}
      onClick={() =>
        startTransition(() => {
          void acceptFriendRequest(friendshipId);
        })
      }
    >
      {isPending ? "Accepting..." : "Accept"}
    </Button>
  );
}
