/**
 * Anthropic Claude Content Generation Provider
 *
 * Uses the Anthropic Messages API to generate content pieces and
 * platform-adapted variants. The provider expects credentials with
 * an `api_key` field and optional settings like `model`.
 *
 * The prompt is structured in three layers:
 *   1. Voice Enforcement — explicit, non-negotiable style rules extracted
 *      from the standardised Company Blueprint template sections (C1-C7, E3).
 *   2. Content Type Instructions — format-specific guidance (social, blog, etc.)
 *   3. Blueprint Context — the full document for topic expertise and detail.
 *
 * This avoids the "dump 23K chars and say follow it" problem. Claude gets
 * the rules spelled out, plus the full blueprint for reference.
 */

import type {
  ContentProvider,
  ContentGenerationInput,
  ContentGenerationOutput,
  PlatformAdaptationProvider,
  PlatformAdaptationInput,
  PlatformAdaptationOutput,
} from "../index";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const API_URL = "https://api.anthropic.com/v1/messages";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content: { type: string; text: string }[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  messages: AnthropicMessage[],
  maxTokens: number = 4096
): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data: AnthropicResponse = await res.json();
  const textBlock = data.content.find((c) => c.type === "text");
  if (!textBlock) throw new Error("No text content in Anthropic response");
  return textBlock.text;
}

// ── Content Type Instructions ───────────────────────────────
//
// Each content type gets format-specific guidance. These are combined
// with the voice enforcement rules in buildContentPrompt().

const CONTENT_TYPE_INSTRUCTIONS: Record<string, string> = {
  social_post: `FORMAT: LinkedIn social media post.

STRUCTURE:
- A brilliant hook (first line that stops the scroll). Short. Sets up tension, contrast, or a specific observation. No colons or hyphens in hooks.
- 3-6 short paragraphs. Each paragraph is 1-2 sentences MAX. Use line breaks between paragraphs.
- At least one bracketed aside somewhere in the body (MANDATORY).
- End with the EXACT sign-off from the blueprint (Section E3). Do not paraphrase it. Copy it verbatim.
- Before the sign-off, include a context-appropriate engagement question related to the post topic.
- 2-3 hashtags at the very end.
- Post type should be one of: insight, story, framework, contrarian, list, question.

FIRST COMMENT:
- Generate a "first comment" to post immediately after the main post.
- The first comment is a CTA that follows the blueprint's first-comment rules (Section E3).
- It should link to a relevant resource from the blueprint's CTA URLs.
- The first comment is conversational and brief (1-3 sentences + link).

WORD COUNT: 150-350 words (excluding sign-off and hashtags).

IMAGE PROMPT:
- Describe a Pixar-style 3D illustration that visualises the post concept.
- The scene should have warm lighting, depth of field, and a healthcare/business setting.
- Include specific objects that relate to the topic (e.g., a tiny surgeon standing next to a giant procurement form).
- No text in the image. No logos. No real people.`,

  blog_article: `FORMAT: Full blog article (800-1200 words).

STRUCTURE:
- A compelling title (no colons, no hyphens, no question marks).
- An engaging opening paragraph that frames the problem from a healthcare commercial perspective.
- 3-5 sections with subheadings (use ## for subheadings). Subheadings should be conversational, not corporate.
- Each section should contain practical, specific takeaways grounded in healthcare scenarios.
- A conclusion that reflects rather than summarises. End with a thought, not a sales pitch.
- Use the blueprint voice throughout: short sentences, hedging language, bracketed asides, UK spelling.
- In long-form: anti-contraction style ("do not" rather than "don't").

ALSO GENERATE THESE ASSETS:
- SEO title (60 chars max, compelling, no colons)
- Meta description (155 chars max)
- URL slug (lowercase, hyphenated)
- Excerpt (2 sentences that would work as a social teaser)

IMAGE PROMPT:
- Describe a hero image for the blog post.
- Professional healthcare/business setting, editorial photography style.
- Should capture the theme of the article without being literal.`,

  linkedin_article: `FORMAT: LinkedIn article (600-1000 words).

STRUCTURE:
- A thought-provoking title that would make a healthcare marketing director click.
- An opening that frames the problem from real-world experience.
- 3-4 sections with clear subheadings.
- Professional insights grounded in specific healthcare commercial scenarios.
- A conclusion that positions the author as a thoughtful practitioner, not a guru.
- Use the blueprint voice: hedging over declaring, observations over verdicts.
- Anti-contraction style in long-form.

ALSO GENERATE THESE ASSETS:
- SEO title, meta description, excerpt.

IMAGE PROMPT:
- Describe a header image for a LinkedIn article.
- Professional, clean, healthcare/business context.`,

  pdf_guide: `FORMAT: 8-page PDF guide content.

STRUCTURE:
- A title and subtitle.
- An executive summary (1 paragraph).
- 4-6 main sections with actionable, specific content.
- Bullet points and numbered lists where they genuinely help.
- A conclusion with clear next steps.
- Cover page copy (short, punchy, states the value proposition).
- Back page CTA (drives to a specific action).
- Voice should be slightly more structured than social posts but still conversational.

IMAGE PROMPT:
- Describe a clean, professional cover image for a PDF guide.
- Healthcare business context, modern design aesthetic.`,

  video_script: `FORMAT: Video script (3-5 minutes when read aloud).

STRUCTURE:
- Opening hook (first 5 seconds — something surprising or provocative).
- Main content in clear segments with natural transitions.
- Conversational delivery — this will be spoken aloud, so write for the ear, not the eye.
- Closing with a clear CTA.
- Intro/outro specification.
- B-roll timestamp suggestions.

IMAGE PROMPT:
- Describe a YouTube thumbnail: bold, clear, with a visual metaphor for the topic.
- Should work at small sizes. Describe any text overlay needed.`,
};

