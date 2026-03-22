import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";

/**
 * POST /api/setup/voice-analyse
 *
 * Accepts a voice transcript and uses AI to extract structured company
 * information for onboarding. Used by the Quick Strategy Setup voice tab.
 *
 * Body: { transcript: string, companyId: string }
 *
 * Returns structured analysis of the company from the transcript.
 */

const ANALYSIS_PROMPT = `You are analysing a voice recording transcript where a business owner describes their company.
Extract the following structured information from the transcript. If something is not mentioned, set it to null.
Respond ONLY with valid JSON matching this exact schema:

{
  "companyDescription": "2-3 sentence description of what the company does",
  "differentiators": ["bullet point 1", "bullet point 2", ...],
  "targetAudience": "description of who they sell to / help",
  "industry": "the industry or sector they operate in",
  "voiceCharacteristics": {
    "formality": "formal | conversational | casual",
    "technicality": "technical | mixed | plain",
    "energy": "energetic | measured | calm",
    "notes": "any other voice observations"
  },
  "suggestedTopics": ["topic 1", "topic 2", ...],
  "keyVocabulary": ["word or phrase 1", "word or phrase 2", ...],
  "companyName": "the company name if mentioned",
  "spokespersonName": "the speaker's name if mentioned",
  "website": "website URL if mentioned"
}

Be generous with suggested topics — aim for 5-10 based on what they talk about.
For key vocabulary, capture distinctive words, phrases, or jargon they naturally use.
For voice characteristics, base this on HOW they speak (sentence structure, word choice, enthusiasm level).`;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { transcript, companyId } = body;

  if (!transcript || !companyId) {
    return NextResponse.json(
      { error: "transcript and companyId are required" },
      { status: 400 }
    );
  }

  if (transcript.trim().length < 20) {
    return NextResponse.json(
      { error: "Transcript is too short to analyse. Please record a longer description." },
      { status: 400 }
    );
  }

  try {
    // Try to get the company's content generation provider (Claude/Anthropic)
    const resolved = await resolveProvider(companyId, "content_generation");
    let apiKey = (resolved?.credentials?.api_key as string) || "";
    let provider = resolved?.provider || "";

    // Determine which AI to call
    // Priority: company's configured content_generation provider, then env vars
    let aiResponse: string;

    if (provider === "anthropic_claude" && apiKey) {
      aiResponse = await callAnthropic(apiKey, transcript);
    } else if (apiKey && provider.startsWith("openai")) {
      aiResponse = await callOpenAI(apiKey, transcript);
    } else if (process.env.ANTHROPIC_API_KEY) {
      aiResponse = await callAnthropic(process.env.ANTHROPIC_API_KEY, transcript);
    } else if (process.env.OPENAI_API_KEY) {
      aiResponse = await callOpenAI(process.env.OPENAI_API_KEY, transcript);
    } else {
      return NextResponse.json(
        { error: "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    // Parse the JSON response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI did not return valid JSON");
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Voice analysis error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function callAnthropic(apiKey: string, transcript: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `${ANALYSIS_PROMPT}\n\nTRANSCRIPT:\n${transcript}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function callOpenAI(apiKey: string, transcript: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: ANALYSIS_PROMPT },
        { role: "user", content: `TRANSCRIPT:\n${transcript}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
