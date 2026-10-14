import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import ArticleForm, { type TopicOption } from "./ArticleForm";

export const metadata: Metadata = {
  title: "Blog / Article | AGENCY",
  description: "Generate long-form thought leadership",
};

export default async function ArticlePage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";

  // Writing a blog runs the full generation route, which is admin only.
  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Blog / Article</h1>
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">Blog articles are written by the AGENCY team and shared with you for review.</p>
        </div>
      </div>
    );
  }

  type CompanyInfo = { id: string; name: string };
  let companies: CompanyInfo[] = [];

  if (isAdmin) {
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .order("name");
    companies = data || [];
  } else if (profile.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", profile.company_id)
      .single();
    if (data) companies = [data];
  }

  const { data: topicRows } = await supabase
    .from("topic_bank")
    .select("id, company_id, title, pillar, audience_theme, topic_number")
    .in("company_id", companies.map(c => c.id))
    .eq("is_used", false)
    .order("topic_number");
  const topics: TopicOption[] = (topicRows || []).map(t => ({
    id: t.id, companyId: t.company_id, title: t.title, pillar: t.pillar, audienceTheme: t.audience_theme,
  }));

  if (companies.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Blog / Article</h1>
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">
            No company set up yet. Complete your company setup first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Blog / Article</h1>
        <p className="mt-1 text-sm text-gray-500">
          Long-form thought leadership, built on the three layers and written in the company voice.
        </p>
      </div>
      <ArticleForm
        companies={companies}
        topics={topics}
        showCompanyPicker={isAdmin && companies.length > 1}
      />
    </div>
  );
}
