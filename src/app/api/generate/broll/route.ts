import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { generateText } from "@/lib/providers/content-generation/generate-text";

/**
 * POST /api/generate/broll
 *
 * Analyzes a transcript (with timestamps) and generates B-roll insertion
 * points. Uses AI to identify natural cut points where visuals would
 * enhance the talking-head video.
 *
 * Body: {
 *   companyId: string,
 *   contentPieceId: string,
 *   transcript?: string,       // Full transcript text (used if no asset exists)
 *   subtitleCues?: string,     // SRT-format subtitle cues (used if no asset exists)
 * }
 *
 * Output: Array of B-roll suggestions, each with:
 * - timestamp (start, end in seconds)
 * - type ("image" | "text_overlay" | "screen_recording" | "stock_footage")
 * - description (what to show)
 * - suggestedPrompt (DALL-E/image generation prompt)
 */

interface BrollSuggestion {
  startSeconds: number;
  endSeconds: number;
  type: "image" | "text_overlay" | "screen_recording" | "stock_footage";
  description: string;
  suggestedPrompt: string;
}

const BROLL_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          startSeconds: { type: "number" },
          endSeconds: { type: "number" },
          type: { type: "string", enum: ["image", "text_overlay", "screen_recording", "stock_footage"] },
          description: { type: "string" },
          suggestedPrompt: { type: "string" },
        },
        required: ["startSeconds", "endSeconds", "type", "description", "suggestedPrompt"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

const BROLL_ANALYSIS_PROMPT = `You are a video editor analyzing a transcript to identify B-roll insertion points.

The video is a talking-head style video for a healthcare marketing consultancy. Identify 5-8 natural cut points where B-roll visuals would enhance the video.

For each B-roll point, provide:
1. Start and end timestamp (in seconds)
2. Type: "image" (custom generated), "text_overlay" (key stat or quote), "screen_recording" (showing a process), or "stock_footage" (generic visual)
3. Description: What the visual should show
4. Suggested image prompt: A detailed prompt for generating the image (if type is "image")

Rules:
- B-roll should appear at concept transitions, not mid-sentence
- Each B-roll clip should be 3-8 seconds
- Prefer "image" and "text_overlay" types (we can generate these)
- Text overlays should highlight key statistics, frameworks, or memorable phrases
- Images should be abstract/conceptual, not literal illustrations
- Space B-roll evenly throughout the video
- First B-roll should appear 15-30 seconds in (after intro)
- Last B-roll should end at least 10 seconds before the video ends

Return ONLY valid JSON in this format:
{
  "suggestions": [
    {
      "startSeconds": 25,
      "endSeconds": 30,
      "type": "text_overlay",
      "description": "Display the statistic '12 minutes average supplier meeting time'",
      "suggestedPrompt": ""
    },
    {
      "startSeconds": 45,
      "endSeconds": 52,
      "type": "image",
      "description": "Abstract visualization of a healthcare procurement funnel",
      "suggestedPrompt": "Minimalist isometric illustration of a funnel with hospital icons flowing through stages, healthcare blue and teal color palette, clean white background, professional business style"
    }
  ]
}`;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, contentPieceId, transcript: rawTranscript, subtitleCues: rawCues } = body;

  if (!companyId || !contentPieceId) {
    return NextResponse.json(
      { error: "companyId and contentPieceId are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch the content piece
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("id", contentPieceId)
    .single();

  if (!piece) {
    return NextResponse.json({ error: "Content piece not found" }, { status: 404 });
  }

  // Try to find transcript from assets
  let transcript = rawTranscript || "";
  let subtitleCues = rawCues || "";

  if (!transcript || !subtitleCues) {
    const { data: assets } = await supabase
      .from("content_assets")
      .select("*")
      .eq("content_piece_id", contentPieceId);

    if (assets) {
      const scriptAsset = assets.find((a) => a.asset_type === "script_text");
      const subtitleAsset = assets.find((a) => a.asset_type === "subtitle_cues");

      if (!transcript && scriptAsset?.text_content) {
        transcript = scriptAsset.text_content;
      }
      if (!subtitleCues && subtitleAsset?.text_content) {
        subtitleCues = subtitleAsset.text_content;
      }
    }
  }

  // Use markdown_body as fallback transcript
  if (!transcript) {
    transcript = piece.markdown_body;
  }

  if (!transcript) {
    return NextResponse.json(
      { error: "No transcript available. Upload a video and run transcription first." },
      { status: 400 }
    );
  }

  // Build the analysis prompt
  const analysisInput = subtitleCues
    ? `## TRANSCRIPT WITH TIMESTAMPS (SRT format)\n\n${subtitleCues}\n\n## FULL TEXT\n\n${transcript}`
    : `## TRANSCRIPT (no timestamps — estimate based on word count, ~150 words/minute)\n\n${transcript}`;

  try {
    const responseText = await generateText({
      companyId,
      systemPrompt: "",
      userPrompt: `${BROLL_ANALYSIS_PROMPT}\n\n---\n\n${analysisInput}`,
      maxTokens: 2000,
      task: "classification",
      jsonSchema: BROLL_SCHEMA,
    }).then((result) => result.text).catch((err) => {
      console.error("[broll] analysis call failed:", err instanceof Error ? err.message : err);
      return null;
    });

    if (responseText === null) {
      return NextResponse.json(
        { error: "The analysis could not be completed. Try again shortly." },
        { status: 502 }
      );
    }

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("The analysis did not return valid JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const suggestions: BrollSuggestion[] = parsed.suggestions || [];

    // Store B-roll timestamps as a content asset
    const brollText = suggestions
      .map(
        (s, i) =>
          `[${i + 1}] ${formatTime(s.startSeconds)}-${formatTime(s.endSeconds)} | ${s.type} | ${s.description}${s.suggestedPrompt ? ` | Prompt: ${s.suggestedPrompt}` : ""}`
      )
      .join("\n");

    await supabase.from("content_assets").upsert(
      {
        content_piece_id: contentPieceId,
        asset_type: "broll_timestamps",
        text_content: brollText,
        asset_metadata: {
          suggestions,
          generatedAt: new Date().toISOString(),
          suggestionCount: suggestions.length,
        },
        sort_order: 5,
      },
      { onConflict: "content_piece_id,asset_type" }
    );

    return NextResponse.json({
      suggestions,
      brollText,
      count: suggestions.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "B-roll analysis failed" },
      { status: 500 }
    );
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
