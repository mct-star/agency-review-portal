import { getPostType, type PostTypeOption } from "@/lib/constants/post-types";
import { generateText } from "@/lib/providers/content-generation/generate-text";
import { generateHospitalityPost, type GeneratedHospitalityPost } from "./generate";
import type { createHospitalityDraft, DraftInput } from "./drafts";
import { longDateLabel, weekDates, dayNameOf } from "./week";
import { buildPlanPrompt, DEFAULT_TIMES, parsePlan, shortfallNote, type PlanItem } from "./weekly-plan";
import type { VenueSettings } from "./prompts";
import type { UpcomingCandidate } from "./coming-up";
import { selectImages, type LibraryCandidate } from "@/lib/media/select-images";

/**
 * The weekly chat, end to end: a transcript in, five to seven pending drafts
 * out, each with a day, a type and a suggested library photo, landed on the
 * calendar for approval. Nothing is approved here.
 */

export interface WeekInterviewDeps {
  plan: (system: string, user: string) => Promise<string>;
  write: (postType: PostTypeOption, item: PlanItem) => Promise<GeneratedHospitalityPost>;
  candidates: () => Promise<LibraryCandidate[]>;
  draft: (input: DraftInput) => ReturnType<typeof createHospitalityDraft>;
  /** Save dated events and launches to the Coming up list. Optional: without it they are only reported. */
  saveUpcoming?: (items: UpcomingCandidate[]) => Promise<{ added: { title: string }[]; already: string[] }>;
}

export interface CreatedDraft {
  pieceId: string;
  date: string;
  dayName: string;
  typeLabel: string;
  hasPhoto: boolean;
  warnings: string[];
}

export interface WeekInterviewResult {
  created: CreatedDraft[];
  /** Plain-words notes: posts left out, a short week, a post that could not be written. */
  notes: string[];
  /** Titles added to the Coming up list from this dictation. */
  upcomingAdded: string[];
}

export async function planWeekFromTranscript(
  args: { companyId: string; venueName: string; settings: VenueSettings; weekAnyDate: string; transcript: string; today?: string },
  deps: WeekInterviewDeps,
  rng: () => number = Math.random
): Promise<WeekInterviewResult> {
  const dates = weekDates(args.weekAnyDate);
  const today = args.today ?? dates[0];
  const { system, user } = buildPlanPrompt({ venueName: args.venueName, settings: args.settings, weekDates: dates, transcript: args.transcript, today });

  let parsed;
  try {
    parsed = parsePlan(await deps.plan(system, user), dates, today);
  } catch {
    // One more go, with the shape spelled out again.
    parsed = parsePlan(await deps.plan(system, `${user}\n\nReply with the JSON object only, in exactly the shape described.`), dates, today);
  }

  const notes = [...parsed.dropped];
  const short = shortfallNote(parsed.items.length, parsed.upcoming.length);
  if (short) notes.push(short);

  // Dated things go on the Coming up list, including ones beyond this week.
  const upcomingAdded: string[] = [];
  if (deps.saveUpcoming && parsed.upcoming.length > 0) {
    try {
      const saved = await deps.saveUpcoming(parsed.upcoming);
      upcomingAdded.push(...saved.added.map((a) => a.title));
      if (upcomingAdded.length > 0) notes.push(`Added to Coming up: ${upcomingAdded.join(", ")}.`);
    } catch (err) {
      console.error("[week-interview] coming up save failed:", err);
      notes.push("The dates you mentioned could not be added to Coming up just now. Add them on the Coming up page.");
    }
  }
  notes.push(...parsed.upcomingNotes);

  const library = await deps.candidates();
  const usedPhotos: string[] = [];
  const created: CreatedDraft[] = [];

  for (const item of parsed.items) {
    const postType = getPostType(item.postType)!;
    let post: GeneratedHospitalityPost;
    try {
      post = await deps.write(postType, item);
    } catch (err) {
      // The person sees the note; the cause goes to the server log, because
      // three silent failures in the live check of 14 Oct 2026 left nothing
      // to diagnose.
      console.error(`[week-interview] write failed for ${postType.slug} on ${item.date}:`, err);
      notes.push(`The ${postType.label.toLowerCase()} for ${dayNameOf(item.date)} could not be written just now. Try that one on its own from Write a post.`);
      continue;
    }

    const q = postType.libraryQuery;
    const want = {
      place: item.place?.length ? item.place : q?.place,
      subject: item.subject?.length ? item.subject : q?.subject,
      avoidPeople: q?.avoidPeople ?? true,
    };
    // A different photo for each post in the week where the library allows it.
    let picked = selectImages(library, want, { count: 1, rng, excludeIds: usedPhotos });
    if (picked.length === 0) picked = selectImages(library, want, { count: 1, rng });
    const imageIds = picked.map((c) => c.id);
    usedPhotos.push(...imageIds);

    const draft = await deps.draft({
      companyId: args.companyId,
      postTypeSlug: item.postType,
      title: `${postType.label}, ${longDateLabel(item.date)}`,
      body: post.body,
      scheduledDate: item.date,
      scheduledTime: DEFAULT_TIMES[item.postType],
      autoSource: "weekly_interview",
      sourceMeta: { brief: item.brief, alt_text: post.altText, warnings: post.warnings, image_ids: imageIds, provider: post.provider },
      imageIds,
    });
    created.push({
      pieceId: draft.pieceId,
      date: item.date,
      dayName: dayNameOf(item.date),
      typeLabel: postType.label,
      hasPhoto: draft.imagesAttached > 0,
      warnings: post.warnings,
    });
  }

  if (created.some((c) => !c.hasPhoto)) notes.push("Some posts have no photo yet. Instagram needs one: choose it on the Waiting for you page.");
  return { created, notes, upcomingAdded };
}

/** The real writer and planner, for the route. */
export function realInterviewDeps(
  companyId: string,
  company: { name: string; industry: string | null; description: string | null; settings: VenueSettings },
  io: Pick<WeekInterviewDeps, "candidates" | "draft" | "saveUpcoming">
): WeekInterviewDeps {
  return {
    plan: async (system, user) => (await generateText({ companyId, systemPrompt: system, userPrompt: user, maxTokens: 1500, temperature: 0.2, geminiModel: "gemini-2.5-flash" })).text,
    write: (postType, item) =>
      generateHospitalityPost({
        companyId,
        company: { name: company.name, industry: company.industry, description: company.description, settings: company.settings },
        postType,
        brief: item.brief,
        dateLabel: longDateLabel(item.date),
      }),
    candidates: io.candidates,
    draft: io.draft,
    saveUpcoming: io.saveUpcoming,
  };
}
