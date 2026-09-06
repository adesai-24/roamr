import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/actions/auth";

export default async function Home() {
  const profile = await getCurrentProfile();
  redirect(profile ? "/feed" : "/login");
}
