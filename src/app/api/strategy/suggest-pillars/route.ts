import { NextResponse } from "next/server";
import { requireCompanyUser } from "@/lib/supabase/admin";
import { generateText } from "@/lib/providers/content-generation/generate-text";
import { refuseHospitality } from "@/lib/hospitality/pack-guard";

// POST /api/strategy/suggest-pillars
// Body: { companyId, responses } where responses is the interview so far,
// keyed by step number ("1" company, "2" audiences, "3" positioning,
// "4" voice). Returns { pillars: [{ name, description, topics }] }, three to
// five of them, for step 5 of the strategy interview to prefill.

const FAILED = "We could not suggest pillars just now. Add your own and carry on.";

const PILLARS_SCHEMA = {
  type: "object",
  properties: {
    pillars: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          topics: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description", "topics"],
        additionalProperties: false,
      },
    },
  },
  required: ["pillars"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are a content strategist for business-to-business companies.
From the interview answers you are given, propose between 3 and 5 content pillars: the recurring themes the company should post about.
Each pillar has a short name (two to five words), a one or two sentence description of what it covers and why it matters to the audience, and three to five example topics.
Use British English. Ground every pillar in what the answers say; do not invent facts about the company.
Return only a JSON object of the form { "pillars": [{ "name": "...", "description": "...", "topics": ["..."] }] }.`;

interface Pillar {
  name: string;
  description: string;
  topics: string[];
}

function parsePillars(text: string): Pillar[] {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  const parsed = JSON.parse(cleaned) as { pillars?: unknown };
  if (!Array.isArray(parsed.pillars)) return [];
  return parsed.pillars
    .map((p) => p as Partial<Pillar>)
    .filter((p) => typeof p.name === "string" && p.name.trim() !== "")
    .slice(0, 5)
    .map((p) => ({
      name: String(p.name).trim(),
      description: typeof p.description === "string" ? p.description.trim() : "",
      topics: Array.isArray(p.topics) ? p.topics.filter((t): t is string => typeof t === "string") : [],
    }));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    companyId?: unknown;
    responses?: unknown;
  };
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refused = await refuseHospitality(profile, companyId);
  if (refused) return refused;

  const responses =
    body.responses && typeof body.responses === "object" ? (body.responses as Record<string, unknown>) : {};

  // Only the answers that shape pillars: who they are, who they help, what
  // makes them different and how they sound.
  const relevant: Record<string, unknown> = {};
  for (const key of ["1", "2", "3", "4"]) {
    if (responses[key] !== undefined) relevant[key] = responses[key];
  }

  const userPrompt = `Interview answers so far (1 = the company, 2 = who they help, 3 = what makes them different, 4 = their voice):

${JSON.stringify(relevant, null, 2)}

Suggest the content pillars.`;

  try {
    const result = await generateText({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 2000,
      companyId,
      jsonSchema: PILLARS_SCHEMA,
    });
    const pillars = parsePillars(result.text);
    if (pillars.length === 0) {
      return NextResponse.json({ error: FAILED }, { status: 502 });
    }
    return NextResponse.json({ pillars });
  } catch {
    return NextResponse.json({ error: FAILED }, { status: 502 });
  }
}
