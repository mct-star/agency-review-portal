import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/login");

  if (profile.role === "admin") {
    redirect("/setup");
  }

  if (profile.company_id) {
    // A venue's brand and settings live on its own page.
    const company = profile.company as { post_pack?: string | null } | null | undefined;
    if (company?.post_pack === "hospitality") redirect(`/setup/${profile.company_id}/hospitality`);
    redirect(`/setup/${profile.company_id}`);
  }

  redirect("/home");
}
