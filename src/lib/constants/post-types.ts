export interface PostTypeOption {
  slug: string;
  label: string;
  description: string;
  archetype: string;
  color: string;
  visualTag?: string;
  ecosystemRole: string;
  weekdayHint?: string;
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
  },
  {
    slug: "scene_provocation",
    label: "Scene Provocation",
    description: "Bold statement on a whiteboard, billboard, or real-world surface. 150-250 words.",
    archetype: "scene_quote",
    color: "#1E3A5F",
    visualTag: "Scene Quote",
    ecosystemRole: "Visual pattern interrupt. The image-first post that stops the scroll before the copy even loads.",
  },
];

export function getPostType(slug: string): PostTypeOption | undefined {
  return POST_TYPES.find((pt) => pt.slug === slug);
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
    postsPerWeek: 9,
    label: "Full Ecosystem (9/week)",
    suggested: ["blog_teaser", "insight", "launch_story", "if_i_was", "contrarian", "tactical", "founder_friday", "personal_update", "scene_provocation"],
  },
} as const;
