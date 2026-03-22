/**
 * Content Intelligence Layer
 *
 * Two core functions:
 * 1. buildPreGenerationContext() — Injects day-specific rules, hook tension
 *    requirements, healthcare specificity, anti-AI writing rules, and writing
 *    samples BEFORE content generation.
 * 2. runPostGenerationGates() — Evaluates generated content against quality
 *    gates (some programmatic, some Claude-evaluated) and returns pass/fail
 *    results with fix instructions.
 *
 * This is the layer that makes content genuinely brilliant rather than
 * generically acceptable.
 */

import { resolveProvider } from "@/lib/providers";

// ════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════

export interface GateResult {
  gate: string;
  passed: boolean;
  severity: "critical" | "high" | "medium";
  explanation: string;
  fixInstruction: string;
}

export interface GateOptions {
  postTypeSlug: string;
  content: string;
  hookLine: string;
  companyId: string;
  weekNumber?: number;
  isHealthcareCompany?: boolean;
  contentType?: string;
  signoffText?: string;
  firstComment?: string | null;
  title?: string;
  wordCountMin?: number;
  wordCountMax?: number;
}

export interface PreGenerationOptions {
  postTypeSlug: string;
  weekNumber?: number;
  isHealthcareCompany?: boolean;
  voiceProfile?: {
    structured_voice?: {
      writing_samples?: { label?: string; post_type?: string; text: string }[];
    } | null;
  } | null;
}

// ════════════════════════════════════════════════════════════
// A. Day-Specific Rules
// ════════════════════════════════════════════════════════════

const DAY_SPECIFIC_RULES: Record<string, string> = {
  insight: `DAY-SPECIFIC RULE (Monday Problem Diagnosis):
You DIAGNOSE problems. You NEVER prescribe solutions. Name the pain so the reader feels understood. The post should make them think "that's exactly what happens to us." End at the shift. The direction, not the destination.`,

  launch_story: `DAY-SPECIFIC RULE (Tuesday Experience Story):
Tell a SPECIFIC story from a real product launch. Show PATTERN RECOGNITION ("I've seen this in X other launches..."). First person, reflective not preachy. Include a vulnerability moment ("We got this wrong...").`,

  if_i_was: `DAY-SPECIFIC RULE (Wednesday Expert Perspective):
LANE CHECK CRITICAL: Every piece of advice MUST be about marketing/demand generation. NOT sales advice, NOT clinical advice, NOT operational advice. If the advice could be given by a sales trainer, it's OUT OF LANE. Frame as "If I was [role], here's what I'd do from a marketing perspective."`,

  contrarian: `DAY-SPECIFIC RULE (Thursday Contrarian Take — odd weeks):
Challenge a widely-held assumption with EVIDENCE. Do not soften too quickly. Let the discomfort land before offering the reframe. The reader should feel uncomfortable about their own practices.`,

  tactical: `DAY-SPECIFIC RULE (Thursday Tactical How-To — even weeks):
Provide CONCRETE, IMMEDIATELY USABLE steps. Not Googleable advice. Each point should be specific enough that the reader can do it tomorrow. If a point starts with "Consider..." or "Think about...", it is too vague.`,

  founder_friday: `DAY-SPECIFIC RULE (Friday Personal Reflection):
THEME CHECK: Fantasy vs Reality. Show the messy human side of building a business. CRITICAL: vulnerability is the SETUP, resolution is what makes it worth reading. Reader must finish feeling "I'm glad I read that", NOT "that was depressing." NEVER sadness-only. NEVER about dogs/hobbies. NEVER "founder life is better than employed life."`,

  blog_teaser: `DAY-SPECIFIC RULE (Sunday Blog Teaser):
Make the ARGUMENT land in miniature. You are NOT announcing a blog post ("New blog out!"). You are creating enough tension that they want the full version. Bridge must be SPECIFIC ("three questions I ask before...") not vague ("I go deeper").`,

  personal: `DAY-SPECIFIC RULE (Saturday Personal):
MUST be local to Bristol, current/timely (not evergreen), cultural. Could NOT be posted from anywhere else.`,

  saturday: `DAY-SPECIFIC RULE (Saturday Personal):
MUST be local to Bristol, current/timely (not evergreen), cultural. Could NOT be posted from anywhere else.`,
};

