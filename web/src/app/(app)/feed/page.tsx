import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/profile";

export const metadata: Metadata = {
  title: "Feed · roamr",
};

export default async function FeedPage() {
  // The layout above has already established there is a session.
  const current = await getCurrentUser();
  const name = current?.profile?.displayName ?? current?.profile?.username ?? "there";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Hey {name}</h1>
        <p className="text-muted text-sm">
          Reverse-chronological, friends only, no ranking. That is the whole feed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nothing here yet</CardTitle>
          <CardDescription>
            Your feed fills up once you have friends and they start posting moments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted text-sm">
            Adding friends, cities and moments all land in later changes. Your account is ready for
            them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
