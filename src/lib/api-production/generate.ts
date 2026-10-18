/** Creates one company-scoped draft from an anchored calendar slot or supplied brief. */
import type { ContentGenerationInput, ContentGenerationOutput } from "@/lib/providers";
import { getContentProvider } from "@/lib/providers";
import { assetRowsFor } from "@/lib/content/save-assets";
import { generateWithValidation, type ValidatedGenerationResult } from "@/lib/generation/validated-generator";
import { runPostGenerationGates, type GateResult } from "@/lib/generation/content-intelligence";
import type { CalendarSlot, ContentType } from "@/types/database";
import { loadProductionContext, isUnreadableLocalSourceReference } from "./context";
import { productionId } from "./identity";
import { renderProductionImage } from "./render";
import type { GeneratePlannedPieceArgs } from "./types";

type SourceBrief = {
  topic: string;
  date: string;
  pillar?: string | null;
  notes?: string | null;
  anchor?: string | null;
  owner?: string | null;
};

function dayName(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

function isoWeek(date: string): { week: number; year: number; start: string; end: string } {
  const value = new Date(`${date}T00:00:00Z`);
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - weekday);
  const year = value.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((value.getTime() - first.getTime()) / 86400000) + 1) / 7);
  const monday = new Date(`${date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { week, year, start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

function sourceFrom(slot: CalendarSlot | undefined, job: GeneratePlannedPieceArgs["job"]): SourceBrief {
  if (slot) {
    if (slot.anchor_pending) throw new Error("This calendar slot is waiting for its source. Add a readable source before writing it.");
    const anchor = slot.source_anchor?.trim();
    if (!anchor) throw new Error("This calendar slot has no source anchor. Add a source before writing it.");
    if (isUnreadableLocalSourceReference(anchor)) throw new Error("The calendar slot points to a local source file that this hosted writer cannot read. Add the source text or a usable source anchor.");
    return { topic: slot.topic, date: slot.slot_date, pillar: slot.pillar, notes: slot.notes, anchor, owner: slot.source_owner };
  }
  const brief = job.input_payload.direct;
  if (!brief?.topic?.trim() || !brief.post_type_slug || !brief.post_date) throw new Error("The direct production brief is incomplete.");
  if (brief.notes && isUnreadableLocalSourceReference(brief.notes)) throw new Error("The direct brief points to a local source file that this hosted writer cannot read. Supply the source text or a usable source reference.");
  return { topic: brief.topic.trim(), date: brief.post_date, pillar: brief.pillar, notes: brief.notes, owner: "supplied brief" };
}

async function ensureWeek(db: GeneratePlannedPieceArgs["db"], companyId: string, slot: CalendarSlot | undefined, job: GeneratePlannedPieceArgs["job"], date: string, assertOwnership: () => Promise<void>): Promise<string> {
  const requestedId = slot?.week_id || (job.input_payload.kind === "week" ? job.week_id : null);
  if (requestedId) {
    const { data, error } = await db.from("weeks").select("id").eq("id", requestedId).eq("company_id", companyId).maybeSingle();
    if (error) throw new Error("Could not verify the production week for this company.");
    if (!data?.id) throw new Error("The production week was not found for this company.");
    return data.id;
  }
  const iso = slot ? { week: slot.week_number, year: slot.year, start: slot.week_start_date, end: (() => { const end = new Date(`${slot.week_start_date}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 6); return end.toISOString().slice(0, 10); })() } : isoWeek(date);
  const { data: found, error: findError } = await db.from("weeks").select("id").eq("company_id", companyId).eq("week_number", iso.week).eq("year", iso.year).maybeSingle();
  if (findError) throw new Error("Could not find the production week for this company.");
  if (found?.id) return found.id;
  const id = productionId(companyId, "api-production-week", String(iso.year), String(iso.week));
  await assertOwnership();
  const { data: created, error } = await db.from("weeks").insert({
    id, company_id: companyId, week_number: iso.week, year: iso.year,
    date_start: iso.start, date_end: iso.end, status: "draft",
  }).select("id").maybeSingle();
  if (created?.id) return created.id;
  if (error?.code === "23505") {
    const { data: raced } = await db.from("weeks").select("id").eq("company_id", companyId).eq("week_number", iso.week).eq("year", iso.year).maybeSingle();
    if (raced?.id) return raced.id;
  }
  throw new Error("Could not create the production week for this company.");
}

function providerContentType(type: string): ContentGenerationInput["contentType"] {
  if (type === "meme") return "social_post";
  if (type === "video") return "video_script";
  return type as ContentGenerationInput["contentType"];
}

function databaseContentType(type: string, medium: string): ContentType {
  if (medium === "video") return "video_script";
  return type as ContentType;
}

