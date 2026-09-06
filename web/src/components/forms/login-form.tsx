"use client";

import { useState, useTransition } from "react";
import { logIn } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await logIn(formData);
          if (result?.error) setError(result.error);
        });
      }}
    >
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
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Logging in..." : "Log in"}
      </Button>
    </form>
  );
}
