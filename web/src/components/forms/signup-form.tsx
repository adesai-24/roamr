"use client";

import { useState, useTransition } from "react";
import { signUp } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await signUp(formData);
          if (result?.error) setError(result.error);
        });
      }}
    >
      <div>
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          minLength={3}
          maxLength={24}
        />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
        />
      </div>
      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Signing up..." : "Sign up"}
      </Button>
    </form>
  );
}
