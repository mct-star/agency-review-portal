import VenueSettings from "@/components/hospitality/VenueSettings";
import { getUserProfile } from "@/lib/supabase/server";

export default async function VenuePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const profile = await getUserProfile();
  // Only AGENCY changes the pack; a company member sees it as a fixed line.
  const canChangePack = profile?.role === "admin";
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Venue and posting</h2>
        <p className="mt-1 text-sm text-gray-600">What kind of posts you write, where they go, and who can help.</p>
      </div>
      <VenueSettings companyId={companyId} canChangePack={canChangePack} />
    </div>
  );
}