// ── Prompt Builder ──────────────────────────────────────────

function buildContentPrompt(input: ContentGenerationInput): string {
  // When slot-specific template instructions are provided, they OVERRIDE
  // the generic content type instructions. This is how "Monday = Problem Post"
  // and "Friday = Founder Friday" produce different structures.
  const hasSlotTemplate = !!input.templateInstructions;
  const typeInstructions = hasSlotTemplate
    ? input.templateInstructions!
    : CONTENT_TYPE_INSTRUCTIONS[input.contentType] || CONTENT_TYPE_INSTRUCTIONS.social_post;

  const spokespersonClause = input.spokespersonName
    ? `You are writing as ${input.spokespersonName}. The content must sound like they wrote it themselves.`
    : "";

  // Build word count guidance from slot data or fallback
  const wordMin = input.wordCountMin;
  const wordMax = input.wordCountMax;
  const wordCountClause =
    wordMin && wordMax
      ? `TARGET WORD COUNT: ${wordMin}-${wordMax} words.`
      : "";

  // Build image archetype guidance
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const imageArchetypeClause = input.imageArchetype
    ? `IMAGE ARCHETYPE: ${input.imageArchetype.replace(/_/g, " ")}. Generate an image prompt matching this archetype style.`
    : "";

  // Schedule context
  const scheduleClause =
    input.dayOfWeek !== undefined
      ? `SCHEDULED: ${DAY_NAMES[input.dayOfWeek]}${input.scheduledTime ? ` at ${input.scheduledTime}` : ""}${input.slotLabel ? ` (${input.slotLabel})` : ""}`
      : "";

  // ── SIGN-OFF: Use explicit text if provided, otherwise instruct to find in blueprint ──
  const signoffSection = input.signoffText
    ? `5. SIGN-OFF (MANDATORY — use this EXACT text, copy verbatim)
   Before the sign-off, add a context-relevant engagement question about the post topic.
   Then copy this EXACT sign-off text:
   "${input.signoffText}"
   Do NOT paraphrase, shorten, or modify this text in any way.`
    : `5. SIGN-OFF & FIRST COMMENT (Blueprint Section E3)
   Find the EXACT sign-off text in the blueprint and reproduce it VERBATIM.
   Do not paraphrase, abbreviate, or "improve" it. Copy it exactly as written.
   Before the sign-off, add a context-relevant engagement question about the topic.`;

  // ── FIRST COMMENT: CTA URL goes here, NOT in the post body ──
  const firstCommentSection = (() => {
    const parts: string[] = [];
    parts.push("FIRST COMMENT RULES (CRITICAL):");
    parts.push("- The first comment is posted IMMEDIATELY after the main post.");
    parts.push("- The CTA URL goes in the FIRST COMMENT ONLY. NEVER put the CTA URL in the main post body.");
    parts.push("- The first comment is conversational and brief (1-3 sentences + link).");

    if (input.firstCommentTemplate && input.ctaUrl) {
      const filledTemplate = input.firstCommentTemplate.replace(/\{url\}/g, input.ctaUrl);
      parts.push(`- Use this template: "${filledTemplate}"`);
    } else if (input.ctaUrl) {
      parts.push(`- CTA URL to include: ${input.ctaUrl}`);
      if (input.ctaLinkText) parts.push(`- Link text: "${input.ctaLinkText}"`);
    }

    // Blog teaser first comment is different (coffee comment, not CTA)
    if (input.postTypeSlug === "blog_teaser") {
      parts.length = 0;
      parts.push("FIRST COMMENT: Coffee comment (NOT a CTA). Soft, human, 1-2 sentences.");
      parts.push('Examples: "Coffee is on. Quiet house. Good morning for thinking."');
    }

    return parts.join("\n   ");
  })();

  // ── WEEKLY ECOSYSTEM: Cross-references to other content this week ──
  const ecosystemClause = (() => {
    const parts: string[] = [];
    if (input.blogTitle && input.blogUrl) {
      parts.push(`THIS WEEK'S BLOG: "${input.blogTitle}" at ${input.blogUrl}`);
      if (input.postTypeSlug === "blog_teaser") {
        parts.push("Your job is to TEASE this blog article. Make readers want to click through.");
        parts.push(`Include the blog link: ${input.blogUrl}`);
      }
      if (input.postTypeSlug === "blog_cta") {
        parts.push(`Drive readers to the blog: ${input.blogUrl}`);
      }
    }
    return parts.length > 0 ? parts.join("\n") : "";
  })();

  // ── VOICE PROFILE: Inject company-specific voice rules if available ──
  const voiceOverride = (() => {
    const parts: string[] = [];
    if (input.voiceDescription) {
      parts.push(`VOICE PROFILE (from voice analysis, takes precedence over blueprint C2):\n${input.voiceDescription}`);
    }
    if (input.signatureDevices) {
      parts.push(`SIGNATURE DEVICES (from voice analysis):\n${input.signatureDevices}`);
    }
    if (input.bannedVocabulary) {
      parts.push(`ADDITIONAL BANNED VOCABULARY:\n${input.bannedVocabulary}`);
    }
    return parts.length > 0 ? parts.join("\n\n") : "";
  })();

  return `You are a content ghostwriter. ${spokespersonClause} Your job is to produce content that is INDISTINGUISHABLE from the spokesperson's own writing. Not "inspired by" — identical in voice.

The company's full blueprint is provided below. You MUST study and precisely follow every voice, style, and formatting rule it contains. These are not suggestions. Every rule is a hard constraint.

${"═".repeat(60)}
VOICE ENFORCEMENT (NON-NEGOTIABLE RULES)
${"═".repeat(60)}

Read the blueprint carefully and follow these rules EXACTLY:

1. VOICE CHARACTER (Blueprint Section C2)
   Find the "Voice Character" section. Embody that description completely.
   Pay close attention to: hedging vs declaring, sentence length, perspective,
   and emotional register. The voice should match EXACTLY — not a generic
   professional voice, not a motivational speaker, not a consultant's blog.

2. SIGNATURE DEVICES (Blueprint Section C4)
   You MUST include at least ONE bracketed aside in every piece.
   Examples: "(He wasn't wrong to be annoyed, to be fair.)"
   "(Took us a while to figure that out.)" "(Ask me how I know.)"
   Also use: question tags, British interjections ("Blimey...", "Right then...",
   "Fair enough", "Mind you..."), understatement, hedging phrases
   ("I think there's...", "Probably worth...", "Fair to say..."),
   and self-deprecating asides. These are MANDATORY, not decorative.

3. BANNED VOCABULARY (Blueprint Section C5)
   Find the "Banned Vocabulary" section. NEVER use ANY word or phrase listed there.
   Common traps to avoid: leverage, optimise, comprehensive, robust, synergy,
   ecosystem, best practices, impactful, game-changer, revolutionary, exciting,
   resonates, crucial, spot on, nailed it, certainly, indeed, awesome,
   I'm curious, best of luck, exciting times, we've all been there.
   If you catch yourself reaching for any corporate, hype, or validation word
   — find a different, more human way to say it.

4. FORMATTING MANDATES (Blueprint Section C6)
   - UK spelling ALWAYS: organisation, recognise, colour, behaviour, centre, programme
   - 1-2 sentence paragraphs for social posts. Blank line between each.
   - NO em-dashes (—) or en-dashes (–) ANYWHERE. Use commas, full stops, or line breaks.
   - NO exclamation marks. The voice is understated, not excitable.
   - NO emoji in body copy. Ever.
   - NEVER open with "I" as the first word of the post. Start with a scene, fact, or observation.
   - Digits for stats (73%, 12 minutes). Words for small counts in prose (three things).
   - Oxford comma: yes.
   - NO colons or hyphens in titles or hooks.
   - Long-form: anti-contraction ("do not" not "don't", "cannot" not "can't").

${signoffSection}

6. WRITING SAMPLES (Blueprint Section C7)
   Study every writing sample in the blueprint. These are your north star.
   Match the sentence rhythm, paragraph length, narrative arc, and emotional
   register of these samples. When in doubt about any stylistic choice,
   default to whatever the writing samples demonstrate.

7. CONTENT GUARDRAILS
   - ALL content must reference healthcare-specific scenarios: clinical champions,
     procurement committees, surgeons, hospital buying processes, medical devices,
     health tech, NHS/health system dynamics, sales access challenges.
   - Stay in lane: healthcare marketing and demand generation ONLY.
   - Do NOT comment on: hard science, AI/tech trends, leadership theory, general B2B.
   - Never lecture experts on their domain (clinicians on medicine, regulators on regulation).
   - End stories with reflective observations, not stated morals.
   - Never punch down. Humour is warm, never cruel.

${voiceOverride ? `\n${"═".repeat(60)}\nVOICE PROFILE OVERRIDE\n${"═".repeat(60)}\n\n${voiceOverride}\n` : ""}

${"═".repeat(60)}
${firstCommentSection}
${"═".repeat(60)}

${"═".repeat(60)}
TOPIC & CONTEXT
${"═".repeat(60)}

TOPIC: ${input.topicTitle}
${input.topicDescription ? `DESCRIPTION: ${input.topicDescription}` : ""}
${input.pillar ? `CONTENT PILLAR: ${input.pillar}` : ""}
${input.audienceTheme ? `AUDIENCE THEME: ${input.audienceTheme}` : ""}
WEEK: ${input.weekNumber}
${scheduleClause}
${wordCountClause}
${ecosystemClause ? `\n${ecosystemClause}` : ""}
${input.additionalContext ? `\nADDITIONAL CONTEXT:\n${input.additionalContext}` : ""}

${"═".repeat(60)}
${hasSlotTemplate ? `POST TYPE: ${input.postTypeLabel || input.postTypeSlug || "Custom"}\nTEMPLATE INSTRUCTIONS (follow this EXACT structure)` : "CONTENT TYPE"}
${"═".repeat(60)}

${typeInstructions}

${imageArchetypeClause ? `\n${imageArchetypeClause}\n` : ""}
${"═".repeat(60)}
COMPANY BLUEPRINT (FULL DOCUMENT — READ CAREFULLY)
${"═".repeat(60)}

${input.blueprintContent}

${input.sourceContext ? `
${"═".repeat(60)}
SOURCE CONTEXT — PRODUCTION RULES (AGENCY Copy Magic DNA)
${"═".repeat(60)}
These are the battle-tested production rules that make content
sound authentic. They override any conflicting generic guidance.
Every rule here has been validated across 10+ weeks of live production.

${input.sourceContext}
` : ""}
${"═".repeat(60)}
OUTPUT FORMAT
${"═".repeat(60)}

Respond with a JSON object (no markdown code fences) matching this structure:
{
  "title": "string",
  "markdownBody": "string (the full content in markdown, including sign-off and hashtags for social posts)",
  "firstComment": "string or null (the first comment with CTA — follows blueprint Section E3)",
  "wordCount": number,
  "postType": "${input.postTypeSlug || "string or null (e.g. insight, story, framework, contrarian, list, question)"}",
  "imagePrompt": "string — ALWAYS REQUIRED for every content type. A vivid, detailed image generation prompt describing scene, mood, lighting, objects, setting, visual style${input.imageArchetype ? ` — matching the ${input.imageArchetype.replace(/_/g, " ")} archetype` : ""}. Never return null or omit this field.",
  "assets": [
    { "assetType": "seo_title", "textContent": "..." },
    { "assetType": "seo_meta_description", "textContent": "..." },
    { "assetType": "url_slug", "textContent": "..." },
    { "assetType": "excerpt", "textContent": "..." }
  ]
}

The "assets" array is content-type dependent — social posts typically have no SEO assets so return an empty array []. The imagePrompt field above is ALWAYS required regardless of content type.

${"═".repeat(60)}
MASTER VALIDATION CHECKLIST (check EVERY item before outputting)
${"═".repeat(60)}

A. POST STRUCTURE
   [ ] Sign-off is the EXACT text provided (not paraphrased)
   [ ] Sign-off appears at the end of the post body (before hashtags)
   [ ] Engagement question appears before the sign-off
   [ ] CTA URL is in the FIRST COMMENT ONLY, not in the post body
   [ ] First comment follows the template provided

B. DAY-SPECIFIC RULES
   [ ] Post follows the template structure for this post type EXACTLY
${wordCountClause ? `   [ ] Word count is between ${wordMin} and ${wordMax}` : ""}
   [ ] If blog teaser: teases the blog, does NOT announce it
   [ ] If CTA post: standalone, does NOT reference other posts
   [ ] If weekend personal: local/Bristol/timely, NOT business

C. VOICE & QUALITY
   [ ] At least one bracketed aside is present
   [ ] No banned vocabulary used
   [ ] UK spelling throughout
   [ ] No em-dashes, en-dashes, or exclamation marks
   [ ] Does not open with "I"
   [ ] Title has no colons or hyphens
   [ ] Healthcare-specific scenario referenced (not generic B2B)

D. ANCHOR CONTENT (blog/article only)
   [ ] Case study included (if required by template)
   [ ] SEO assets generated (title, meta, slug, excerpt)
   [ ] Anti-contraction style used

E. ECOSYSTEM
   [ ] Blog teaser links to this week's blog (if URL provided)
   [ ] CTA posts link to the correct resource
   [ ] No CTA URLs in post body (first comment only)`;
}