function withTypeAssets(output: ContentGenerationOutput, isVideo: boolean): ContentGenerationOutput {
  if (!isVideo || output.assets.some((asset) => asset.assetType === "script_text")) return output;
  return { ...output, assets: [...output.assets, { assetType: "script_text", textContent: output.markdownBody }] };
}

interface GenerationCheckpoint {
  job_id: string;
  company_id: string;
  piece_id: string;
  slot_id: string | null;
  output: ContentGenerationOutput;
}
type PersistableGenerationOutput = ContentGenerationOutput & {
  generationQuality?: { validation: ValidatedGenerationResult["validation"]; gates: GateResult[] };
};

function readCheckpoint(job: GeneratePlannedPieceArgs["job"], pieceId: string): GenerationCheckpoint | null {
  const candidate = job.output_payload?.generation_checkpoint as GenerationCheckpoint | undefined;
  if (!candidate || candidate.job_id !== job.id || candidate.company_id !== job.company_id || candidate.piece_id !== pieceId || candidate.slot_id !== (job.input_payload.slot_id || null)) return null;
  if (!candidate.output?.title || !candidate.output?.markdownBody || !Array.isArray(candidate.output.assets)) return null;
  return candidate;
}

async function saveCheckpoint(db: GeneratePlannedPieceArgs["db"], job: GeneratePlannedPieceArgs["job"], workerId: string, pieceId: string, output: ContentGenerationOutput, assertOwnership: () => Promise<void>): Promise<void> {
  await assertOwnership();
  const checkpoint: GenerationCheckpoint = {
    job_id: job.id, company_id: job.company_id, piece_id: pieceId,
    slot_id: job.input_payload.slot_id || null, output,
  };
  const { data, error } = await db.from("content_generation_jobs").update({
    output_payload: { ...(job.output_payload || {}), generation_checkpoint: checkpoint },
  }).eq("id", job.id).eq("company_id", job.company_id).eq("provider", "api_engine").eq("job_type", "content_generation")
    .eq("worker_id", workerId).eq("status", "running").gt("lease_expires_at", new Date().toISOString()).select("id").maybeSingle();
  if (error || !data?.id) throw new Error("Could not save the API generation checkpoint. Please retry before writing the content draft.");
}

