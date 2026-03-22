/**
 * Structured Voice Profile
 *
 * Mirrors the Company Blueprint Template Section C (Voice & Tone)
 * and the SOURCE_CONTEXT.md voice specification used by the atoms.
 *
 * Stored as JSONB in company_voice_profiles.structured_voice
 */

export interface ToneSpectrum {
  formal_to_casual: 1 | 2 | 3 | 4 | 5;       // 1=very formal, 5=very casual
  serious_to_playful: 1 | 2 | 3 | 4 | 5;     // 1=very serious, 5=very playful
  authoritative_to_humble: 1 | 2 | 3 | 4 | 5; // 1=very authoritative, 5=very humble
  reserved_to_enthusiastic: 1 | 2 | 3 | 4 | 5; // 1=very reserved, 5=very enthusiastic
  cautious_to_bold: 1 | 2 | 3 | 4 | 5;       // 1=very cautious, 5=very bold
}

export interface FormattingRules {
  spelling: "uk" | "us";
  paragraph_max_lines: number;       // e.g. 2 for short-form, 4 for articles
  em_dashes_allowed: boolean;
  exclamation_marks_allowed: boolean;
  emoji_in_body: boolean;
  hashtags_in_body: boolean;
  oxford_comma: boolean;
  contractions_allowed: boolean;     // "don't" vs "do not"
  numbers_style: "digits_for_stats" | "always_digits" | "always_words";
  other_rules: string[];             // free-form additional rules
}

export type HumourType =
  | "ironic_juxtaposition"
  | "self_deprecating"
  | "deadpan_observation"
  | "warm_understatement"
  | "gentle_teasing"
  | "dry_callback"
  | "shared_dysfunction"
  | "none";

export interface WritingSample {
  text: string;
  post_type?: string;    // e.g. "insight", "founder_friday", "contrarian"
  label?: string;        // e.g. "Monday Mistake Post"
}

export interface BannedWordsCategory {
  category: string;      // e.g. "corporate", "gushing", "ai_buzzwords"
  words: string[];
}

export interface StructuredVoice {
  // C1: Voice in Three Words
  voice_three_words: [string, string, string];

  // C2: Voice Character Description
  voice_character: string;

  // C6: Tone Spectrum (5 scales)
  tone_spectrum: ToneSpectrum;

  // C5: Formatting Rules
  formatting_rules: FormattingRules;

  // Humour
  humour_types: HumourType[];
  humour_mandatory: boolean;

  // Hedging / Directness
  hedging_preference: "tentative" | "balanced" | "direct";
  hedging_phrases: string[];      // Required phrases like "I think there's...", "Fair to say..."

  // C3: Signature Devices
  signature_devices: {
    bracketed_asides: boolean;
    question_tags: boolean;
    british_interjections: boolean;
    understatement: boolean;
    other: string[];
  };

  // C4: Banned Words (categorised)
  banned_words: BannedWordsCategory[];

  // C7: Writing Samples
  writing_samples: WritingSample[];

  // Opening Rules
  opening_rules: {
    never_start_with_i: boolean;
    preferred_openers: string[];   // e.g. "What I keep seeing...", "There's a thing..."
  };

  // Peer Positioning
  peer_positioning: "peer" | "expert_above" | "student_below";
  peer_positioning_notes: string;

  // Regional texture
  regional_texture: "british" | "american" | "neutral" | "other";
  regional_notes: string;
}

/**
 * Default empty structured voice profile
 */
export const DEFAULT_STRUCTURED_VOICE: StructuredVoice = {
  voice_three_words: ["", "", ""],
  voice_character: "",
  tone_spectrum: {
    formal_to_casual: 3,
    serious_to_playful: 3,
    authoritative_to_humble: 3,
    reserved_to_enthusiastic: 3,
    cautious_to_bold: 3,
  },
  formatting_rules: {
    spelling: "uk",
    paragraph_max_lines: 2,
    em_dashes_allowed: false,
    exclamation_marks_allowed: false,
    emoji_in_body: false,
    hashtags_in_body: false,
    oxford_comma: true,
    contractions_allowed: true,
    numbers_style: "digits_for_stats",
    other_rules: [],
  },
  humour_types: [],
  humour_mandatory: false,
  hedging_preference: "balanced",
  hedging_phrases: [],
  signature_devices: {
    bracketed_asides: false,
    question_tags: false,
    british_interjections: false,
    understatement: false,
    other: [],
  },
  banned_words: [
    { category: "Corporate", words: [] },
    { category: "Gushing", words: [] },
    { category: "AI Buzzwords", words: [] },
  ],
  writing_samples: [],
  opening_rules: {
    never_start_with_i: false,
    preferred_openers: [],
  },
  peer_positioning: "peer",
  peer_positioning_notes: "",
  regional_texture: "neutral",
  regional_notes: "",
};
