/**
 * Post type registry.
 *
 * Single source of truth for every post type on the platform: labels,
 * colours, archetypes, generation config, and the database mappings
 * (calendar_slots.slot_type, content_pieces.content_type, public.post_types
 * slug). New post types are added here once, not copied across the
 * generate route, the picker component, the calendar, the planner, and
 * the display-name helper.
 */

export type PostTypeMedium = "image" | "carousel" | "video" | "text";
export type PostTypeProduction = "portal" | "mac" | "manual";
export type SlotType = "thesis" | "doc" | "carousel" | "reactive" | "video" | "meme";
export type PostTypeContentType =
  | "social_post"
  | "blog_article"
  | "linkedin_article"
  | "pdf_guide"
  | "video_script"
  | "video"
  | "meme";

export interface PostTypeGenerationConfig {
  /** Static image style prompt, or a function that takes the spokesperson appearance description. */
  imageStyle?: string | ((appearance: string) => string);
  dimensions?: { width: number; height: number };
  minWords?: number;
  maxWords?: number;
  /** Post-type-specific content instructions injected into the generation prompt. */
  contentInstructions?: string;
}

export interface PostTypeVideoBrief {
  hook: string;
  layout: string;
  captions: string;
  source: string;
}

export interface PostTypeOption {
  slug: string;
  label: string;
  description: string;
  archetype: string;
  color: string;
  visualTag?: string;
  ecosystemRole: string;
  weekdayHint?: string;

  /** What kind of asset this post type produces. */
  medium: PostTypeMedium;
  /** Where the asset is produced: on the platform, on the Mac (video pipeline), or fully manual. */
  production: PostTypeProduction;
  /** The calendar_slots.slot_type this post type maps to. */
  slotType: SlotType;
  /** The content_pieces.content_type this post type writes. */
  contentType: PostTypeContentType;
  /** The public.post_types.slug this post type maps to (may differ from `slug`). */
  dbSlug: string;
  /** Generation config: image style, word counts, prompt instructions. */
  generation: PostTypeGenerationConfig;
  /** Production brief for video post types (hook, layout, captions, source). */
  brief?: PostTypeVideoBrief;
}