export function createClaudeContentProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): ContentProvider {
  const apiKey = credentials.api_key as string;
  if (!apiKey) {
    throw new Error(
      "Anthropic provider requires an api_key in credentials"
    );
  }
  const model = (settings.model as string) || DEFAULT_MODEL;

  return {
    async generate(input: ContentGenerationInput): Promise<ContentGenerationOutput> {
      const system = buildContentPrompt(input);
      const text = await callClaude(
        apiKey,
        model,
        system,
        [{ role: "user", content: "Generate the content now." }],
        8192
      );

      // Parse JSON response — strip any markdown fences if present
      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned) as ContentGenerationOutput;
        // Ensure imagePrompt has a fallback
        if (!parsed.imagePrompt) {
          parsed.imagePrompt = null;
        }
        return parsed;
      } catch {
        throw new Error(
          `Failed to parse Claude response as JSON. Raw output: ${text.substring(0, 500)}`
        );
      }
    },
  };
}

/**
 * Creates a "fix provider" that takes content + specific failure messages
 * and asks Claude to fix only the identified issues without rewriting.
 */
export function createClaudeFixProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
) {
  const apiKey = credentials.api_key as string;
  if (!apiKey) throw new Error("Fix provider requires API key");
  const model = (settings.model as string) || DEFAULT_MODEL;

  return {
    async fix(
      content: ContentGenerationOutput,
      fixInstructions: string
    ): Promise<ContentGenerationOutput> {
      const system = `You are a content editor. Fix ONLY the specific issues identified below. Do NOT rewrite the content. Make minimal, targeted changes.

CURRENT CONTENT:
Title: ${content.title}
Body: ${content.markdownBody}
First Comment: ${content.firstComment || "(none)"}
Word Count: ${content.wordCount}

QUALITY TEST FAILURES:
${fixInstructions}

Return the FIXED content as JSON (no code fences):
{
  "title": "string",
  "markdownBody": "string",
  "firstComment": "string or null",
  "wordCount": number,
  "postType": "${content.postType || "null"}",
  "imagePrompt": ${content.imagePrompt ? `"${content.imagePrompt.substring(0, 100)}..."` : "null"},
  "assets": ${JSON.stringify(content.assets || [])}
}

RULES:
- Fix ONLY the listed failures
- Preserve the voice, structure, and meaning
- Keep the same image prompt and assets unless specifically flagged
- If word count is wrong, trim or expand naturally (not with filler)`;

      const text = await callClaude(
        apiKey,
        model,
        system,
        [{ role: "user", content: "Fix the issues now." }],
        8192
      );

      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned) as ContentGenerationOutput;
        if (!parsed.imagePrompt) parsed.imagePrompt = content.imagePrompt;
        if (!parsed.assets || parsed.assets.length === 0) parsed.assets = content.assets;
        return parsed;
      } catch {
        // If parsing fails, return original content unchanged
        return content;
      }
    },
  };
}

