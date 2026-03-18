/**
 * Topic Auto-Assignment Algorithm
 *
 * Handles two generation modes:
 *
 * COHESIVE MODE:
 * - Week has ONE subject (e.g., "patient referral pathways")
 * - Each posting slot gets a unique ANGLE on that subject
 *   derived from the post type's structural template
 * - Topic bank provides supporting proof points
 *
 * VARIETY MODE:
 * - Each posting slot gets a different topic from the bank
 * - Matched by pillar, then audience_theme, then recency
 * - Topics marked as used after assignment
 */

import type { PostingSlotWithType, TopicBankEntry } from "@/types/database";

// ============================================================
// Types
// ============================================================

export interface SlotAssignment {
  slotId: string;
  slotLabel: string;
  dayOfWeek: number;
  scheduledTime: string;
  postTypeSlug: string;
  postTypeLabel: string;
  templateInstructions: string | null;
  wordCountMin: number | null;
  wordCountMax: number | null;
  imageArchetype: string | null;
  ctaUrl: string | null;
  ctaLinkText: string | null;
  // For variety mode: the assigned topic
  topicId: string | null;
  topicTitle: string;
  topicDescription: string | null;
  topicPillar: string | null;
  topicAudienceTheme: string | null;
  // For cohesive mode: the angle on the week's subject
  angle: string | null;
}

export interface AssignmentInput {
  slots: PostingSlotWithType[];
  unusedTopics: TopicBankEntry[];
  mode: "cohesive" | "variety";
  weekSubject?: string | null;
  weekPillar?: string | null;
  weekTheme?: string | null;
}

export interface AssignmentResult {
  assignments: SlotAssignment[];
  unassignedSlots: string[]; // slot IDs that couldn't be assigned
}

// ============================================================
// Day names for display
// ============================================================

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ============================================================
// Cohesive mode: angle generation
// ============================================================

/**
 * For cohesive mode, each post type has a natural angle template
 * that describes how it approaches ANY given subject.
 */
const POST_TYPE_ANGLES: Record<string, string> = {
  problem_post: "The common mistake companies make with {subject}",
  launch_story: "What 47 product launches taught us about {subject}",
  if_i_was: "If I was running your {subject} programme, here is what I would do differently",
  contrarian: "The popular approach to {subject} that actually backfires",
  tactical: "A practical framework for improving {subject} results",
  founder_friday: "The fantasy vs reality of {subject} in healthcare",
  weekend_personal: "A personal reflection connected to {subject}",
  blog_teaser: "This week on the blog: a deep dive into {subject}",
  blog_cta: "Read the full article on {subject}",
  triage_cta: "Want help with your {subject} strategy?",
  industry_news: "Recent developments that affect {subject}",
  blog_article: "Comprehensive guide to {subject}",
  linkedin_article: "In-depth analysis of {subject}",
};

function generateAngle(postTypeSlug: string, subject: string): string {
  const template = POST_TYPE_ANGLES[postTypeSlug];
  if (!template) return `Exploring ${subject}`;
  return template.replace(/\{subject\}/g, subject);
}

// ============================================================
// Variety mode: topic matching
// ============================================================

/**
 * Score a topic for a given slot based on pillar match and diversity.
 * Higher score = better fit.
 */
function scoreTopicForSlot(
  topic: TopicBankEntry,
  weekPillar: string | null,
  usedThemes: Set<string>
): number {
  let score = 0;

  // Pillar match (strongest signal)
  if (weekPillar && topic.pillar) {
    if (topic.pillar === weekPillar) score += 10;
    // Partial pillar match (e.g., week is P1+P2 and topic is P1)
    else if (weekPillar.includes(topic.pillar)) score += 5;
  }

  // Audience theme diversity (prefer themes not yet used this week)
  if (topic.audience_theme && !usedThemes.has(topic.audience_theme)) {
    score += 3;
  }

  // Slightly prefer topics with descriptions (more content to work with)
  if (topic.description) score += 1;

  return score;
}

// ============================================================
// Main assignment function
// ============================================================

