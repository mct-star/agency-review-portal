export const audienceIds = ["hospitality", "professional", "healthcare", "agency"] as const;
export type AudienceId = (typeof audienceIds)[number];
export type PostStatus = "ready" | "review" | "draft";
export interface ExamplePost { day: string; title: string; format: string; asset: string; status: PostStatus; image?: string }
export interface SocialExample { format: string; selector: string; title: string; caption: string; image?: string; imageAlt?: string; visualKicker: string; visualTitle: string; visualDetails?: readonly string[]; cta?: string; }
export interface Audience {
  label: string; description: string; sourceLabel: string; source: string; inputs: readonly string[];
  weekTitle: string; weekNote: string; posts: readonly ExamplePost[];
  sectionTitle: string; sectionEmphasis: string; sectionDescription: string; sourceSummary: string;
  reviewTitle: string; reviewDescription: string; reviewChecks: readonly string[]; reviewNote: string;
  socialProfile: { name: string; handle: string; initials: string };
  socialPosts: readonly SocialExample[];
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
    socialProfile: { name: "Your restaurant", handle: "@yourrestaurant", initials: "YR" },
    socialPosts: [
      { format: "Menu post", selector: "Menu", title: "Lunch just got a little brighter.", caption: "A new seasonal menu, made for a slower midday.", image: "/landing-preview/seasonal-lunch.webp", imageAlt: "Illustrative seasonal lunch at a neighbourhood restaurant", visualKicker: "NEW ON THE MENU", visualTitle: "Made for a slower midday", cta: "See the menu" },
      { format: "What’s on", selector: "Event", title: "Live music this Friday.", caption: "Settle in for an easy Friday evening with live music and good food.", image: "/landing-preview/restaurant-music.webp", imageAlt: "Illustrative live music evening at a restaurant", visualKicker: "THIS FRIDAY", visualTitle: "Live music. Good company.", cta: "See event details" },
      { format: "Weekend reminder", selector: "Weekend", title: "A little room for the weekend.", caption: "Make time for a good meal and an easy evening.", image: "/landing-preview/restaurant-chef.webp", imageAlt: "Illustrative chef preparing lunch in a restaurant kitchen", visualKicker: "THIS WEEKEND", visualTitle: "Good food. Good company.", cta: "Book a table" },
    ],
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
    socialProfile: { name: "Your business", handle: "@yourbusiness", initials: "YB" },
    socialPosts: [
      { format: "Expert insight", selector: "Insight", title: "A clearer brief makes a better start.", caption: "A useful first brief sets out the decision to make, the people involved and what the work needs to achieve.", visualKicker: "A BETTER FIRST BRIEF", visualTitle: "Start with the decision.", visualDetails: ["What needs to change?", "Who needs to be involved?", "What would a useful outcome be?"] },
      { format: "Practical guide", selector: "Guide", title: "What to bring to a first meeting.", caption: "A few details can help make the first conversation more useful. Save this checklist for your next meeting.", visualKicker: "FIRST MEETING GUIDE", visualTitle: "Three things to bring", visualDetails: ["Your main question", "Useful background", "The people involved"] },
      { format: "Team introduction", selector: "Team", title: "Meet the people behind the work.", caption: "Good work takes thoughtful people. Here is a little about how our team approaches a new brief.", visualKicker: "A NOTE FROM THE TEAM", visualTitle: "Good work starts with a good conversation.", visualDetails: ["Listen first", "Make the brief clear", "Agree the next step"] },
    ],
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
    socialProfile: { name: "Your organisation", handle: "@yourorganisation", initials: "YO" },
    socialPosts: [
      { format: "Service information", selector: "Visit", title: "What to expect at your first visit.", caption: "Our approved information explains what to expect, where to find practical details and how to contact our team with questions.", visualKicker: "PRACTICAL INFORMATION", visualTitle: "Your first visit", visualDetails: ["What to expect", "Where to find practical details", "How to contact the team"], cta: "Read the information" },
      { format: "Patient information", selector: "Questions", title: "Questions to ask before an appointment.", caption: "A simple reminder to help people find the practical information they need before a visit.", visualKicker: "APPROVED INFORMATION", visualTitle: "Before your appointment", visualDetails: ["Check the appointment details", "Write down practical questions", "Contact the team if you need help"] },
      { format: "Team introduction", selector: "Team", title: "Meet the team supporting your visit.", caption: "Find out who you may speak with and where to get practical information about your visit.", visualKicker: "MEET THE TEAM", visualTitle: "Here to help with practical details", visualDetails: ["Who you may speak with", "Where to find visit information", "How to contact the organisation"] },
    ],
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
    socialProfile: { name: "Your client", handle: "@yourclient", initials: "YC" },
    socialPosts: [
      { format: "Client insight", selector: "Priorities", title: "Start with the client’s priorities.", caption: "A useful content brief keeps the client strategy, brand voice and approved assets close to each draft.", visualKicker: "THE CLIENT BRIEF", visualTitle: "Keep the priorities in view.", visualDetails: ["Client strategy", "Brand voice", "Approved assets"] },
      { format: "Guide teaser", selector: "Review", title: "A quick check before each draft.", caption: "Before a post moves to review, check the brief, the voice and the source material together.", visualKicker: "A CLEAR REVIEW", visualTitle: "Three checks for each draft", visualDetails: ["Does it fit the strategy?", "Does it sound like the brand?", "Are the assets approved?"] },
      { format: "Brand story", selector: "Weekly plan", title: "A weekly plan with a clear purpose.", caption: "A mix of useful content, shaped around the client’s priorities and ready for a considered review.", visualKicker: "CLIENT CONTENT", visualTitle: "One programme. A joined-up week.", visualDetails: ["A clear point of view", "A considered mix", "A shared review"] },
    ],
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
