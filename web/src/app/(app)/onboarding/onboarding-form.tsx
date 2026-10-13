"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldDescribedBy } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  normalizeUsername,
  validateUsername,
} from "@/lib/username";
import { claimUsername, type ClaimUsernameState } from "./actions";

const USERNAME_FIELD_ID = "onboarding-username";
const DISPLAY_NAME_FIELD_ID = "onboarding-display-name";

const EMPTY_STATE: ClaimUsernameState = {};

export function OnboardingForm({ defaultDisplayName }: { defaultDisplayName?: string }) {
  const [state, formAction, pending] = useActionState(claimUsername, EMPTY_STATE);
  const [username, setUsername] = useState(state.values?.username ?? "");

  // Client-side validation is a courtesy.
  const normalized = normalizeUsername(username);
  const localCheck = normalized.length > 0 ? validateUsername(normalized) : null;
  const localError = localCheck && !localCheck.ok ? localCheck.message : undefined;
  const usernameError = state.errors?.username ?? localError;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <Field
        id={USERNAME_FIELD_ID}
        label="Username"
        required
        hint={`${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters. Lowercase letters, numbers and underscores.`}
        error={usernameError}
      >
        <Input
          id={USERNAME_FIELD_ID}
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={USERNAME_MAX_LENGTH}
          placeholder="grass_toucher"
          required
          autoFocus
          aria-invalid={usernameError ? true : undefined}
          aria-describedby={fieldDescribedBy(USERNAME_FIELD_ID, {
            hint: true,
            error: usernameError,
          })}
        />
      </Field>

      <Field
        id={DISPLAY_NAME_FIELD_ID}
        label="Display name"
        hint="Optional. What your friends actually call you."
        error={state.errors?.displayName}
      >
        <Input
          id={DISPLAY_NAME_FIELD_ID}
          name="displayName"
          defaultValue={state.values?.displayName ?? defaultDisplayName ?? ""}
          autoComplete="name"
          maxLength={60}
          placeholder="Mann"
          aria-invalid={state.errors?.displayName ? true : undefined}
          aria-describedby={fieldDescribedBy(DISPLAY_NAME_FIELD_ID, {
            hint: true,
            error: state.errors?.displayName,
          })}
        />
      </Field>

      {state.errors?.form ? (
        <p role="alert" className="text-danger text-sm">
          {state.errors.form}
        </p>
      ) : null}

      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "Claiming…" : "Claim username"}
      </Button>
    </form>
  );
}