export const POST_TYPES: PostTypeOption[] = [
  {
    slug: "insight",
    label: "Problem Diagnosis",
    description: "Identify a common mistake your audience makes. 150-250 words.",
    archetype: "quote_card_green",
    color: "#CDD856",
    visualTag: "Quote Card",
    ecosystemRole: "Opens the week by naming a problem your audience recognises. Builds trust by showing you understand their world before offering solutions.",
    weekdayHint: "Monday",
    medium: "image",
    production: "portal",
    slotType: "thesis",
    contentType: "social_post",
    dbSlug: "problem_post",
    generation: {
      imageStyle: "Flat solid green (#CDD856) background, edge to edge. Bold italic white text centred in middle third. Max 12 words. No scenes, people, objects, gradients, textures. The power comes from the emptiness.",
      dimensions: { width: 1080, height: 1080 },
      minWords: 150,
      maxWords: 250,
      contentInstructions: `POST TYPE: Problem Diagnosis. Identify a common mistake, blind spot, or misconception in the audience's industry. Structure: punchy hook (the mistake) then why it happens (2 paras) then what they should do instead (1-2 paras) then a reflective question. Tone: direct but empathetic. You have seen this mistake before.`,
    },
  },
  {
    slug: "launch_story",
    label: "Experience Story",
    description: "Share a real experience with pattern recognition. 200-350 words.",
    archetype: "pixar_healthcare",
    color: "#41CDA9",
    visualTag: "Cinematic 3D",
    ecosystemRole: "Builds credibility through lived experience. Shows you have been in the trenches, not just theorising from the sidelines.",
    weekdayHint: "Tuesday",
    medium: "image",
    production: "portal",
    slotType: "doc",
    contentType: "social_post",
    dbSlug: "launch_story",
    generation: {
      imageStyle: (appearance) =>
        `Pixar/Disney-adjacent 3D rendered scene in a professional business environment. Sophisticated lighting, slightly exaggerated proportions. Main character: ${appearance}. The Pixar character should clearly resemble this person.`,
      dimensions: { width: 1080, height: 1350 },
      minWords: 200,
      maxWords: 350,
      contentInstructions: `POST TYPE: Experience Story. Share a real or realistic experience that reveals a pattern. Structure: hook (the moment) then set the scene (what happened) then the pattern you noticed then what it taught you then a takeaway for the reader. Tone: narrative, observational, first-person.`,
    },
  },
  {
    slug: "if_i_was",
    label: "Expert Perspective",
    description: "\"If I was in your role...\" practical advice. 200-300 words.",
    archetype: "quote_card_purple",
    color: "#A27BF9",
    visualTag: "Quote Card",
    ecosystemRole: "Positions you as someone who can think from your audience's perspective. Practical, empathetic, and actionable.",
    weekdayHint: "Wednesday",
    medium: "image",
    production: "portal",
    slotType: "thesis",
    contentType: "social_post",
    dbSlug: "if_i_was",
    generation: {
      imageStyle: "Flat solid purple (#A27BF9) background, edge to edge. Bold italic white text centred in middle third. Max 12 words. Hand-drawn black arrow curving downward beneath the text. No scenes, people, objects, gradients, textures.",
      dimensions: { width: 1080, height: 1080 },
      minWords: 200,
      maxWords: 300,
      contentInstructions: `POST TYPE: Expert Perspective. "If I was in your role..." practical, specific advice. Structure: hook (the situation) then "If I was in your role, here is what I would do" then 3-4 specific, actionable steps then why this works then an open question. Tone: authoritative but generous. Sharing expertise freely.`,
    },
  },
  {
    slug: "contrarian",
    label: "Contrarian Take",
    description: "Challenge a widely-held industry assumption. 200-300 words.",
    archetype: "quote_card_blue",
    color: "#41C9FE",
    visualTag: "Quote Card",
    ecosystemRole: "Disrupts passive scrolling with a bold perspective. Generates debate, saves, and shares. The post people remember.",
    weekdayHint: "Thursday",
    medium: "image",
    production: "portal",
    slotType: "thesis",
    contentType: "social_post",
    dbSlug: "contrarian",
    generation: {
      imageStyle: "Flat solid blue (#41C9FE) background, edge to edge. Bold italic white text centred in middle third. Max 12 words. Accusation, revelation, or confrontation tone. No scenes, people, objects, gradients, textures.",
      dimensions: { width: 1080, height: 1080 },
      minWords: 200,
      maxWords: 300,
      contentInstructions: `POST TYPE: Contrarian Take. Challenge a widely-held industry assumption. Structure: hook (the assumption everyone believes) then why it is wrong or incomplete then evidence from your experience then what to do instead then a provocative closing question. Tone: confident, slightly provocative but not arrogant. Back it up with specifics.`,
    },
  },
  {
    slug: "tactical",
    label: "Tactical How-To",
    description: "Actionable steps to solve a specific problem. 150-250 words.",
    archetype: "carousel",
    color: "#CDD856",
    visualTag: "Carousel",
    ecosystemRole: "Delivers immediate practical value. The post people bookmark and share with colleagues. Earns trust through generosity.",
    weekdayHint: "Thursday",
    medium: "carousel",
    production: "portal",
    slotType: "carousel",
    contentType: "social_post",
    dbSlug: "tactical",
    generation: {
      imageStyle: "Clean white background with purple (#A27BF9) accents. Typography-led framework slide. Oversized purple number + heading + body text. Generous whitespace. Line-art icon. Professional, airy layout.",
      dimensions: { width: 1080, height: 1080 },
      minWords: 150,
      maxWords: 250,
      contentInstructions: `POST TYPE: Tactical How-To. Actionable steps to solve a specific problem. Structure: hook (the problem) then numbered steps (3-5, each with a heading and 1-2 sentence explanation) then a brief closing. IMPORTANT: Use numbered points (1. 2. 3.) because the image generator will parse these into carousel slides. Tone: practical, no fluff, each step must be immediately actionable.`,
    },
  },
  {
    slug: "founder_friday",
    label: "Personal Reflection",
    description: "Behind the scenes: expectations vs reality. 250-400 words.",
    archetype: "pixar_fantasy",
    color: "#F59E0B",
    visualTag: "Cinematic 3D",
    ecosystemRole: "Humanises you. Shows vulnerability and self-awareness. The post that makes people feel they know you, not just your expertise.",
    weekdayHint: "Friday",
    medium: "image",
    production: "portal",
    slotType: "doc",
    contentType: "social_post",
    dbSlug: "founder_friday",
    generation: {
      imageStyle: (appearance) =>
        `Pixar/Disney-adjacent 3D rendered scene showing a 'fantasy vs reality' moment. Split composition or contrasting elements. Main character: ${appearance}. The Pixar character should clearly resemble this person. Warm, intimate lighting. Candid, reflective moment.`,
      dimensions: { width: 1080, height: 1350 },
      minWords: 250,
      maxWords: 400,
      contentInstructions: `POST TYPE: Personal Reflection. Behind the scenes, expectations vs reality. Structure: hook (the expectation) then what actually happened then the gap between expectation and reality then what you learned then a reflective closing. Tone: honest, vulnerable, self-aware. This is the most personal post type. Show the human behind the professional.`,
    },
  },
  {
    slug: "blog_teaser",
    label: "Article Teaser",
    description: "Drive traffic to a longer piece of content. 60-120 words.",
    archetype: "quote_card",
    color: "#059669",
    visualTag: "Quote Card",
    ecosystemRole: "Bridges social content to long-form authority pieces. Drives traffic to your blog, newsletter, or podcast.",
    weekdayHint: "Sunday",
    medium: "image",
    production: "portal",
    slotType: "thesis",
    contentType: "social_post",
    dbSlug: "blog_teaser",
    generation: {
      imageStyle: "Flat solid emerald (#059669) background, edge to edge. Bold white text centred. Article title as hook. Clean, minimal.",
      dimensions: { width: 1080, height: 1080 },
      minWords: 60,
      maxWords: 120,
      contentInstructions: `POST TYPE: Article Teaser. SHORT. Drive traffic to a longer piece of content. Structure: hook (the insight) then 1-2 sentences teasing the full article then a call to read more. This is NOT a full post. It is a teaser. Maximum 120 words. Make the reader curious enough to click through.`,
    },
  },
  {
    slug: "personal_update",
    label: "Personal Update",
    description: "Share what you're up to. Candid, human, relatable. 100-200 words.",
    archetype: "editorial_photo",
    color: "#E11D48",
    visualTag: "Editorial Photo",
    ecosystemRole: "Breaks the pattern with something unexpected and human. Weekend content that builds personal connection.",
    weekdayHint: "Saturday",
    medium: "image",
    production: "portal",
    slotType: "doc",
    contentType: "social_post",
    dbSlug: "personal_update",
    generation: {
      imageStyle: "Candid editorial photography. Natural light, warm tones. Lifestyle scene matching the topic: walking, coffee shop, workspace, travel, family, nature. Authentic and unposed. Shot on 35mm film look. Shallow depth of field. No text on the image.",
      dimensions: { width: 1080, height: 1080 },
      minWords: 100,
      maxWords: 200,
      contentInstructions: `POST TYPE: Personal Update. Share what you are up to, candid, human, relatable. Structure: hook (what you were doing) then the moment or observation then a brief business insight that connects it back to work then a warm closing. Tone: casual, warm, conversational. This reads like a friend talking, not a professional posting. Short paragraphs, natural language.`,
    },
  },
  {
    slug: "scene_provocation",
    label: "Scene Provocation",
    description: "Bold statement on a whiteboard, billboard, or real-world surface. 150-250 words.",
    archetype: "scene_quote",
    color: "#1E3A5F",
    visualTag: "Scene Quote",
    ecosystemRole: "Visual pattern interrupt. The image-first post that stops the scroll before the copy even loads.",
    medium: "image",
    production: "portal",
    slotType: "thesis",
    contentType: "social_post",
    dbSlug: "scene_provocation",
    generation: {
      imageStyle: "Industry-relevant scene with a blank surface for text overlay. Whiteboard, billboard, chalkboard, or screen in a professional setting.",
      dimensions: { width: 1080, height: 1080 },
      minWords: 150,
      maxWords: 250,
      contentInstructions: `POST TYPE: Scene Provocation. A bold, provocative statement that challenges the status quo. Structure: hook (the bold claim) then why this matters then evidence or experience backing it up then what should change then a call to debate. Tone: confident, slightly confrontational. The hook should be something you would write on a whiteboard in a meeting to make people stop and think.`,
    },
  },
  {
    slug: "case_study",
    label: "Case Study",
    description: "\"Here's what happened when we did X.\" Real results with specific details. 200-350 words.",
    archetype: "quote_card_amber",
    color: "#D97706",
    visualTag: "Quote Card",
    ecosystemRole: "Social proof that converts. Shows real outcomes, not theoretical benefits. The post people send to their boss.",
    weekdayHint: "Tuesday",
    medium: "image",
    production: "portal",
    slotType: "thesis",
    contentType: "social_post",
    dbSlug: "case_study",
    generation: {
      imageStyle: "Flat solid amber (#D97706) background, edge to edge. Bold italic white text centred in middle third. Max 12 words. No scenes, people, objects, gradients, textures.",
      dimensions: { width: 1080, height: 1080 },
      minWords: 200,
      maxWords: 350,
      contentInstructions: `POST TYPE: Case Study. "Here's what happened when we did X." Structure: hook (the result, in one line) then the starting situation then what changed then the specific, real outcome then the transferable lesson. Tone: concrete, specific, proof over promise. No vague claims, name the real detail.`,
    },
  },
  {
    slug: "poll_question",
    label: "Poll / Question",
    description: "One sharp question with 2-4 options. Drives comments and votes. 30-60 words.",
    archetype: "text_only",
    color: "#8B5CF6",
    visualTag: "Text Only",
    ecosystemRole: "Highest engagement format on LinkedIn. Gets your audience talking and reveals what they actually think.",
    weekdayHint: "Wednesday",
    medium: "text",
    production: "portal",
    slotType: "thesis",
    contentType: "social_post",
    dbSlug: "poll_question",
    generation: {
      imageStyle: "SKIP",
      minWords: 30,
      maxWords: 60,
      contentInstructions: `POST TYPE: Poll / Question. One sharp question with 2-4 options. Structure: one line of context, then the question, then the options listed clearly. Tone: direct, curious, no preamble. Maximum 60 words including the options.`,
    },
  },
  {
    slug: "data_point",
    label: "Data Point",
    description: "One compelling stat that reframes the conversation. 100-200 words.",
    archetype: "quote_card_teal",
    color: "#0D9488",
    visualTag: "Quote Card",
    ecosystemRole: "The shareable stat. One number that makes people stop scrolling and rethink their assumptions.",
    weekdayHint: "Thursday",
    medium: "image",
    production: "portal",
    slotType: "thesis",
    contentType: "social_post",
    dbSlug: "data_point",
    generation: {
      imageStyle: "Flat solid teal (#0D9488) background, edge to edge. Oversized bold white statistic centred, small supporting line beneath. No scenes, people, objects, gradients, textures.",
      dimensions: { width: 1080, height: 1080 },
      minWords: 100,
      maxWords: 200,
      contentInstructions: `POST TYPE: Data Point. One compelling, sourced stat that reframes the conversation. Structure: the stat as the hook then why it matters then what it means for the reader then a closing thought. Tone: precise, evidence-led. Never fabricate a statistic; only use one you have a real source for.`,
    },
  },
  {
    slug: "meme",
    label: "Meme",
    description: "One industry inside joke a week on the founder feed.",
    archetype: "meme_card",
    color: "#111827",
    visualTag: "Meme",
    ecosystemRole: "One industry inside joke a week on the founder feed. Signals you are close enough to the work to laugh at it.",
    weekdayHint: "Saturday",
    medium: "image",
    production: "mac",
    slotType: "meme",
    contentType: "meme",
    dbSlug: "meme",
    generation: {
      minWords: 4,
      maxWords: 20,
      contentInstructions: `POST TYPE: Meme. One industry inside joke. Write a setup line and a punchline, under 20 words combined for the on-image text. No statistics. No client names. No emojis. The image generator is not yet wired for this archetype: return the text and mark the image as pending rather than failing.`,
    },
  },
  {
    slug: "mini_infographic",
    label: "Mini infographic",
    description: "A house-drawn four-panel: an escalation or comparison from the week's thesis, on the founder feed.",
    archetype: "infographic_card",
    color: "#A27BF9",
    visualTag: "Infographic",
    ecosystemRole: "Restates the week's argument as one structured image people save and share. Sunday on the founder feed.",
    weekdayHint: "Sunday",
    medium: "image",
    production: "mac",
    slotType: "meme",
    contentType: "social_post",
    dbSlug: "mini_infographic",
    generation: {
      minWords: 8,
      maxWords: 40,
      contentInstructions: `POST TYPE: Mini infographic. Four panels that escalate or compare, each under 10 words, drawn from the week's thesis. A repeated label on the left ("Sales asks for", "The board expects") and the escalating line on the right. No statistics unless sourced. No client names. No emojis.`,
    },
  },
  {
    slug: "podcast_hook_clip",
    label: "Podcast hook clip",
    description: "A 30-60 second clip built from the podcast library, produced on the Mac.",
    archetype: "video_podcast_hook",
    color: "#7C3AED",
    visualTag: "Video",
    ecosystemRole: "Turns a strong podcast moment into a scroll-stopping short clip.",
    medium: "video",
    production: "mac",
    slotType: "video",
    contentType: "video",
    dbSlug: "podcast_hook_clip",
    generation: {},
    brief: {
      hook: "A question of 10 seconds or less",
      layout: "One speaker in frame, purple wipe between hook and answer",
      captions: "Burned in, active word highlighted",
      source: "Podcast library",
    },
  },
  {
    slug: "talking_head",
    label: "Thought of the day",
    description: "A 30-60 second vertical talking-head clip, produced on the Mac.",
    archetype: "video_talking_head",
    color: "#7C3AED",
    visualTag: "Video",
    ecosystemRole: "A short, direct thought straight to camera. Builds familiarity between longer content beats.",
    medium: "video",
    production: "mac",
    slotType: "video",
    contentType: "video",
    dbSlug: "talking_head",
    generation: {},
    brief: {
      hook: "Bold statement in the first 5 seconds",
      layout: "Vertical 1080x1920 phone clip",
      captions: "Burned in at chest height",
      source: "Phone clip uploaded on Clips",
    },
  },
  {
    slug: "story_video",
    label: "Story video",
    description: "A 40-90 second B-roll story video carrying one sourced number, produced on the Mac.",
    archetype: "video_story",
    color: "#7C3AED",
    visualTag: "Video",
    ecosystemRole: "Fast-cut B-roll story that carries one sourced number. High-attention pattern interrupt in the feed.",
    medium: "video",
    production: "mac",
    slotType: "video",
    contentType: "video",
    dbSlug: "story_video",
    generation: {},
    brief: {
      hook: "A question of 10 seconds or less carrying one sourced number",
      layout: "Full-screen B-roll, new shot every 1 to 1.5 seconds, 9:16 and 1:1",
      captions: "None burned in; .srt delivered",
      source: "Story bank plus B-roll",
    },
  },
  {
    slug: "reaction_ranking",
    label: "Reaction or ranking video",
    description: "A 30-60 second reaction or ranking video. Michael films it, the platform holds the script and brief.",
    archetype: "video_reaction_ranking",
    color: "#7C3AED",
    visualTag: "Video",
    ecosystemRole: "Reaction or ranking format for high-engagement, opinionated short-form video.",
    medium: "video",
    production: "manual",
    slotType: "video",
    contentType: "video_script",
    dbSlug: "reaction_ranking",
    generation: {
      minWords: 60,
      maxWords: 150,
      contentInstructions: `POST TYPE: Reaction or ranking video. Write a script only, not on-image text. Structure: a "Ranking ..." title or the best example first, then the ranked or reacted-to items with one line of commentary each, then a closing line. Tone: opinionated, quick, no hedging.`,
    },
    brief: {
      hook: "'Ranking ...' title or the best example first",
      layout: "Head and shoulders top, material bottom, captions centre",
      captions: "Burned in centre",
      source: "Michael films; platform holds the script and brief",
    },
  },
];

export function getPostType(slug: string): PostTypeOption | undefined {
  return POST_TYPES.find((pt) => pt.slug === slug);
}

export const POST_TYPE_SLUGS: string[] = POST_TYPES.map((pt) => pt.slug);

export function isVideoType(slug: string): boolean {
  return getPostType(slug)?.medium === "video";
}

export const WEEKLY_RHYTHMS = {
  light: {
    postsPerWeek: 3,
    label: "Light (3/week)",
    suggested: ["insight", "launch_story", "founder_friday"],
  },
  standard: {
    postsPerWeek: 5,
    label: "Standard (5/week)",
    suggested: ["insight", "launch_story", "if_i_was", "contrarian", "founder_friday"],
  },
  intensive: {
    postsPerWeek: 7,
    label: "Intensive (7/week)",
    suggested: ["blog_teaser", "insight", "launch_story", "if_i_was", "contrarian", "founder_friday", "personal_update"],
  },
  ecosystem: {
    postsPerWeek: 12,
    label: "Full Ecosystem (12/week)",
    suggested: ["blog_teaser", "insight", "launch_story", "case_study", "if_i_was", "poll_question", "contrarian", "data_point", "tactical", "founder_friday", "personal_update", "scene_provocation"],
  },
} as const;