export function assignTopicsToSlots(input: AssignmentInput): AssignmentResult {
  const { slots, unusedTopics, mode, weekSubject, weekPillar } = input;

  // Sort slots by day, then time
  const sortedSlots = [...slots].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return a.scheduled_time.localeCompare(b.scheduled_time);
  });

  const assignments: SlotAssignment[] = [];
  const unassignedSlots: string[] = [];

  if (mode === "cohesive" && weekSubject) {
    // ── Cohesive Mode ──────────────────────────────────────
    // Every slot gets the same subject but a different angle.
    // We also look for supporting topics from the bank.

    // Find topics related to the subject for proof points
    const subjectLower = weekSubject.toLowerCase();
    const relatedTopics = unusedTopics.filter(
      (t) =>
        t.title.toLowerCase().includes(subjectLower) ||
        (t.description && t.description.toLowerCase().includes(subjectLower))
    );
    // Use the first related topic as context, or create a synthetic one
    const primaryTopic = relatedTopics[0] || null;

    for (const slot of sortedSlots) {
      if (!slot.is_active) continue;
      const pt = slot.post_types;
      const angle = generateAngle(pt.slug, weekSubject);

      assignments.push({
        slotId: slot.id,
        slotLabel: slot.slot_label || `${DAY_NAMES[slot.day_of_week]} ${slot.scheduled_time.slice(0, 5)}`,
        dayOfWeek: slot.day_of_week,
        scheduledTime: slot.scheduled_time,
        postTypeSlug: pt.slug,
        postTypeLabel: pt.label,
        templateInstructions: pt.template_instructions,
        wordCountMin: pt.word_count_min,
        wordCountMax: pt.word_count_max,
        imageArchetype: slot.image_archetype || pt.default_image_archetype,
        ctaUrl: slot.cta_url,
        ctaLinkText: slot.cta_link_text,
        topicId: primaryTopic?.id || null,
        topicTitle: weekSubject,
        topicDescription: primaryTopic?.description || `Exploring ${weekSubject} from the ${pt.label} perspective`,
        topicPillar: primaryTopic?.pillar || weekPillar || null,
        topicAudienceTheme: primaryTopic?.audience_theme || null,
        angle,
      });
    }
  } else {
    // ── Variety Mode ───────────────────────────────────────
    // Each slot gets a different topic from the bank.

    const availableTopics = [...unusedTopics];
    const usedThemes = new Set<string>();
    const takenTopicIds = new Set<string>();

    for (const slot of sortedSlots) {
      if (!slot.is_active) continue;
      const pt = slot.post_types;

      // Score all available topics for this slot
      const candidates = availableTopics
        .filter((t) => !takenTopicIds.has(t.id))
        .map((t) => ({
          topic: t,
          score: scoreTopicForSlot(t, weekPillar ?? null, usedThemes),
        }))
        .sort((a, b) => b.score - a.score);

      const bestCandidate = candidates[0]?.topic || null;

      if (bestCandidate) {
        takenTopicIds.add(bestCandidate.id);
        if (bestCandidate.audience_theme) {
          usedThemes.add(bestCandidate.audience_theme);
        }

        assignments.push({
          slotId: slot.id,
          slotLabel: slot.slot_label || `${DAY_NAMES[slot.day_of_week]} ${slot.scheduled_time.slice(0, 5)}`,
          dayOfWeek: slot.day_of_week,
          scheduledTime: slot.scheduled_time,
          postTypeSlug: pt.slug,
          postTypeLabel: pt.label,
          templateInstructions: pt.template_instructions,
          wordCountMin: pt.word_count_min,
          wordCountMax: pt.word_count_max,
          imageArchetype: slot.image_archetype || pt.default_image_archetype,
          ctaUrl: slot.cta_url,
          ctaLinkText: slot.cta_link_text,
          topicId: bestCandidate.id,
          topicTitle: bestCandidate.title,
          topicDescription: bestCandidate.description,
          topicPillar: bestCandidate.pillar,
          topicAudienceTheme: bestCandidate.audience_theme,
          angle: null,
        });
      } else {
        unassignedSlots.push(slot.id);
      }
    }
  }

  return { assignments, unassignedSlots };
}