async function saveGeneratedAssets(db: GeneratePlannedPieceArgs["db"], companyId: string, pieceId: string, output: PersistableGenerationOutput, assertOwnership: () => Promise<void>): Promise<void> {
  const rows = assetRowsFor(pieceId, output.assets, output.imagePrompt);
  const provenance = output.writer ? {
    content_piece_id: pieceId,
    asset_type: "custom",
    text_content: JSON.stringify({ provider: output.writer.provider, model: output.writer.model }),
    asset_metadata: { original_type: "api_generation_provenance", provider: output.writer.provider, model: output.writer.model },
    sort_order: rows.length,
  } : null;
  const quality = output.generationQuality ? {
    content_piece_id: pieceId,
    asset_type: "custom",
    text_content: JSON.stringify({ validationPassed: output.generationQuality.validation.allPassed, gatesPassed: output.generationQuality.gates.every(gate => gate.passed) }),
    asset_metadata: { original_type: "api_generation_quality", validation: output.generationQuality.validation, gates: output.generationQuality.gates },
    sort_order: rows.length + (provenance ? 1 : 0),
  } : null;
  const assetRows = [...rows, ...(provenance ? [provenance] : []), ...(quality ? [quality] : [])].map((row, index) => ({
    id: productionId(companyId, pieceId, "asset", String(index), row.asset_type),
    ...row,
  }));
  if (!assetRows.length) return;
  await assertOwnership();
  const { error } = await db.from("content_assets").upsert(assetRows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error("The content draft was saved, but its assets could not be recorded. Retry to resume from the saved generation.");
}

function qualityWarnings(validation: ValidatedGenerationResult["validation"], gates: GateResult[], gateWarning?: string): string[] {
  const warnings = validation.allResults.filter(result => !result.passed).map(result => `Quality check: ${result.testName}: ${result.message}`);
  warnings.push(...gates.filter(gate => !gate.passed).map(gate => `Quality gate: ${gate.gate}: ${gate.explanation}`));
  if (gateWarning) warnings.push(gateWarning);
  return warnings;
}

function contextualInstructions(source: SourceBrief, extra: string | null | undefined, imageType: string): string {
  const lines = [
    `PLANNED SOURCE: ${source.anchor || source.topic}`,
    source.owner ? `SOURCE OWNER: ${source.owner}` : "",
    `SOURCE NOTES: ${source.notes?.trim() || "None supplied."}`,
    extra?.trim() ? `ADDITIONAL BRIEF: ${extra.trim()}` : "",
  ].filter(Boolean);
  if (imageType === "meme") lines.push(`IMAGE ASSET: return a valid JSON content asset called image_copy with {"title":"short setup or punchline","subtitle":"optional line"}; the combined on-image copy must stay under 20 words. Do not put unsupported facts in the graphic.`);
  if (imageType === "mini_infographic") lines.push(`IMAGE ASSET: return a valid JSON content asset called image_copy with {"title":"short heading","points":["point one","point two"]}; use 2 to 5 short points grounded only in the supplied source.`);
  if (imageType === "video") lines.push("VIDEO LIMITATION: write the script and storyboard only. Do not claim a rendered video exists. Include a truthful script_text asset.");
  return lines.join("\n\n");
}

/** Generates only pending content. Stable ids make retries reuse, never replace, editor-owned work. */
export async function generatePlannedPiece({ db, job, workerId, slot, assertOwnership }: GeneratePlannedPieceArgs): Promise<{ pieceId: string; imageUrl?: string; warnings: string[] }> {
  if (!workerId) throw new Error("The API production worker has no lease identity.");
  const companyId = job.company_id;
  const source = sourceFrom(slot, job);
  const slug = slot?.post_type_slug || job.input_payload.direct?.post_type_slug;
  if (!slug) throw new Error("Choose a supported business content format for this production job.");
  const context = await loadProductionContext(db, companyId, slug);
  const postType = context.postType;
  if (!context.input.sourceContext?.trim() && !source.notes?.trim()) {
    throw new Error("There is no readable source context for this post. Add company source context or source notes before writing; a reference alone is not enough.");
  }
  const pieceId = productionId(companyId, "api-production-piece", slot?.id || job.id);
  const warnings: string[] = [];
  const checkpoint = readCheckpoint(job, pieceId);

  const { data: existing, error: existingError } = await db.from("content_pieces").select("id, company_id, approval_status, title, markdown_body, cover_image_url, generation_job_id").eq("id", pieceId).eq("company_id", companyId).maybeSingle();
  if (existingError) throw new Error("Could not check existing production output for this company.");
  if (existing) {
    if (["approved", "changes_requested"].includes(existing.approval_status)) {
      const approvedImage = existing.cover_image_url || undefined;
      return { pieceId: existing.id, ...(approvedImage ? { imageUrl: approvedImage } : {}), warnings: ["Existing content was preserved without replacing editorial work."] };
    }
    const checkpointMatchesPiece = checkpoint && existing.approval_status === "pending"
      && existing.generation_job_id === job.id && existing.title === checkpoint.output.title
      && existing.markdown_body === checkpoint.output.markdownBody;
    if (checkpointMatchesPiece) {
      await saveGeneratedAssets(db, companyId, existing.id, checkpoint.output, assertOwnership);
      let imageUrl = existing.cover_image_url || undefined;
      if (!imageUrl && (postType.slug === "meme" || postType.slug === "mini_infographic")) {
        imageUrl = await renderProductionImage({ db, company: context.company, pieceId: existing.id, postTypeSlug: postType.slug, output: checkpoint.output, assertOwnership });
      }
      return { pieceId: existing.id, ...(imageUrl ? { imageUrl } : {}), warnings: ["Existing generated content was resumed without another provider call."] };
    }
    if (existing.title || existing.markdown_body) {
      return { pieceId: existing.id, ...(existing.cover_image_url ? { imageUrl: existing.cover_image_url } : {}), warnings: ["Existing content was preserved without replacing editorial work."] };
    }
  }

  let output: PersistableGenerationOutput | undefined = checkpoint?.output as PersistableGenerationOutput | undefined;
  let validation: ValidatedGenerationResult["validation"] | undefined;
  let gates: GateResult[] = [];
  if (!output) {
    const input: ContentGenerationInput = {
      ...context.input,
      preGenerationContext: [context.input.preGenerationContext, `STRATEGY INTERVIEW CONTEXT:\n${context.strategyContext}`].filter(Boolean).join("\n\n"),
      topicTitle: source.topic,
      topicDescription: source.notes || source.anchor || null,
      pillar: source.pillar || null,
      audienceTheme: slot?.theme || null,
      contentType: providerContentType(postType.contentType),
      weekNumber: slot?.week_number ?? isoWeek(source.date).week,
      spokespersonName: context.company.spokesperson_name,
      postTypeSlug: postType.slug,
      postTypeLabel: postType.label,
      imageArchetype: postType.archetype,
      dayOfWeek: new Date(`${source.date}T00:00:00Z`).getUTCDay(),
      scheduledTime: undefined,
      slotLabel: postType.label,
      additionalContext: contextualInstructions(source, job.input_payload.direct?.notes, postType.medium === "video" ? "video" : postType.slug),
    };
    const { provider } = await getContentProvider(companyId);
    await assertOwnership();
    let providerAttempts = 1;
    const generated = await generateWithValidation(provider, input, {
      fix: async (_previous, fixInstructions) => {
        if (providerAttempts >= 2) throw new Error("The API writer has reached its two-generation limit.");
        providerAttempts += 1;
        return provider.generate({ ...input, additionalContext: [input.additionalContext, fixInstructions].filter(Boolean).join("\n\n") });
      },
    });
    output = withTypeAssets(generated.output, postType.medium === "video");
    validation = generated.validation;
    try {
      gates = await runPostGenerationGates({
        postTypeSlug: postType.slug, content: output.markdownBody,
        hookLine: output.markdownBody.trim().split("\n")[0] || "", companyId,
        weekNumber: slot?.week_number ?? isoWeek(source.date).week,
        isHealthcareCompany: /health|medical|medtech/i.test(context.company.industry || ""),
        contentType: providerContentType(postType.contentType), signoffText: context.input.signoffText,
        firstComment: output.firstComment, title: output.title,
        wordCountMin: context.input.wordCountMin, wordCountMax: context.input.wordCountMax,
      });
    } catch {
      warnings.push("The content intelligence gates could not complete. Review the draft before approval.");
      gates = [{ gate: "quality_test_suite", passed: false, severity: "high", explanation: "Automated content checks could not complete. Review the draft before approval.", fixInstruction: "Review the draft before approval." }];
    }
    gates = gates.map(gate => /could not be evaluated|evaluation skipped/i.test(gate.explanation)
      ? { ...gate, passed: false, explanation: "This automated check could not complete. Review the draft before approval.", fixInstruction: "Review the draft before approval." }
      : gate);
    const validationWarnings = validation ? qualityWarnings(validation, gates) : [];
    if (validationWarnings.length) warnings.push(...validationWarnings);
    if (validation) output = { ...output, warnings: [...(output.warnings || []), ...validationWarnings], generationQuality: { validation, gates } };
  }
  if (!output || !output.markdownBody?.trim() || !output.title?.trim()) throw new Error("The writing provider returned no usable title or body.");
  const writer = output.writer;
  if (writer) warnings.push(`Written with ${writer.provider} (${writer.model}).`);
  else warnings.push("The writing provider did not return its model identity.");
  if (postType.medium === "video") warnings.push("This output is a video script and production brief. A rendered video has not been created.");

  if (!checkpoint) await saveCheckpoint(db, job, workerId, pieceId, output, assertOwnership);
  const weekId = await ensureWeek(db, companyId, slot, job, source.date, assertOwnership);
  await assertOwnership();
  const piece = {
    id: pieceId, week_id: weekId, company_id: companyId,
    content_type: databaseContentType(postType.contentType, postType.medium),
    title: output.title, day_of_week: dayName(source.date), scheduled_time: null,
    markdown_body: output.markdownBody, first_comment: output.firstComment,
    pillar: source.pillar || null, audience_theme: slot?.theme || null,
    topic_bank_ref: slot?.source_anchor ? `SOURCE: ${slot.source_anchor}` : null,
    word_count: output.wordCount, post_type: postType.slug, sort_order: 0,
    approval_status: "pending", generation_job_id: job.id,
    image_generation_status: postType.slug === "meme" || postType.slug === "mini_infographic" ? "pending" : "skipped",
  };
  const { data: inserted, error: insertError } = await db.from("content_pieces").insert(piece).select("id").maybeSingle();
  if (insertError?.code === "23505") {
    const { data: raced } = await db.from("content_pieces").select("id, company_id, approval_status, title, markdown_body, cover_image_url").eq("id", pieceId).eq("company_id", companyId).maybeSingle();
    if (raced?.id) return { pieceId: raced.id, ...(raced.cover_image_url ? { imageUrl: raced.cover_image_url } : {}), warnings: ["A previous attempt already saved this content. It was preserved."] };
  }
  if (insertError || !inserted?.id) throw new Error("Could not save the generated content draft.");

  await saveGeneratedAssets(db, companyId, pieceId, output, assertOwnership);

  let imageUrl: string | undefined;
  if (postType.slug === "meme" || postType.slug === "mini_infographic") {
    imageUrl = await renderProductionImage({ db, company: context.company, pieceId, postTypeSlug: postType.slug, output, assertOwnership });
  }
  return { pieceId, ...(imageUrl ? { imageUrl } : {}), warnings: [...warnings, ...(output.warnings || [])] };
}
