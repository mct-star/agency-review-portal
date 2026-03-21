import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import ContentCalendar from "@/components/calendar/ContentCalendar";

export default async function CalendarPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";

  // Fetch companies for the company picker
  type CompanyInfo = { id: string; name: string; brand_color: string | null };
  let companies: CompanyInfo[] = [];

  if (isAdmin) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, brand_color")
      .order("name");
    companies = data || [];
  } else if (profile.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, brand_color")
      .eq("id", profile.company_id)
      .single();
    if (data) companies = [data];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Content Calendar</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage scheduled content across weeks and months.
        </p>
      </div>

      {companies.length > 0 ? (
        <ContentCalendar
          companies={companies}
          showCompanyPicker={isAdmin && companies.length > 1}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">No companies configured yet.</p>
        </div>
      )}
    </div>
  );
}
