import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import TicketsTable from "./TicketsTable";

export const metadata = {
  title: "Support Tickets",
};

export default async function AdminTicketsPage() {
  const profile = await requireAdmin();
  if (!profile) redirect("/login");

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .select("*, company:companies(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const tickets = (data || []).map((row) => {
    const { company, ...rest } = row as Record<string, unknown> & { company?: { name?: string } | { name?: string }[] | null };
    const name = Array.isArray(company) ? company[0]?.name : company?.name;
    return { ...rest, company_name: name ?? null };
  }) as unknown as React.ComponentProps<typeof TicketsTable>["tickets"];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-bold text-gray-900">Support Tickets</h1>
      <p className="mt-1 text-sm text-gray-500">
        View and manage user-reported issues
      </p>
      {error && (
        <p className="mt-4 text-sm text-red-600">The tickets did not load: {error.message}</p>
      )}
      <div className="mt-6">
        <TicketsTable tickets={tickets} />
      </div>
    </div>
  );
}
