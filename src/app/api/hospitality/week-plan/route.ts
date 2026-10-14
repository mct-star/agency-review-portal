import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { transcribeAudio } from "@/lib/providers/transcription/transcribe";
import { createHospitalityDraft } from "@/lib/hospitality/drafts";
import { planWeekFromTranscript, realInterviewDeps } from "@/lib/hospitality/week-interview";
import { readSettings } from "@/lib/hospitality/prompts";
import { addDays, mondayOf, todayIn } from "@/lib/hospitality/week";
import { getEffectivePlan } from "@/lib/utils/get-effective-plan";
import { checkPostLimit } from "@/lib/utils/plan-limits";
import type { LibraryCandidate } from "@/lib/media/select-images";

export const maxDuration = 120;

/**
 * POST /api/hospitality/week-plan
 *
 * One dictation about the week becomes five to seven drafts on the calendar.
 * Accepts either multipart (audio, companyId, week) or JSON
 * ({ transcript, companyId, week }). `week` is "this" or "next" (default next).
 * Every draft is pending: nothing is approved, exported or published.
 *
 * Returns { transcript, created: [...], notes: [...] }.
 */
export async function POST(request: Request) {
  const type = request.headers.get("content-type") || "";
  let companyId: unknown;
  let weekChoice: unknown;
  let transcript = "";
  let audio: Blob | null = null;

  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    companyId = form.get("companyId");
    weekChoice = form.get("week");
    const a = form.get("audio");
    audio = a instanceof Blob ? a : null;
    transcript = typeof form.get("transcript") === "string" ? (form.get("transcript") as string) : "";
  } else {
    const body = await request.json().catch(() => ({}));
    companyId = body.companyId;
    weekChoice = body.week;
    transcript = typeof body.transcript === "string" ? body.transcript : "";
  }

  const access = await authoriseCompany(companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const cid = companyId as string;

  const supabase = await createAdminSupabaseClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, industry, description, plan, trial_plan, trial_expires_at, post_pack, hospitality_settings, timezone")
    .eq("id", cid)
    .maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  if (company.post_pack !== "hospitality") {
    return NextResponse.json({ error: "The weekly chat is part of the hospitality pack." }, { status: 400 });
  }

  const limit = await checkPostLimit(supabase, cid, getEffectivePlan(company as Parameters<typeof getEffectivePlan>[0]));
  if (!limit.allowed) {
    return NextResponse.json({ error: `You have used all ${limit.limit} posts for this month on your plan.`, code: "limit_reached" }, { status: 402 });
  }

  if (audio) {
    if (audio.size > 4_000_000) return NextResponse.json({ error: "That recording is too long. Keep it to about five minutes." }, { status: 413 });
    try {
      transcript = (await transcribeAudio(Buffer.from(await audio.arrayBuffer()), audio.type || "audio/webm", cid)).text;
    } catch (err) {
      console.error("[week-plan] transcription failed:", err);
      return NextResponse.json({ error: "We could not make out the recording. Try again, or type it instead." }, { status: 502 });
    }
  }
  transcript = transcript.trim().slice(0, 8000);
  if (transcript.length < 20) return NextResponse.json({ error: "Tell us what is happening this week first." }, { status: 400 });

  const today = todayIn((company.timezone as string | null) || "Europe/London");
  const weekAnyDate = weekChoice === "this" ? today : addDays(mondayOf(today), 7);

  const settings = readSettings(company.hospitality_settings);
  try {
    const result = await planWeekFromTranscript(
      { companyId: cid, venueName: company.name as string, settings, weekAnyDate, transcript },
      realInterviewDeps(
        { name: company.name as string, industry: company.industry as string | null, description: company.description as string | null, settings },
        {
          candidates: async () => {
            const { data } = await supabase
              .from("photo_inventory")
              .select("id, kind, tags, people_present, last_used_at, used_in_weeks, status")
              .eq("company_id", cid)
              .eq("status", "approved")
              .eq("kind", "photo")
              .limit(2000);
            return (data || []) as LibraryCandidate[];
          },
          draft: (input) => createHospitalityDraft(supabase, input),
        }
      )
    );
    return NextResponse.json({ transcript, weekStart: mondayOf(weekAnyDate), ...result });
  } catch (err) {
    console.error("[week-plan] failed:", err);
    return NextResponse.json({ error: "We could not plan the week just now. Please try again." }, { status: 502 });
  }
}
