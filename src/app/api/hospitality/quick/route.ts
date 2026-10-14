import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { getPostType, isPostTypeInPack } from "@/lib/constants/post-types";
import { generateHospitalityPost } from "@/lib/hospitality/generate";
import { readSettings } from "@/lib/hospitality/prompts";
import { createHospitalityDraft } from "@/lib/hospitality/drafts";
import { selectImages, type LibraryCandidate } from "@/lib/media/select-images";
import { longDateLabel, todayIn } from "@/lib/hospitality/week";
import { defaultPostSlot } from "@/lib/hospitality/slot";
import { getEffectivePlan } from "@/lib/utils/get-effective-plan";
import { checkPostLimit } from "@/lib/utils/plan-limits";

export const maxDuration = 60;

/**
 * POST /api/hospitality/quick  { companyId, postTypeSlug, brief, imageId?, date?, time? }
 *
 * One hospitality post: written for Facebook and Instagram from the person's
 * own brief, a real photo chosen from the library (or the one they picked),
 * saved as a draft waiting for their approval. Nothing is published.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const access = await authoriseCompany(body.companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const slug = typeof body.postTypeSlug === "string" ? body.postTypeSlug : "";
  const postType = getPostType(slug);
  const brief = typeof body.brief === "string" ? body.brief.slice(0, 2000) : "";
  if (!postType) return NextResponse.json({ error: "Choose what kind of post this is" }, { status: 400 });
  if (slug === "weather_of_the_day") {
    return NextResponse.json({ error: "The weather post is drafted for you each day. Turn it on in settings." }, { status: 400 });
  }
  if (!brief.trim()) return NextResponse.json({ error: "Tell us what to say first" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, industry, description, plan, trial_plan, trial_expires_at, post_pack, hospitality_settings, timezone")
    .eq("id", body.companyId)
    .maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  if (!isPostTypeInPack(slug, company.post_pack)) {
    return NextResponse.json({ error: "That post type is not part of this company's pack" }, { status: 400 });
  }

  const plan = getEffectivePlan(company as Parameters<typeof getEffectivePlan>[0]);
  const limit = await checkPostLimit(supabase, company.id as string, plan);
  if (!limit.allowed) {
    return NextResponse.json({ error: `You have used all ${limit.limit} posts for this month on your plan.`, code: "limit_reached" }, { status: 402 });
  }

  const tz = (company.timezone as string | null) || "Europe/London";
  const today = todayIn(tz);
  // The next sensible slot, not 12:00 today when it is already afternoon.
  const slot = defaultPostSlot(tz);
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : slot.date;
  const time = typeof body.time === "string" && /^\d{2}:\d{2}$/.test(body.time) ? body.time : slot.time;

  let post;
  try {
    post = await generateHospitalityPost({
      company: { name: company.name as string, industry: company.industry as string | null, description: company.description as string | null, settings: readSettings(company.hospitality_settings) },
      postType,
      brief,
      dateLabel: longDateLabel(today),
    });
  } catch (err) {
    console.error("[hospitality/quick] generation failed:", err);
    return NextResponse.json({ error: "We could not write the post just now. Please try again." }, { status: 502 });
  }

  // The photo: the one the person picked, else the best match in the library.
  let imageIds: string[] = [];
  if (typeof body.imageId === "string") {
    imageIds = [body.imageId];
  } else if (postType.libraryQuery) {
    const { data: rows } = await supabase
      .from("photo_inventory")
      .select("id, kind, tags, people_present, last_used_at, used_in_weeks, status")
      .eq("company_id", company.id)
      .eq("status", "approved")
      .eq("kind", "photo")
      .limit(1000);
    const q = postType.libraryQuery;
    imageIds = selectImages((rows || []) as LibraryCandidate[], { place: q.place, subject: q.subject, avoidPeople: q.avoidPeople }, { count: 1 }).map((c) => c.id);
  }

  let draft;
  try {
    draft = await createHospitalityDraft(supabase, {
      companyId: company.id as string,
      postTypeSlug: slug,
      title: postType.label,
      body: post.body,
      scheduledDate: date,
      scheduledTime: time,
      autoSource: "quick_post",
      sourceMeta: { brief, alt_text: post.altText, provider: post.provider, warnings: post.warnings },
      imageIds,
    });
  } catch (err) {
    console.error("[hospitality/quick] draft save failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The post was written but could not be saved. Please try again." }, { status: 502 });
  }

  const { data: images } = await supabase.from("content_images").select("public_url").eq("content_piece_id", draft.pieceId).order("sort_order");
  return NextResponse.json({
    pieceId: draft.pieceId,
    date,
    time,
    body: post.body,
    warnings: post.warnings,
    imageUrls: (images || []).map((i) => i.public_url),
    imageNote: imageIds.length === 0 ? "No photo in the library suited this post. Choose one from the library." : draft.imageError ?? null,
  });
}
