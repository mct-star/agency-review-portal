import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/login");

  if (profile.role === "admin") {
    redirect("/setup");
  }

  if (profile.company_id) {
    redirect(`/setup/${profile.company_id}`);
  }

  redirect("/home");
}
