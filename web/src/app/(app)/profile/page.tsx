import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/(app)/actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { DisplayNameForm, VisibilityForm } from "./profile-forms";

export const metadata: Metadata = {
  title: "Profile · roamr",
};

export default async function ProfilePage() {
  const current = await getCurrentUser();
  // Middleware already gates this route.
  if (!current) redirect(LOGIN_PATH);

  const { profile, email } = current;
  const displayName = profile?.displayName ?? "";
  const username = profile?.username ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar name={displayName || username} size="lg" />
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {displayName || username}
          </h1>
          {username && <p className="text-muted truncate text-sm">@{username}</p>}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your name</CardTitle>
          <CardDescription>
            Change how you appear to friends. Your username is permanent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DisplayNameForm initialValue={displayName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
          <CardDescription>
            Friends-only is the default. Going public is something you turn on deliberately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VisibilityForm isPublic={profile?.isPublic ?? false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Email</dt>
              <dd className="truncate">{email ?? "Not set"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Username</dt>
              <dd className="truncate">{username ? `@${username}` : "Not set"}</dd>
            </div>
          </dl>
          {/* A plain form post rather than an onClick handler, so signing out
              works with JavaScript unavailable and the auth cookies are cleared
              by the server that set them. */}
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
