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
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-bold text-gray-900">Support Tickets</h1>
      <p className="mt-1 text-sm text-gray-500">
        View and manage user-reported issues
      </p>
      <div className="mt-6">
        <TicketsTable tickets={tickets || []} />
      </div>
    </div>
  );
}
