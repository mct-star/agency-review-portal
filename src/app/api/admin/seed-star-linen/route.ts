import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/seed-star-linen
 *
 * One-time seed script to create Star Linen UK company and spokesperson
 * on the platform. Idempotent — checks for existing records first.
 */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();
  const results: string[] = [];

  // ── 1. Check if Star Linen already exists ──────────────────
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", "star-linen-uk")
    .maybeSingle();

  let companyId: string;

  if (existing) {
    companyId = existing.id;
    results.push(`Company already exists (id: ${companyId}). Updating fields...`);
  } else {
    // Create the company
    const { data: newCompany, error: createErr } = await supabase
      .from("companies")
      .insert({
        name: "Star Linen UK",
        slug: "star-linen-uk",
        spokesperson_name: "Stephen Broadhurst",
        brand_color: "#1B3A5C", // Deep navy from Star Linen branding
        content_strategy_mode: "cohesive",
        plan: "pro",
        industry: "hospitality",
      })
      .select()
      .single();

    if (createErr) {
      return NextResponse.json({ error: `Failed to create company: ${createErr.message}` }, { status: 500 });
    }

    companyId = newCompany.id;
    results.push(`Created company "Star Linen UK" (id: ${companyId})`);
  }

  // ── 2. Update company with full details ────────────────────
  const { error: updateErr } = await supabase
    .from("companies")
    .update({
      description: "Star Linen UK Ltd is a B Corp certified hospitality textiles supplier. B Corp score 81.8 (median 50.9). 60-70% UK manufactured, carbon neutral. Specialist in hotel bedding, towels, and table linen. Founded and run by Stephen Broadhurst. Key differentiator: ReStart programme (circular economy — collecting, sorting, and redistributing used textiles). Serves hotels, care homes, and hospitality venues across the UK.",
      website_url: "https://star-linen.co.uk",
      industry: "hospitality",
      brand_color: "#1B3A5C",
      spokesperson_name: "Stephen Broadhurst",
      spokesperson_tagline: "Managing Director, Star Linen UK | B Corp | Hospitality Textiles",
    })
    .eq("id", companyId);

  if (updateErr) {
    results.push(`Warning: Failed to update company details: ${updateErr.message}`);
  } else {
    results.push("Updated company details (description, website, industry, brand colour)");
  }

  // ── 3. Create spokesperson ─────────────────────────────────
  const { data: existingPerson } = await supabase
    .from("company_spokespersons")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", "Stephen Broadhurst")
    .maybeSingle();

  if (existingPerson) {
    results.push(`Spokesperson "Stephen Broadhurst" already exists (id: ${existingPerson.id}). Updating...`);

    await supabase
      .from("company_spokespersons")
      .update({
        tagline: "Managing Director, Star Linen UK | B Corp | Hospitality Textiles",
        is_primary: true,
        is_active: true,
      })
      .eq("id", existingPerson.id);
  } else {
    const { data: newPerson, error: personErr } = await supabase
      .from("company_spokespersons")
      .insert({
        company_id: companyId,
        name: "Stephen Broadhurst",
        tagline: "Managing Director, Star Linen UK | B Corp | Hospitality Textiles",
        is_primary: true,
        is_active: true,
        sort_order: 0,
      })
      .select()
      .single();

    if (personErr) {
      results.push(`Warning: Failed to create spokesperson: ${personErr.message}`);
    } else {
      results.push(`Created spokesperson "Stephen Broadhurst" (id: ${newPerson.id})`);
    }
  }

  // ── 4. Create content topics ───────────────────────────────
  const topics = [
    { topic_number: 1, title: "The sector is changing shape", pillar: "P5", theme: "O", description: "UK hospitality structural change — retirement wave, solo operators, pivot to self-catering. Pure industry insight." },
    { topic_number: 2, title: "What a B Corp score of 81.8 actually means", pillar: "P4", theme: "S", description: "Explaining the B Corp assessment, median score (50.9), and what it means for hospitality procurement." },
    { topic_number: 3, title: "The ReStart programme — circular economy in textiles", pillar: "P4", theme: "S", description: "How collecting, sorting, and redistributing used hotel textiles creates a genuine circular economy." },
    { topic_number: 4, title: "Why UK manufacturing matters for hospitality supply chains", pillar: "P1", theme: "O", description: "60-70% UK manufactured. Shorter lead times, lower carbon miles, resilient supply chains." },
    { topic_number: 5, title: "The hidden cost of cheap hotel linen", pillar: "P1", theme: "V", description: "Total cost of ownership: wash cycles, replacement rate, guest perception. Cheap linen costs more over time." },
    { topic_number: 6, title: "What hotel guests actually notice", pillar: "P2", theme: "V", description: "Research on guest satisfaction drivers — linen quality ranks higher than most operators expect." },
    { topic_number: 7, title: "Sustainability credentials vs sustainability actions", pillar: "P4", theme: "S", description: "The difference between a badge and a practice. Carbon neutral operations, tree planting, ocean plastic removal." },
    { topic_number: 8, title: "The procurement conversation nobody is having", pillar: "P3", theme: "V", description: "How hospitality procurement teams evaluate suppliers — and why the conversation needs to change." },
    { topic_number: 9, title: "Running a hotel alone at seventy", pillar: "P5", theme: "O", description: "Personal observation from conversations with solo operators. Human, not corporate." },
    { topic_number: 10, title: "What suppliers owe their industry", pillar: "P5", theme: "V", description: "The role of suppliers in supporting a changing sector — not just selling to it." },
    { topic_number: 11, title: "Linen lifecycle — from manufacture to ReStart", pillar: "P4", theme: "S", description: "The full journey of a hotel towel: manufactured, used, washed hundreds of times, collected, redistributed." },
    { topic_number: 12, title: "Why the trade show model is broken", pillar: "P3", theme: "V", description: "Hotel operators can't leave their properties. The industry needs to come to them." },
  ];

  // Check existing topics
  const { data: existingTopics } = await supabase
    .from("content_topics")
    .select("id")
    .eq("company_id", companyId);

  if (existingTopics && existingTopics.length > 0) {
    results.push(`${existingTopics.length} topics already exist. Skipping topic creation.`);
  } else {
    const { error: topicsErr } = await supabase
      .from("content_topics")
      .insert(topics.map((t) => ({
        company_id: companyId,
        topic_number: t.topic_number,
        title: t.title,
        pillar: t.pillar,
        theme: t.theme,
        description: t.description,
        is_used: false,
      })));

    if (topicsErr) {
      results.push(`Warning: Failed to create topics: ${topicsErr.message}`);
    } else {
      results.push(`Created ${topics.length} content topics`);
    }
  }

  // ── 5. Set content pillars ─────────────────────────────────
  const { error: pillarsErr } = await supabase
    .from("companies")
    .update({
      content_pillars: JSON.stringify({
        P1: "Reliability & Quality — products that perform, supply chains that deliver",
        P2: "Guest Experience — what guests notice, what operators miss",
        P3: "Partnership — suppliers as partners, not vendors",
        P4: "Sustainability Without the Greenwash — B Corp, ReStart, carbon neutral",
        P5: "The Industry as It Actually Is — honest observations, not cheerleading",
      }),
    })
    .eq("id", companyId);

  if (pillarsErr) {
    results.push(`Warning: Failed to set content pillars: ${pillarsErr.message}`);
  } else {
    results.push("Set 5 content pillars");
  }

  return NextResponse.json({
    success: true,
    companyId,
    results,
  });
}
