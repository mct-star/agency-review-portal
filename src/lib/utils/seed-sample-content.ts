import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Seeds 3 sample posts for a new company so the platform doesn't look empty.
 * These are clearly labeled as samples and can be deleted by the user.
 */
export async function seedSampleContent(supabase: SupabaseClient, companyId: string) {
  // Create a sample week
  const now = new Date();
  const weekStart = new Date(now);
  const dayOfWeek = weekStart.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const { data: week } = await supabase.from("weeks").insert({
    company_id: companyId,
    week_number: 1,
    year: now.getFullYear(),
    date_start: weekStart.toISOString().split("T")[0],
    date_end: weekEnd.toISOString().split("T")[0],
    title: "Sample Week (delete when ready)",
    status: "draft",
  }).select("id").single();

  if (!week) return;

  // Create 3 sample posts
  const samplePosts = [
    {
      title: "[SAMPLE] The biggest mistake in our industry",
      markdown_body: "This is a sample Problem Diagnosis post.\n\nIt would open with a specific mistake your audience recognises, explain why it feels right to make that mistake, reveal the hidden cost, and hint at a better approach.\n\nDelete this sample and generate your own post in Quick Generate.",
      post_type: "insight",
      content_type: "social_post",
      day_of_week: "Monday",
      scheduled_time: "08:26",
      approval_status: "pending",
      sort_order: 1,
    },
    {
      title: "[SAMPLE] What I learned from our biggest client",
      markdown_body: "This is a sample Experience Story post.\n\nIt would share a real experience from your work, with specific details that build credibility. The story format makes it engaging and shareable.\n\nDelete this sample and generate your own post in Quick Generate.",
      post_type: "launch_story",
      content_type: "social_post",
      day_of_week: "Wednesday",
      scheduled_time: "08:26",
      approval_status: "approved",
      sort_order: 2,
    },
    {
      title: "[SAMPLE] Everyone says X. Here is why they are wrong.",
      markdown_body: "This is a sample Contrarian Take post.\n\nIt would challenge a widely-held belief in your industry with evidence and experience. These posts generate the most debate and shares.\n\nDelete this sample and generate your own post in Quick Generate.",
      post_type: "contrarian",
      content_type: "social_post",
      day_of_week: "Thursday",
      scheduled_time: "08:26",
      approval_status: "pending",
      sort_order: 3,
    },
  ];

  for (const post of samplePosts) {
    await supabase.from("content_pieces").insert({
      company_id: companyId,
      week_id: week.id,
      ...post,
    });
  }
}
