import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasClaimedUsername } from "@/lib/auth/profile";
import { APP_HOME_PATH, LOGIN_PATH } from "@/lib/auth/routes";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Pick a username · roamr",
};

export default async function OnboardingPage() {
  const current = await getCurrentUser();
  if (!current) redirect(LOGIN_PATH);

  // Middleware sends anyone who already has a username straight to the app.
  if (hasClaimedUsername(current.profile)) redirect(APP_HOME_PATH);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Pick a username</h1>
        <p className="text-muted text-sm">This is how friends find you.</p>
      </div>

      <OnboardingForm defaultDisplayName={current.profile?.displayName ?? undefined} />
    </div>
  );
}