// ── Platform Adaptation ─────────────────────────────────────

const PLATFORM_RULES: Record<string, string> = {
  twitter: `Twitter/X rules:
- Maximum 280 characters
- Short, punchy statements
- 2-3 relevant hashtags max
- No @mentions unless specifically relevant
- Thread format if content needs more space (but just give the first tweet)`,

  bluesky: `Bluesky rules:
- Maximum 300 characters
- Similar tone to Twitter but can be slightly longer
- No @mentions (different mention format)
- 2-3 hashtags max`,

  threads: `Threads rules:
- Maximum 500 characters
- Instagram-adjacent audience
- Slightly more casual tone
- Hashtags in body text (3-5)`,

  facebook: `Facebook rules:
- No strict character limit (but keep under 500 for engagement)
- Can be more conversational
- Include a question to drive comments
- 2-3 hashtags max`,

  instagram: `Instagram rules:
- Caption maximum 2200 characters
- First line is the hook (shows in preview)
- Up to 30 hashtags (put in first comment)
- Include emoji sparingly
- End with a CTA`,

  linkedin_personal: `LinkedIn Personal Profile rules:
- Maximum 3000 characters
- Professional but personal tone
- Hook in first 2 lines (before "see more")
- End with sign-off (use the EXACT sign-off from the blueprint)
- 2-3 hashtags at the end`,

  linkedin_company: `LinkedIn Company Page rules:
- Maximum 3000 characters
- More formal/brand voice
- Include company perspective
- 3-5 hashtags
- CTA to company resources`,
};

export function createClaudePlatformAdaptationProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): PlatformAdaptationProvider {
  const apiKey = credentials.api_key as string;
  // If no API key configured, we can still try if ANTHROPIC_API_KEY env is set
  const effectiveKey = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!effectiveKey) {
    throw new Error(
      "Platform adaptation requires an Anthropic API key (either in provider config or ANTHROPIC_API_KEY env var)"
    );
  }
  const model = (settings.model as string) || DEFAULT_MODEL;

  return {
    async adapt(input: PlatformAdaptationInput): Promise<PlatformAdaptationOutput> {
      const platformRules =
        PLATFORM_RULES[input.platform] || `Adapt for ${input.platform} (max ${input.maxChars} characters)`;

      const system = `You are a social media content adapter. Take the original post and adapt it for a specific platform while maintaining the core message and voice.

CRITICAL: Preserve the author's voice exactly. If there are bracketed asides, keep them. If the tone is understated and hedging, keep it that way. Do not make the adapted version more "energetic" or "engaging" — match the original voice.

${input.blueprintContent ? `BRAND CONTEXT (for voice reference):\n${input.blueprintContent}\n` : ""}
${input.spokespersonName ? `AUTHOR: ${input.spokespersonName}` : ""}

PLATFORM: ${input.platform}
${platformRules}

ORIGINAL POST:
${input.originalCopy}

${input.originalFirstComment ? `ORIGINAL FIRST COMMENT:\n${input.originalFirstComment}` : ""}

FORMATTING RULES (apply to all platforms):
- UK spelling (organisation, recognise, colour)
- No em-dashes or en-dashes
- No exclamation marks
- No emoji in body copy (unless platform specifically requires it)

Adapt this content for ${input.platform}. Respond with JSON (no code fences):
{
  "adaptedCopy": "string (the adapted post)",
  "adaptedFirstComment": "string or null",
  "hashtags": ["array", "of", "hashtags"],
  "mentions": ["array", "of", "mentions"],
  "characterCount": number
}`;

      const text = await callClaude(
        effectiveKey,
        model,
        system,
        [{ role: "user", content: "Adapt the content now." }],
        2048
      );

      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      try {
        return JSON.parse(cleaned) as PlatformAdaptationOutput;
      } catch {
        throw new Error(
          `Failed to parse adaptation response as JSON. Raw: ${text.substring(0, 500)}`
        );
      }
    },
  };
}
