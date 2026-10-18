export const audienceIds = ["hospitality", "professional", "healthcare", "agency"] as const;
export type AudienceId = (typeof audienceIds)[number];
export type PostStatus = "ready" | "review" | "draft";
export interface ExamplePost { day: string; title: string; format: string; asset: string; status: PostStatus; image?: string }
export interface Audience {
  label: string; description: string; sourceLabel: string; source: string; inputs: readonly string[];
  weekTitle: string; weekNote: string; posts: readonly ExamplePost[];
  sectionTitle: string; sectionEmphasis: string; sectionDescription: string; sourceSummary: string;
  reviewTitle: string; reviewDescription: string; reviewChecks: readonly string[]; reviewNote: string;
}

export const audiences: Record<AudienceId, Audience> = {
  hospitality: {
    label: "Bars & restaurants",
    description: "Plan posts around your menu, events and the photos you already have.",
    sourceLabel: "Your voice update",
    source: "“A new lunch menu, live music on Friday and a few photos from the kitchen.”",
    inputs: ["Spoken or typed updates", "Your photos", "Events and offers"],
    weekTitle: "This week at your place.",
    weekNote: "Something new. A reason to visit. A reminder at the right time.",
    posts: [
      { day: "TUE", title: "Something new on the lunch menu", format: "Menu post", asset: "Photo + caption", status: "ready", image: "/landing-preview/seasonal-lunch.webp" },
      { day: "THU", title: "Live music this Friday", format: "What’s on", asset: "Event card", status: "review", image: "/landing-preview/restaurant-music.webp" },
      { day: "SAT", title: "Make a little room for the weekend", format: "Weekend reminder", asset: "Photo + caption", status: "draft", image: "/landing-preview/restaurant-chef.webp" },
    ],
    sectionTitle: "A week ahead.", sectionEmphasis: "Without the scramble.",
    sectionDescription: "Share what’s happening. See how it fits together. Check the posts before they go anywhere.",
    sourceSummary: "Talk through the week or type an update. Add your photos and the dates that matter.",
    reviewTitle: "Your place. Your final say.",
    reviewDescription: "Check the words, images and dates together. Ask for changes, or approve what is ready to share.",
    reviewChecks: ["The right words and photos", "The right days and times", "Only approved posts in your export"],
    reviewNote: "You decide which posts are ready to share.",
  },
  professional: {
    label: "Professional services",
    description: "Turn your expertise, brand voice and business priorities into a week of posts.",
    sourceLabel: "Your voice update",
    source: "“A question about project briefs, a new guide and an introduction to the team.”",
    inputs: ["Your expertise", "Brand voice", "Business priorities"],
    weekTitle: "A week with a clear purpose.",
    weekNote: "Useful advice. A deeper read. The people behind your business.",
    posts: [
      { day: "MON", title: "A clearer brief, a better start", format: "Expert insight", asset: "Quote card", status: "ready" },
      { day: "WED", title: "What to bring to a first meeting", format: "Practical guide", asset: "Carousel", status: "review" },
      { day: "FRI", title: "Meet the people behind the work", format: "Team introduction", asset: "Photo + caption", status: "draft" },
    ],
    sectionTitle: "Your expertise.", sectionEmphasis: "A more useful week.",
    sectionDescription: "Connect the things you know with the questions your audience is asking. Give each post a purpose.",
    sourceSummary: "Bring your business priorities, audience questions and point of view, supported by your brand voice.",
    reviewTitle: "Sounds like your business?",
    reviewDescription: "Review the week as a whole, then refine each post and visual. Keep the language, detail and tone true to your business.",
    reviewChecks: ["Your voice and point of view", "A mix of useful content", "Your approval before sharing"],
    reviewNote: "You decide which posts are ready to share.",
  },
  healthcare: {
    label: "Healthcare",
    description: "Plan content from approved messages, with room for qualified human review.",
    sourceLabel: "Your voice update",
    source: "“Our approved messages, a patient information topic and an introduction to the team.”",
    inputs: ["Approved claims and messages", "Audience and market", "Company policies"],
    weekTitle: "A week with care built in.",
    weekNote: "Clear information. Consistent messages. Space for qualified review.",
    posts: [
      { day: "MON", title: "Questions to ask before an appointment", format: "Patient information", asset: "Information card", status: "review" },
      { day: "WED", title: "Meet the clinical team", format: "Team introduction", asset: "Photo + caption", status: "draft" },
      { day: "FRI", title: "A guide to your first visit", format: "Service information", asset: "Guide teaser", status: "review" },
    ],
    sectionTitle: "Your content.", sectionEmphasis: "Care at every step.",
    sectionDescription: "Start with approved messages. Plan for your audience and market. Keep qualified review in the process.",
    sourceSummary: "Bring your approved claims, messaging and company policies into the brief, alongside the audience and market.",
    reviewTitle: "Support for your qualified reviewer.",
    reviewDescription: "AI-assisted checks flag sentence-level concerns and suggest edits. Compare the draft with your approved messages and read the review report before human approval.",
    reviewChecks: ["Company-approved claims and messages", "Sentence flags and suggested edits", "A review report for your reviewer"],
    reviewNote: "AI-assisted review supports human judgement. It does not certify or guarantee compliance.",
  },
  agency: {
    label: "Agencies",
    description: "Keep each client’s voice, priorities and assets together in one weekly plan.",
    sourceLabel: "Your voice update",
    source: "“The client’s priorities, brand voice, approved assets and topics for the week.”",
    inputs: ["Client strategy", "Each brand’s voice", "Approved assets"],
    weekTitle: "One client. A joined-up week.",
    weekNote: "A consistent voice. Varied content. One programme to review.",
    posts: [
      { day: "MON", title: "The question customers keep asking", format: "Client insight", asset: "Quote card", status: "ready" },
      { day: "WED", title: "A practical guide to getting started", format: "Guide teaser", asset: "Carousel", status: "review" },
      { day: "FRI", title: "The people behind the business", format: "Brand story", asset: "Photo + caption", status: "draft" },
    ],
    sectionTitle: "Client content.", sectionEmphasis: "A clearer way through.",
    sectionDescription: "Keep each client’s strategy, voice and content together, from the weekly brief to the review.",
    sourceSummary: "Start with the client’s strategy, weekly priorities and approved assets. Keep the programme specific to their brand.",
    reviewTitle: "A clear handover for each client.",
    reviewDescription: "Review posts and assets as a connected programme. Collect changes and approval before preparing the content to share.",
    reviewChecks: ["The right strategy and voice", "Posts and assets in one week", "Clear review and approval states"],
    reviewNote: "Regulated client work can also use AI-assisted checks to support the responsible human reviewer.",
  },
};

/** Repeated or unknown query values resolve predictably to a supported audience. */
export function parseAudience(value: unknown): AudienceId {
  const candidate: unknown = Array.isArray(value) ? value[0] : value;
  return audienceIds.some((id) => id === candidate) ? candidate as AudienceId : "hospitality";
}
export const platformUrl = "https://agency-review-portal.vercel.app";
/** Carries context in the link only; the existing signup does not consume it. */
export function signupUrlForAudience(audience: AudienceId): string { return `${platformUrl}/signup?audience=${audience}`; }