// ════════════════════════════════════════════════════════════
// B. Hook Tension Requirements
// ════════════════════════════════════════════════════════════

const HOOK_TENSION_RULES = `HOOK TENSION REQUIREMENTS (MANDATORY):
Your opening line (hook) must create one of these four types of tension:
1. ACCUSATION - points at a problem the reader is complicit in
2. REVELATION - reveals something the reader did not know
3. CONFRONTATION - challenges what the reader believes
4. CONTRADICTION - presents two things that should not be true together

INVALID hooks (these will be rejected):
- ADVICE hooks ("Here's what I've learned about...")
- INSTRUCTION hooks ("3 ways to improve your...")
- SUGGESTION hooks ("You should consider...")
- QUESTION-AS-HOOK ("Have you ever wondered...?")

The hook must be ONE sentence, fully visible above LinkedIn's "...see more" fold.`;

// ════════════════════════════════════════════════════════════
// C. Healthcare Specificity
// ════════════════════════════════════════════════════════════

const HEALTHCARE_SPECIFICITY_RULES = `HEALTHCARE SPECIFICITY (C4 Gate — MANDATORY):
Every business post must be UNMISTAKABLY healthcare. Apply the "Could Be Any Industry" test: if you replaced "healthcare" with "SaaS" and the post still made sense, it FAILS.

Include SPECIFIC healthcare elements:
- Job titles: procurement lead, clinical champion, NICE committee member, medical affairs director, market access team, KOL, formulary decision-maker
- Scenarios: 12-minute supplier meetings, formulary submissions, clinical evaluation committees, NICE technology appraisals, hospital buying cycles, multi-stakeholder procurement
- Challenges: compliance review cycles (6-18 months), clinical evidence requirements, NHS budget year timing, ABPI code constraints, patient pathway mapping

Generic B2B terms ALONE do not satisfy (pipeline, stakeholder, ROI, value proposition). These must be accompanied by healthcare-specific context.`;

// ════════════════════════════════════════════════════════════
// D. Anti-AI Writing Rules
// ════════════════════════════════════════════════════════════

const ANTI_AI_RULES = `ANTI-AI WRITING RULES (patterns that signal AI-generated content — ALL BANNED):
- Unicode bold text — NEVER use Unicode formatting tricks
- Emoji as bullet points — emoji is decoration, not structure
- Stacked tricolons: "commitment, creativity, and determination" — maximum ONE tricolon per post
- Gushing openers: "Words cannot fully express...", "Absolutely delighted...", "Thrilled to announce..."
- Empty closers: "excited for what comes next", "watch this space", "the future is bright"
- Em-dash emphasis: "not just because of X — but because of Y" — use full stops instead
- Hashtag stacking: maximum 3 hashtags, ONLY at the end, NEVER #ProudMoment
- Self-congratulatory framing: "We were absolutely delighted to be awarded..." — show do not tell
- Wall-of-text paragraphs: every paragraph max 2 lines on mobile
- Name-dropping lists: tagging 8+ people adds nothing for the reader`;

// ════════════════════════════════════════════════════════════
// Pre-Generation Context Builder
// ════════════════════════════════════════════════════════════

/**
 * Returns additional prompt text to inject BEFORE Claude generates content.
 * This supplements (not replaces) the existing prompt structure.
 */
export function buildPreGenerationContext(options: PreGenerationOptions): string {
  const sections: string[] = [];

  // A. Day-specific rules
  const dayRule = DAY_SPECIFIC_RULES[options.postTypeSlug];
  if (dayRule) {
    sections.push(dayRule);
  }

  // Handle Thursday odd/even
  if (options.postTypeSlug === "contrarian" || options.postTypeSlug === "tactical") {
    if (options.weekNumber !== undefined) {
      const isOdd = options.weekNumber % 2 !== 0;
      if (options.postTypeSlug === "contrarian" && !isOdd) {
        // This is an even week but contrarian was selected — still use its rules
      } else if (options.postTypeSlug === "tactical" && isOdd) {
        // This is an odd week but tactical was selected — still use its rules
      }
    }
  }

  // B. Hook tension (for all social posts)
  sections.push(HOOK_TENSION_RULES);

  // C. Healthcare specificity (for healthcare companies or default)
  if (options.isHealthcareCompany !== false) {
    sections.push(HEALTHCARE_SPECIFICITY_RULES);
  }

  // D. Anti-AI writing rules (always)
  sections.push(ANTI_AI_RULES);

  // E. Writing samples injection
  const writingSamples = options.voiceProfile?.structured_voice?.writing_samples;
  if (writingSamples && writingSamples.length > 0) {
    const samplesText = writingSamples
      .map((s) => s.text)
      .join("\n\n---\n\n");
    sections.push(`MATCH THIS VOICE — these are real examples of how this person writes:
${samplesText}
Your output must be INDISTINGUISHABLE from these samples.`);
  }

  return sections.join("\n\n");
}

