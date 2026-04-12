import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/providers";

const WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";

/**
 * POST /api/create/voice-to-post
 *
 * Accepts either:
 *   1. Audio as FormData (field: "audio") + companyId + optional spokespersonId
 *   2. JSON body with { transcription, companyId, spokespersonId } for regeneration
 *
 * Pipeline:
 *   1. Transcribe audio via OpenAI Whisper (skipped if transcription provided)
 *   2. Generate LinkedIn post via Claude
 *
 * Returns: { postText, transcription, postType, imagePrompt }
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let transcription: string | null = null;
    let companyId: string | null = null;
    let spokespersonId: string | null = null;

    // ── Parse request ──────────────────────────────────────────

    if (contentType.includes("multipart/form-data")) {
      // Audio upload flow
      const formData = await request.formData();
      const audioFile = formData.get("audio");
      companyId = formData.get("companyId") as string | null;
      spokespersonId = formData.get("spokespersonId") as string | null;

      if (!audioFile || !(audioFile instanceof Blob)) {
        return NextResponse.json(
          { error: "No audio file provided. Send FormData with field name 'audio'." },
          { status: 400 }
        );
      }

      if (!companyId) {
        return NextResponse.json(
          { error: "companyId is required." },
          { status: 400 }
        );
      }

      // Transcribe with Whisper
      transcription = await transcribeAudio(audioFile, companyId);
    } else {
      // JSON body — regeneration with existing transcription
      const body = await request.json();
      transcription = body.transcription;
      companyId = body.companyId;
      spokespersonId = body.spokespersonId || null;

      if (!transcription) {
        return NextResponse.json(
          { error: "transcription is required for regeneration." },
          { status: 400 }
        );
      }

      if (!companyId) {
        return NextResponse.json(
          { error: "companyId is required." },
          { status: 400 }
        );
      }
    }

    // ── Generate LinkedIn post via Claude ───────────────────────

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured." },
        { status: 500 }
      );
    }

    const prompt = `You are a LinkedIn ghostwriter. A professional just recorded a voice note about their work. Turn their raw thoughts into a polished LinkedIn post that:
- Keeps their authentic voice and specific details
- Structures it with a strong opening hook (under 12 words)
- Uses short paragraphs (1-2 sentences each)
- Ends with a question to drive engagement
- Is 150-300 words
- Does NOT use hashtags in the body (add 3-5 at the very end)
- Does NOT use emojis except one in the sign-off
- Does NOT use em-dashes or en-dashes
- Does NOT use colons or hyphens in the hook/title

Here is the voice transcription:
${transcription}

Write the LinkedIn post:`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("Claude API error:", claudeRes.status, errText);
      return NextResponse.json(
        { error: `Post generation failed (${claudeRes.status})` },
        { status: 502 }
      );
    }

    const claudeData = await claudeRes.json();
    const postText =
      claudeData.content?.[0]?.text || "Unable to generate post.";

    // Auto-detect post type from content
    const postType = detectPostType(postText, transcription!);

    // Generate a simple image prompt suggestion
    const imagePrompt = generateImagePrompt(transcription!);

    return NextResponse.json({
      postText,
      transcription,
      postType,
      imagePrompt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Voice-to-post error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────

async function transcribeAudio(
  audioBlob: Blob,
  companyId: string
): Promise<string> {
  // Try to resolve API key from company provider config first
  let apiKey: string | undefined;

  try {
    const resolved = await resolveProvider(companyId, "transcription");
    if (resolved?.credentials?.api_key) {
      apiKey = resolved.credentials.api_key as string;
    }
  } catch {
    // Fall through to env key
  }

  if (!apiKey) {
    apiKey = process.env.OPENAI_API_KEY;
  }

  if (!apiKey) {
    throw new Error(
      "Transcription API not configured. Set OPENAI_API_KEY or configure a transcription provider."
    );
  }

  const whisperForm = new FormData();
  whisperForm.append("file", audioBlob, "recording.webm");
  whisperForm.append("model", "whisper-1");
  whisperForm.append("response_format", "verbose_json");

  const res = await fetch(WHISPER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: whisperForm,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Whisper API error:", res.status, errText);
    throw new Error(`Transcription failed (${res.status})`);
  }

  const data = await res.json();
  const text = data.text || "";

  if (!text.trim()) {
    throw new Error("Could not detect any speech. Please try again.");
  }

  return text;
}

function detectPostType(postText: string, transcription: string): string {
  const lower = (postText + " " + transcription).toLowerCase();

  if (
    lower.includes("mistake") ||
    lower.includes("wrong") ||
    lower.includes("stop doing")
  ) {
    return "insight";
  }
  if (lower.includes("if i was") || lower.includes("if i were")) {
    return "if_i_was";
  }
  if (
    lower.includes("unpopular opinion") ||
    lower.includes("hot take") ||
    lower.includes("controversial")
  ) {
    return "contrarian";
  }
  if (lower.includes("step 1") || lower.includes("how to") || lower.includes("here's how")) {
    return "tactical";
  }
  if (
    lower.includes("behind the scenes") ||
    lower.includes("real talk") ||
    lower.includes("honestly")
  ) {
    return "founder_friday";
  }
  if (lower.includes("launched") || lower.includes("launch") || lower.includes("shipped")) {
    return "launch_story";
  }
  if (lower.includes("update") || lower.includes("exciting news") || lower.includes("announcement")) {
    return "personal_update";
  }

  return "insight";
}

function generateImagePrompt(transcription: string): string {
  // Extract the core topic from the first sentence or two
  const sentences = transcription.split(/[.!?]+/).filter(Boolean);
  const topic = sentences.slice(0, 2).join(". ").trim();

  return `Professional, editorial-style photograph relating to: ${topic}. Clean composition, natural lighting, business context. No text on image.`;
}
