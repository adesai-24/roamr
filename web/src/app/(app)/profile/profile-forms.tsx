"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/profile/display-name";
import {
  type ProfileActionState,
  updateAccountVisibility,
  updateDisplayName,
} from "@/lib/profile/actions";

const IDLE: ProfileActionState = { status: "idle" };

/**
 * `useFormStatus` has to read from a child of the form, which is why this is
 * its own component rather than a hook call in the parent.
 */
function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

function StatusMessage({ state }: { state: ProfileActionState }) {
  if (state.status === "idle") return null;
  const isError = state.status === "error";
  return (
    <p
      // Announced rather than silently swapped in: someone using a screen
      // reader gets no other signal that the save happened.
      role="status"
      aria-live="polite"
      className={isError ? "text-danger text-sm" : "text-muted text-sm"}
    >
      {state.message}
    </p>
  );
}

export function DisplayNameForm({ initialValue }: { initialValue: string }) {
  const [state, formAction] = useActionState(updateDisplayName, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field
        id="displayName"
        label="Display name"
        hint="How your name appears to friends. Your username stays the same."
        error={state.status === "error" ? state.message : undefined}
      >
        <Input
          id="displayName"
          name="displayName"
          defaultValue={initialValue}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="name"
          placeholder="Your name"
        />
      </Field>
      <div className="flex items-center gap-3">
        <SubmitButton>Save name</SubmitButton>
        {state.status === "saved" && <StatusMessage state={state} />}
      </div>
    </form>
  );
}

export function VisibilityForm({ isPublic }: { isPublic: boolean }) {
  const [state, formAction] = useActionState(updateAccountVisibility, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* Submitted as the opposite of the current value: this is a toggle, so
          the button's job is to flip the state, not to report it. */}
      <input type="hidden" name="isPublic" value={isPublic ? "false" : "true"} />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {isPublic ? "Your profile is public" : "Your profile is friends-only"}
        </p>
        <p className="text-muted text-sm">
          {isPublic
            ? "Anyone with your profile link can see your username and display name. Your moments stay friends-only unless you make them public one by one."
            : "Only people you have accepted as friends can find you. This is the default."}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton>{isPublic ? "Make friends-only" : "Make public"}</SubmitButton>
        {state.status !== "idle" && <StatusMessage state={state} />}
      </div>
    </form>
  );
}