// ════════════════════════════════════════════════════════════
// Claude Haiku Evaluator (for gates 1, 2, 3, 6)
// ════════════════════════════════════════════════════════════

const HAIKU_MODEL = "claude-haiku-4-20250514";
const API_URL = "https://api.anthropic.com/v1/messages";

async function callClaudeHaiku(
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Haiku API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((c: { type: string }) => c.type === "text");
  if (!textBlock) throw new Error("No text in Haiku response");
  return textBlock.text;
}

async function getApiKey(companyId: string): Promise<string | null> {
  try {
    const resolved = await resolveProvider(companyId, "content_generation");
    return (resolved?.credentials?.api_key as string) || null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// Post-Generation Quality Gates
// ════════════════════════════════════════════════════════════

/**
 * Gate 1: Day/Lane/Theme Check (CRITICAL)
 * Uses Claude Haiku to evaluate whether the post follows its day-specific rules.
 */
async function runGate1DayLaneTheme(
  content: string,
  postTypeSlug: string,
  apiKey: string
): Promise<GateResult> {
  const gate: GateResult = {
    gate: "day_lane_theme",
    passed: true,
    severity: "critical",
    explanation: "",
    fixInstruction: "",
  };

  let evaluationPrompt = "";

  switch (postTypeSlug) {
    case "insight":
      evaluationPrompt = `Evaluate this LinkedIn post. It is supposed to DIAGNOSE a problem without prescribing solutions.

Does the post:
1. Identify and name a specific pain point the reader would recognise?
2. Avoid prescribing solutions, frameworks, or steps to fix the problem?
3. End at the shift (the direction, not the destination)?

If the post prescribes solutions or tells the reader what to do, it FAILS.

Respond with JSON: {"passed": true/false, "explanation": "1 sentence"}`;
      break;

    case "if_i_was":
      evaluationPrompt = `Evaluate this LinkedIn post. It is supposed to give marketing/demand generation advice ONLY.

LANE CHECK: Does every piece of advice stay within marketing and demand generation?
- Sales process advice (how to close deals, objection handling) = FAIL
- Clinical practice advice (how to treat patients) = FAIL
- Operations advice (how to run a department) = FAIL
- Marketing/demand gen advice (how to create demand, build awareness, generate leads) = PASS

Respond with JSON: {"passed": true/false, "explanation": "1 sentence"}`;
      break;

    case "founder_friday":
      evaluationPrompt = `Evaluate this LinkedIn post. It is a "Founder Friday" personal reflection.

Check TWO things:
1. Does it contain genuine vulnerability or difficulty (not just humble-bragging)?
2. Does it also contain resolution, forward motion, or a reflective takeaway?

If it is ONLY negative/sad with no resolution = FAIL.
If it is about dogs, hobbies, or "founder life is better than employed life" = FAIL.
If it has both difficulty AND resolution = PASS.

Respond with JSON: {"passed": true/false, "explanation": "1 sentence"}`;
      break;

    case "personal":
    case "saturday":
      evaluationPrompt = `Evaluate this LinkedIn post. It is supposed to be a Saturday personal post.

Check: Is this post local to a specific place (Bristol or similar), current/timely (not evergreen), and cultural?
Could this post have been posted from anywhere in the world, or is it rooted in a specific location and time?

If it is generic and could be posted from anywhere = FAIL.
If it is local, timely, and specific = PASS.

Respond with JSON: {"passed": true/false, "explanation": "1 sentence"}`;
      break;

    case "contrarian":
      evaluationPrompt = `Evaluate this LinkedIn post. It is supposed to challenge a widely-held assumption.

Check:
1. Does it identify a specific assumption that the audience likely holds?
2. Does it provide evidence or reasoning to challenge that assumption?
3. Does it let the discomfort land before softening?

If the post agrees with conventional wisdom or softens immediately = FAIL.

Respond with JSON: {"passed": true/false, "explanation": "1 sentence"}`;
      break;

    case "tactical":
      evaluationPrompt = `Evaluate this LinkedIn post. It is supposed to provide concrete, immediately usable tactical steps.

Check:
1. Are the steps specific enough to act on tomorrow?
2. Would these steps be hard to find via a Google search?
3. Do any points start with vague language like "Consider...", "Think about...", "Explore..."?

If the advice is vague or Googleable = FAIL.

Respond with JSON: {"passed": true/false, "explanation": "1 sentence"}`;
      break;

    case "blog_teaser":
      evaluationPrompt = `Evaluate this LinkedIn post. It is supposed to tease a blog article.

Check:
1. Does it make an argument in miniature (not just announce "New blog out!")?
2. Is the bridge to the blog SPECIFIC (e.g. "three questions I ask before...") not vague ("I go deeper")?
3. Does it create enough tension that the reader would want the full version?

If it reads like a blog announcement rather than a standalone argument = FAIL.

Respond with JSON: {"passed": true/false, "explanation": "1 sentence"}`;
      break;

    default:
      // No day-specific check for unknown post types
      return { ...gate, passed: true, explanation: "No day-specific rules for this post type." };
  }

  try {
    const response = await callClaudeHaiku(
      apiKey,
      "You are a content quality evaluator. Be strict. Respond with valid JSON only.",
      `POST CONTENT:\n${content}\n\n${evaluationPrompt}`
    );

    const cleaned = response.replace(/```json\s*/gi, "").replace(/```/gi, "").trim();
    const result = JSON.parse(cleaned);
    gate.passed = result.passed === true;
    gate.explanation = result.explanation || "";
    if (!gate.passed) {
      gate.fixInstruction = `This post fails the ${postTypeSlug} day-specific rules. ${gate.explanation}. Rewrite to follow the rules for this post type.`;
    }
  } catch (err) {
    // If Haiku call fails, pass the gate rather than blocking generation
    gate.passed = true;
    gate.explanation = `Gate evaluation error: ${err instanceof Error ? err.message : "unknown"}. Passed by default.`;
  }

  return gate;
}

/**
 * Gate 2: Healthcare Specificity (CRITICAL for healthcare companies)
 */
async function runGate2HealthcareSpecificity(
  content: string,
  apiKey: string
): Promise<GateResult> {
  const gate: GateResult = {
    gate: "healthcare_specificity",
    passed: true,
    severity: "critical",
    explanation: "",
    fixInstruction: "",
  };

  // First: programmatic term count
  const healthcareTerms = [
    "clinical", "clinician", "surgeon", "hospital", "NHS", "health system",
    "procurement", "medical device", "med device", "medtech", "biotech",
    "diagnostics", "digital health", "health tech", "pharmaceutical",
    "HCP", "healthcare", "patient", "clinical champion", "regulatory",
    "reimbursement", "formulary", "clinical evidence", "NICE",
    "product launch", "sales rep", "field sales",
    // Extended list
    "procurement lead", "medical affairs", "market access", "KOL",
    "formulary decision", "supplier meeting", "clinical evaluation",
    "technology appraisal", "hospital buying", "compliance review",
    "ABPI", "patient pathway", "NHS budget", "clinical trial",
    "medical director", "chief pharmacist", "commissioning",
    "integrated care", "ICB", "care pathway", "therapeutic area",
    "prescriber", "trust", "ward", "theatre", "outpatient",
    "primary care", "secondary care", "tertiary care",
  ];

  const lower = content.toLowerCase();
  const found = healthcareTerms.filter((term) => lower.includes(term.toLowerCase()));

  // Must have at least 2 specific terms
  if (found.length < 2) {
    gate.passed = false;
    gate.explanation = `Only ${found.length} healthcare-specific term(s) found. Content could be about any industry.`;
    gate.fixInstruction = "Add healthcare-specific job titles (procurement lead, clinical champion, medical affairs director), scenarios (12-minute supplier meetings, formulary submissions, NICE technology appraisals), or challenges (compliance review cycles, clinical evidence requirements). Generic B2B terms alone are not enough.";
    return gate;
  }

  // Then: Claude "Could Be Any Industry" test
  try {
    const response = await callClaudeHaiku(
      apiKey,
      "You are a content quality evaluator. Respond with valid JSON only.",
      `EVALUATE THIS POST for healthcare specificity.

POST:
${content}

TEST: If you replaced every healthcare-specific word with a generic B2B equivalent, would this post still work and make complete sense?
- If YES (post works as generic B2B) = the post FAILS (not healthcare-specific enough)
- If NO (post would lose its meaning without healthcare context) = the post PASSES

Respond with JSON: {"passed": true/false, "explanation": "1 sentence"}`
    );

    const cleaned = response.replace(/```json\s*/gi, "").replace(/```/gi, "").trim();
    const result = JSON.parse(cleaned);
    gate.passed = result.passed === true;
    gate.explanation = result.explanation || `${found.length} healthcare terms found. ${result.explanation || ""}`;
    if (!gate.passed) {
      gate.fixInstruction = "This post could be about any industry. Embed healthcare-specific scenarios deeply into the argument. Reference specific job titles (clinical champion, procurement lead), processes (formulary submission, NICE appraisal), or constraints (ABPI code, NHS budget timing) that make it unmistakably healthcare.";
    }
  } catch {
    // Programmatic check passed, so accept it
    gate.explanation = `${found.length} healthcare terms found. Claude evaluation skipped.`;
  }

  return gate;
}

/**
 * Gate 3: Hook Tension Type (HIGH)
 */
async function runGate3HookTension(
  hookLine: string,
  apiKey: string
): Promise<GateResult> {
  const gate: GateResult = {
    gate: "hook_tension",
    passed: true,
    severity: "high",
    explanation: "",
    fixInstruction: "",
  };

  if (!hookLine || hookLine.trim().length === 0) {
    return { ...gate, passed: false, explanation: "No hook line found.", fixInstruction: "Add a compelling opening line." };
  }

  try {
    const response = await callClaudeHaiku(
      apiKey,
      "You are a content quality evaluator. Respond with valid JSON only.",
      `Classify this LinkedIn post opening line into one of these types:
- ACCUSATION: points at a problem the reader is complicit in
- REVELATION: reveals something the reader did not know
- CONFRONTATION: challenges what the reader believes
- CONTRADICTION: presents two things that should not be true together
- ADVICE: tells the reader what they should learn or do
- INSTRUCTION: provides steps or a numbered list
- SUGGESTION: recommends the reader consider something
- QUESTION: asks the reader a question

HOOK LINE: "${hookLine}"

Respond with JSON: {"type": "ONE_WORD_TYPE", "explanation": "1 sentence"}`
    );

    const cleaned = response.replace(/```json\s*/gi, "").replace(/```/gi, "").trim();
    const result = JSON.parse(cleaned);
    const validTypes = ["ACCUSATION", "REVELATION", "CONFRONTATION", "CONTRADICTION"];
    const hookType = (result.type || "").toUpperCase();

    gate.passed = validTypes.includes(hookType);
    gate.explanation = `Hook type: ${hookType}. ${result.explanation || ""}`;
    if (!gate.passed) {
      gate.fixInstruction = `Rewrite the opening line as a REVELATION or CONFRONTATION instead. The current hook is ${hookType} type. Make the reader feel something about their own situation. Do not tell them what to do. The hook must be ONE sentence visible above LinkedIn's "...see more" fold.`;
    }
  } catch {
    gate.passed = true;
    gate.explanation = "Hook evaluation skipped due to API error.";
  }

  return gate;
}

/**
 * Gate 4: AI Voice Detection (HIGH) — fully programmatic
 */
function runGate4AIVoiceDetection(content: string): GateResult {
  const issues: string[] = [];

  // Unicode bold text (Mathematical Alphanumeric Symbols block U+1D400-U+1D7FF)
  if (/\uD835/.test(content) || /[\u{1D400}-\u{1D7FF}]/u.test(content)) {
    issues.push("Unicode bold/italic text detected");
  }

  // Emoji as bullet points (emoji followed by text that looks like a list item)
  if (/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s+\w/mu.test(content)) {
    issues.push("Emoji used as bullet points");
  }

  // Stacked tricolons (3+ in the post)
  const tricolonPattern = /\w+,\s+\w+,\s+and\s+\w+/gi;
  const tricolonMatches = content.match(tricolonPattern) || [];
  if (tricolonMatches.length > 1) {
    issues.push(`${tricolonMatches.length} tricolons found (max 1 per post)`);
  }

  // Gushing openers
  const gushingPatterns = [
    /words cannot fully express/i,
    /absolutely delighted/i,
    /thrilled to announce/i,
    /incredibly proud/i,
    /so proud to/i,
    /deeply honoured/i,
    /honored to/i,
    /beyond excited/i,
  ];
  for (const pat of gushingPatterns) {
    if (pat.test(content)) {
      issues.push(`Gushing language detected: "${content.match(pat)?.[0]}"`);
    }
  }

  // Empty closers
  const emptyClosers = [
    /excited for what comes next/i,
    /watch this space/i,
    /the future is bright/i,
    /onwards and upwards/i,
    /can't wait to see/i,
    /looking forward to what's next/i,
    /bring on/i,
    /here's to the next chapter/i,
  ];
  for (const pat of emptyClosers) {
    if (pat.test(content)) {
      issues.push(`Empty closer detected: "${content.match(pat)?.[0]}"`);
    }
  }

  // Em-dash emphasis pattern
  if (/not just because of .+ — but because of/i.test(content)) {
    issues.push("Em-dash emphasis pattern detected");
  }

  // Hashtag count
  const hashtags = content.match(/#\w+/g) || [];
  if (hashtags.length > 3) {
    issues.push(`${hashtags.length} hashtags found (max 3)`);
  }

  // #ProudMoment etc.
  const bannedHashtags = ["#ProudMoment", "#Grateful", "#Blessed", "#Inspired"];
  for (const tag of bannedHashtags) {
    if (content.includes(tag)) {
      issues.push(`Banned hashtag: ${tag}`);
    }
  }

  // Self-congratulatory framing
  const selfCongrat = [
    /we were (?:absolutely |so )?delighted to (?:be awarded|receive|win)/i,
    /proud to share that we/i,
    /humbled and honoured/i,
    /what an incredible achievement/i,
  ];
  for (const pat of selfCongrat) {
    if (pat.test(content)) {
      issues.push("Self-congratulatory framing detected");
      break;
    }
  }

  // Wall-of-text (any paragraph > 3 lines, approximated by character count)
  const paragraphs = content.split(/\n\s*\n/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    // Approximate: 3 mobile lines ~ 120 characters
    if (trimmed.length > 200 && !trimmed.startsWith("#") && !trimmed.startsWith("---")) {
      issues.push("Wall-of-text paragraph detected (paragraph exceeds 3 mobile lines)");
      break;
    }
  }

  // Banned AI words
  const bannedAIWords = [
    "delve", "landscape", "navigate", "leverage", "pivotal",
    "robust", "streamline", "foster", "harness", "cutting-edge",
    "game-changer", "meaningful change", "exceptional", "immensely",
    "commitment creativity and determination",
    "commitment, creativity, and determination",
  ];
  const lower = content.toLowerCase();
  const foundBanned: string[] = [];
  for (const word of bannedAIWords) {
    if (lower.includes(word)) {
      foundBanned.push(word);
    }
  }
  if (foundBanned.length > 0) {
    issues.push(`Banned AI words: ${foundBanned.join(", ")}`);
  }

  return {
    gate: "ai_voice_detection",
    passed: issues.length === 0,
    severity: "high",
    explanation: issues.length === 0
      ? "No AI voice patterns detected."
      : `AI voice issues: ${issues.join("; ")}`,
    fixInstruction: issues.length === 0
      ? ""
      : `Fix these AI voice issues: ${issues.join(". ")}. Replace with natural, human language. Remove Unicode formatting, emoji bullets, and stacked tricolons. Use understated language instead of gushing or self-congratulatory phrasing. Break up wall-of-text paragraphs.`,
  };
}

/**
 * Gate 5: Structure & Formatting (MEDIUM) — fully programmatic
 */
function runGate5StructureFormatting(
  content: string,
  title: string,
  firstComment: string | null,
  options: {
    postTypeSlug: string;
    signoffText?: string;
    wordCountMin?: number;
    wordCountMax?: number;
  }
): GateResult {
  const issues: string[] = [];

  // Word count
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  if (options.wordCountMin && wordCount < options.wordCountMin) {
    issues.push(`Word count ${wordCount} is below minimum ${options.wordCountMin}`);
  }
  if (options.wordCountMax && wordCount > options.wordCountMax) {
    issues.push(`Word count ${wordCount} exceeds maximum ${options.wordCountMax}`);
  }

  // Sign-off present
  if (options.signoffText && !content.includes(options.signoffText.trim())) {
    issues.push("Sign-off text not found verbatim in content");
  }

  // First comment generated (for types that need it)
  const noFirstCommentTypes = new Set(["blog_teaser", "personal", "saturday"]);
  if (!noFirstCommentTypes.has(options.postTypeSlug) && !firstComment) {
    issues.push("First comment not generated (required for this post type)");
  }

  // No em-dashes or en-dashes
  if (/[—]/.test(content)) issues.push("Em-dash found in content");
  if (/[–]/.test(content)) issues.push("En-dash found in content");

  // No colons or hyphens in title/hook
  if (title) {
    if (title.includes(":")) issues.push("Title contains a colon");
    if (title.includes(" - ") || title.startsWith("-")) issues.push("Title contains a hyphen");
    if (/[—–]/.test(title)) issues.push("Title contains a dash");
  }

  // Hook line (first line of content)
  const hookLine = content.trim().split("\n")[0] || "";
  if (hookLine.includes(":")) issues.push("Hook line contains a colon");

  // UK spelling check
  const ukChecks: [string, string][] = [
    ["organize", "organise"],
    ["optimize", "optimise"],
    ["recognize", "recognise"],
    ["behavior", "behaviour"],
    ["center ", "centre "],
  ];
  const lower = content.toLowerCase();
  for (const [us, uk] of ukChecks) {
    if (lower.includes(us) && !lower.includes(uk)) {
      issues.push(`US spelling "${us}" should be "${uk}"`);
    }
  }

  // First word is not "I" (except Tuesday and Friday)
  const allowedIStarters = new Set(["launch_story", "founder_friday"]);
  if (!allowedIStarters.has(options.postTypeSlug)) {
    const firstWord = content.trim().split(/\s/)[0];
    if (firstWord === "I" || firstWord === "I'm" || firstWord === "I've" || firstWord === "I'd") {
      issues.push(`Post opens with "${firstWord}". Must start with observation, scene, or fact.`);
    }
  }

  return {
    gate: "structure_formatting",
    passed: issues.length === 0,
    severity: "medium",
    explanation: issues.length === 0
      ? "Structure and formatting checks passed."
      : `Formatting issues: ${issues.join("; ")}`,
    fixInstruction: issues.length === 0
      ? ""
      : `Fix these formatting issues: ${issues.join(". ")}. Use UK spelling throughout. Remove dashes from titles and hooks. Ensure sign-off is present verbatim.`,
  };
}

/**
 * Gate 6: Ros Atkins / So What / Pub (MEDIUM)
 */
async function runGate6QualityTriple(
  content: string,
  apiKey: string
): Promise<GateResult> {
  const gate: GateResult = {
    gate: "quality_triple",
    passed: true,
    severity: "medium",
    explanation: "",
    fixInstruction: "",
  };

  try {
    const response = await callClaudeHaiku(
      apiKey,
      "You are a content quality evaluator. Be honest and strict. Respond with valid JSON only.",
      `Evaluate this LinkedIn post for three tests:

POST:
${content}

1. ROS ATKINS TEST: Would a smart person OUTSIDE this industry understand the point? Is there unexplained jargon or assumed knowledge?
2. SO WHAT TEST: Are the stakes clear? Does the reader know why this matters to THEM?
3. PUB TEST: Would you actually say this out loud to a colleague in a pub? Does it sound like a human talking?

Respond with JSON:
{
  "ros_atkins": {"passed": true/false, "explanation": "1 sentence"},
  "so_what": {"passed": true/false, "explanation": "1 sentence"},
  "pub_test": {"passed": true/false, "explanation": "1 sentence"}
}`
    );

    const cleaned = response.replace(/```json\s*/gi, "").replace(/```/gi, "").trim();
    const result = JSON.parse(cleaned);

    const failures: string[] = [];
    if (!result.ros_atkins?.passed) failures.push(`Ros Atkins: ${result.ros_atkins?.explanation || "failed"}`);
    if (!result.so_what?.passed) failures.push(`So What: ${result.so_what?.explanation || "failed"}`);
    if (!result.pub_test?.passed) failures.push(`Pub Test: ${result.pub_test?.explanation || "failed"}`);

    gate.passed = failures.length === 0;
    gate.explanation = failures.length === 0
      ? "All three quality tests passed."
      : failures.join(". ");
    if (!gate.passed) {
      gate.fixInstruction = `Polish these issues: ${failures.join(". ")}. The post should be understandable to outsiders, make the stakes clear to the reader, and sound like something a human would actually say.`;
    }
  } catch {
    gate.passed = true;
    gate.explanation = "Quality triple evaluation skipped due to API error.";
  }

  return gate;
}

// ════════════════════════════════════════════════════════════
// Main Post-Generation Gates Runner
// ════════════════════════════════════════════════════════════

/**
 * Runs all quality gates IN ORDER (fail fast — fundamental failures first).
 * Returns an array of GateResult objects.
 *
 * Gates 1, 2, 3, 6 use Claude Haiku for evaluation.
 * Gates 4, 5 are fully programmatic.
 */
export async function runPostGenerationGates(
  options: GateOptions
): Promise<GateResult[]> {
  const results: GateResult[] = [];
  const apiKey = await getApiKey(options.companyId);

  // Extract hook line
  const hookLine = options.hookLine || options.content.trim().split("\n")[0] || "";

  // Gate 1: Day/Lane/Theme Check (CRITICAL)
  if (apiKey) {
    const g1 = await runGate1DayLaneTheme(options.content, options.postTypeSlug, apiKey);
    results.push(g1);
  }

  // Gate 2: Healthcare Specificity (CRITICAL for healthcare companies)
  if (options.isHealthcareCompany !== false && apiKey) {
    const g2 = await runGate2HealthcareSpecificity(options.content, apiKey);
    results.push(g2);
  }

  // Gate 3: Hook Tension Type (HIGH)
  if (apiKey) {
    const g3 = await runGate3HookTension(hookLine, apiKey);
    results.push(g3);
  }

  // Gate 4: AI Voice Detection (HIGH) — programmatic
  const g4 = runGate4AIVoiceDetection(options.content);
  results.push(g4);

  // Gate 5: Structure & Formatting (MEDIUM) — programmatic
  const g5 = runGate5StructureFormatting(
    options.content,
    options.title || "",
    options.firstComment || null,
    {
      postTypeSlug: options.postTypeSlug,
      signoffText: options.signoffText,
      wordCountMin: options.wordCountMin,
      wordCountMax: options.wordCountMax,
    }
  );
  results.push(g5);

  // Gate 6: Ros Atkins / So What / Pub (MEDIUM)
  if (apiKey) {
    const g6 = await runGate6QualityTriple(options.content, apiKey);
    results.push(g6);
  }

  return results;
}

/**
 * Builds fix instructions from gate failures for retry.
 */
export function buildGateFixInstructions(gates: GateResult[]): string {
  const failures = gates.filter((g) => !g.passed);
  if (failures.length === 0) return "";

  const lines = [
    "QUALITY GATE FAILURES — fix each issue while preserving the content's meaning and voice:",
    "",
  ];

  for (const f of failures) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.gate}: ${f.explanation}`);
    lines.push(`  FIX: ${f.fixInstruction}`);
    lines.push("");
  }

  lines.push("Return the FIXED content in the same JSON format. Only fix the specific issues listed above.");
  lines.push("Do NOT rewrite the content. Make minimal, targeted fixes.");

  return lines.join("\n");
}

/**
 * Helper to check if any critical gates failed.
 */
export function hasCriticalFailures(gates: GateResult[]): boolean {
  return gates.some((g) => !g.passed && g.severity === "critical");
}

/**
 * Helper to check if any high-severity gates failed.
 */
export function hasHighFailures(gates: GateResult[]): boolean {
  return gates.some((g) => !g.passed && g.severity === "high");
}

/**
 * Helper to get failed gates by severity.
 */
export function getFailedGates(gates: GateResult[]): {
  critical: GateResult[];
  high: GateResult[];
  medium: GateResult[];
} {
  return {
    critical: gates.filter((g) => !g.passed && g.severity === "critical"),
    high: gates.filter((g) => !g.passed && g.severity === "high"),
    medium: gates.filter((g) => !g.passed && g.severity === "medium"),
  };
}
