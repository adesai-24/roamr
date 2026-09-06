"use client";

import { useState, useTransition } from "react";
import { sendFriendRequest } from "@/lib/actions/friends";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FriendRequestForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex gap-2"
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await sendFriendRequest(formData);
          if (result?.error) setError(result.error);
          else
            (document.getElementById("friend-username") as HTMLInputElement | null)?.form?.reset();
        });
      }}
    >
      <Input id="friend-username" name="username" placeholder="username" required />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending..." : "Add"}
      </Button>
      {error && (
        <p className="text-danger self-center text-sm" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
