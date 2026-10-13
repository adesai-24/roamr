"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldDescribedBy } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { sendFriendRequest } from "@/lib/friends/actions";
import type { FriendActionResult } from "@/lib/friends/types";
import { USERNAME_MAX_LENGTH, normalizeUsername } from "@/lib/username";

const USERNAME_FIELD_ID = "add-friend-username";

export type SendFriendRequestFn = (username: string) => Promise<FriendActionResult>;

export interface AddFriendFormProps {
  /** Injectable so tests drive the form without reaching a server action. */
  send?: SendFriendRequestFn;
}

/** Add a friend by typing their exact username. */
export function AddFriendForm({ send = sendFriendRequest }: AddFriendFormProps) {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<FriendActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const value = normalizeUsername(username);
    setResult(null);

    startTransition(async () => {
      const outcome = await send(value);
      setResult(outcome);
      // Clearing only on success leaves a rejected username in the box.
      if (outcome.ok) setUsername("");
    });
  }

  const error = result && !result.ok ? result.error : undefined;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <Field
        id={USERNAME_FIELD_ID}
        label="Their username"
        hint="Exactly as they typed it. roamr does not suggest people."
        error={error}
      >
        <Input
          id={USERNAME_FIELD_ID}
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="grass_toucher"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={USERNAME_MAX_LENGTH}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(USERNAME_FIELD_ID, { hint: true, error })}
        />
      </Field>

      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "Sending…" : "Send request"}
      </Button>

      {/*
        Announced rather than merely shown: the row that proves the request went
        out appears further down the page, well outside where somebody is
        looking after pressing the button.
      */}
      <p role="status" aria-live="polite" className="text-muted text-sm empty:hidden">
        {result?.ok ? result.message : null}
      </p>
    </form>
  );
}
