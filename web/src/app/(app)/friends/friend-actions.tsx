"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptFriendRequest, removeFriendship } from "@/lib/friends/actions";
import type { FriendActionResult } from "@/lib/friends/types";

export type FriendActionFn = (otherUserId: string) => Promise<FriendActionResult>;

/** Which of the three lists this row is in. */
export type FriendRowVariant = "incoming" | "outgoing" | "friend";

export interface FriendActionsProps {
  userId: string;
  /** Used in the confirmation prompt and in every button's accessible name. */
  name: string;
  variant: FriendRowVariant;
  /** Injectable so tests drive the buttons without reaching a server action. */
  accept?: FriendActionFn;
  remove?: FriendActionFn;
}

export function FriendActions({
  userId,
  name,
  variant,
  accept = acceptFriendRequest,
  remove = removeFriendship,
}: FriendActionsProps) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: FriendActionFn) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await action(userId);
      // Nothing to do on success.
      if (!result.ok) setError(result.error);
      setConfirming(false);
    });
  }

  // Unfriending is the one destructive thing on this screen.
  if (variant === "friend" && confirming) {
    return (
      <Actions error={error}>
        <span className="text-muted text-sm">Remove {name}?</span>
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() => run(remove)}
          aria-label={`Yes, remove ${name}`}
        >
          {pending ? "Removing…" : "Remove"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Keep
        </Button>
      </Actions>
    );
  }

  if (variant === "friend") {
    return (
      <Actions error={error}>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirming(true)}
          aria-label={`Remove ${name}`}
        >
          Remove
        </Button>
      </Actions>
    );
  }

  if (variant === "outgoing") {
    return (
      <Actions error={error}>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => run(remove)}
          aria-label={`Cancel the request to ${name}`}
        >
          {pending ? "Cancelling…" : "Cancel"}
        </Button>
      </Actions>
    );
  }

  return (
    <Actions error={error}>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => run(accept)}
        aria-label={`Accept ${name}`}
      >
        {pending ? "Accepting…" : "Accept"}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => run(remove)}
        aria-label={`Decline ${name}`}
      >
        Decline
      </Button>
    </Actions>
  );
}

/** Buttons on one line, with room underneath for whatever went wrong. */
function Actions({ error, children }: { error: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
      {error ? (
        <p role="alert" className="text-danger text-right text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
