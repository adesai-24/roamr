"use client";

import { useActionState, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Field, fieldDescribedBy } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { requestMagicLink, signInWithPassword, type LoginState } from "./actions";

const EMAIL_FIELD_ID = "login-email";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [method, setMethod] = useState<"link" | "password">("link");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="group" aria-label="Sign-in method">
        <Button
          type="button"
          variant={method === "link" ? "primary" : "secondary"}
          aria-pressed={method === "link"}
          onClick={() => setMethod("link")}
        >
          Email link
        </Button>
        <Button
          type="button"
          variant={method === "password" ? "primary" : "secondary"}
          aria-pressed={method === "password"}
          onClick={() => setMethod("password")}
        >
          Password
        </Button>
      </div>
      <LoginMethodForm
        key={method}
        next={next}
        method={method}
        initialError={method === "link" ? initialError : undefined}
      />
    </div>
  );
}

function LoginMethodForm({
  next,
  initialError,
  method,
}: {
  next: string;
  initialError?: string;
  method: "link" | "password";
}) {
  const initialState: LoginState = initialError
    ? { status: "error", message: initialError }
    : { status: "idle" };

  const [state, formAction, pending] = useActionState(
    method === "password" ? signInWithPassword : requestMagicLink,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Check your email</h2>
          <p className="text-muted text-sm">
            We sent a sign-in link to{" "}
            <span className="text-foreground font-medium">{state.email}</span>. Open it on this
            browser and you are in.
          </p>
        </div>
        <p className="text-muted text-sm">
          Nothing yet? It can take a minute, and it likes to land in spam.
        </p>
        {/*
          A full page load rather than a client-side link: the point of this
          control is to throw away the submitted state, and client navigation to
          the same route would keep it.
        */}
        <a href={LOGIN_PATH} className={buttonStyles({ variant: "secondary", fullWidth: true })}>
          Use a different email
        </a>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <Field
        id={EMAIL_FIELD_ID}
        label="Email"
        hint={
          method === "link"
            ? "We send a link. No password to forget."
            : "Use the email for your account."
        }
        error={error}
      >
        <Input
          id={EMAIL_FIELD_ID}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="you@example.com"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(EMAIL_FIELD_ID, { hint: true, error })}
        />
      </Field>

      {method === "password" && (
        <Field id="login-password" label="Password">
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
      )}

      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {method === "password"
          ? pending
            ? "Signing in…"
            : "Sign in with password"
          : pending
            ? "Sending…"
            : "Send sign-in link"}
      </Button>
    </form>
  );
}
