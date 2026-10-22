import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/admin";
import { generateText } from "@/lib/providers/content-generation/generate-text";

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

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    companyDescription: { type: ["string", "null"] },
    differentiators: { type: "array", items: { type: "string" } },
    targetAudience: { type: ["string", "null"] },
    industry: { type: ["string", "null"] },
    voiceCharacteristics: {
      type: "object",
      properties: {
        formality: { type: ["string", "null"], enum: ["formal", "conversational", "casual", null] },
        technicality: { type: ["string", "null"], enum: ["technical", "mixed", "plain", null] },
        energy: { type: ["string", "null"], enum: ["energetic", "measured", "calm", null] },
        notes: { type: ["string", "null"] },
      },
      required: ["formality", "technicality", "energy", "notes"],
      additionalProperties: false,
    },
    suggestedTopics: { type: "array", items: { type: "string" } },
    keyVocabulary: { type: "array", items: { type: "string" } },
    companyName: { type: ["string", "null"] },
    spokespersonName: { type: ["string", "null"] },
    website: { type: ["string", "null"] },
  },
  required: ["companyDescription", "differentiators", "targetAudience", "industry", "voiceCharacteristics", "suggestedTopics", "keyVocabulary", "companyName", "spokespersonName", "website"],
  additionalProperties: false,
};

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
    const result = await generateText({
      companyId,
      systemPrompt: ANALYSIS_PROMPT,
      userPrompt: `TRANSCRIPT:\n${transcript}`,
      maxTokens: 2000,
      jsonSchema: ANALYSIS_SCHEMA,
    });
    const aiResponse = result.text;

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
