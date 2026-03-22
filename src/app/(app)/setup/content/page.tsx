import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/server";
import ContentSetupSelector from "./ContentSetupSelector";

export default async function ContentSetupPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/login");

  // Admin users go to the admin companies grid
  if (profile.role === "admin") {
    redirect("/setup");
  }

  const companyId = profile.company_id;
  if (!companyId) {
    redirect("/dashboard");
  }

  // Get company name from the joined company data
  const companyName =
    (profile as Record<string, unknown> & { company?: { name?: string } })
      .company?.name || "Your Company";
  const brandColor =
    (
      profile as Record<string, unknown> & {
        company?: { brand_color?: string };
      }
    ).company?.brand_color || null;
  const logoUrl =
    (
      profile as Record<string, unknown> & {
        company?: { logo_url?: string };
      }
    ).company?.logo_url || null;

  return (
    <ContentSetupSelector
      companyId={companyId}
      companyName={companyName}
      brandColor={brandColor}
      logoUrl={logoUrl}
    />
  );
}
