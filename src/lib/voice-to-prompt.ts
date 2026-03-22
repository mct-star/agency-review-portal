import type { StructuredVoice, ToneSpectrum } from "@/types/voice";

/**
 * Converts a structured voice profile into detailed prompt instructions
 * for content generation. This is injected into every AI generation call.
 */

const TONE_LABELS: Record<keyof ToneSpectrum, [string, string]> = {
  formal_to_casual: ["Formal", "Casual"],
  serious_to_playful: ["Serious", "Playful"],
  authoritative_to_humble: ["Authoritative", "Humble"],
  reserved_to_enthusiastic: ["Reserved", "Enthusiastic"],
  cautious_to_bold: ["Cautious", "Bold"],
};

function describeTonePosition(value: number, labels: [string, string]): string {
  if (value === 1) return `Very ${labels[0].toLowerCase()}`;
  if (value === 2) return `Leans ${labels[0].toLowerCase()}`;
  if (value === 3) return `Balanced between ${labels[0].toLowerCase()} and ${labels[1].toLowerCase()}`;
  if (value === 4) return `Leans ${labels[1].toLowerCase()}`;
  if (value === 5) return `Very ${labels[1].toLowerCase()}`;
  return "Balanced";
}

const HUMOUR_DESCRIPTIONS: Record<string, string> = {
  ironic_juxtaposition: "Ironic juxtaposition (placing serious and absurd side-by-side)",
  self_deprecating: "Self-deprecating asides (gentle jokes about own mistakes)",
  deadpan_observation: "Deadpan observations (stating the obvious with dry delivery)",
  warm_understatement: "Warmth through understatement (expressing care via restraint)",
  gentle_teasing: "Gentle teasing (affectionate ribbing of the industry or peers)",
  dry_callback: "Dry callbacks (referencing earlier points with deadpan timing)",
  shared_dysfunction: "Shared recognition of dysfunction (we all know this is broken)",
};

export function structuredVoiceToPrompt(voice: StructuredVoice): string {
  const sections: string[] = [];

  // Voice identity
  if (voice.voice_three_words.filter(Boolean).length > 0) {
    sections.push(`VOICE IDENTITY: ${voice.voice_three_words.filter(Boolean).join(", ")}`);
  }
  if (voice.voice_character) {
    sections.push(`VOICE CHARACTER: ${voice.voice_character}`);
  }

  // Tone spectrum
  const toneLines = Object.entries(voice.tone_spectrum).map(([key, val]) => {
    const labels = TONE_LABELS[key as keyof ToneSpectrum];
    return `- ${labels[0]} ↔ ${labels[1]}: ${describeTonePosition(val, labels)}`;
  });
  sections.push(`TONE POSITIONING:\n${toneLines.join("\n")}`);

  // Hedging / directness
  if (voice.hedging_preference === "tentative") {
    sections.push(
      `HEDGING LANGUAGE (CRITICAL): This voice uses tentative, hedged language. NEVER use declarative statements like "That's crucial" or "You've nailed it". Instead use phrases like:\n${
        voice.hedging_phrases.length > 0
          ? voice.hedging_phrases.map((p) => `- "${p}"`).join("\n")
          : '- "I think there\'s..."\n- "Probably worth..."\n- "Fair to say..."\n- "What I\'d suggest is..."'
      }`
    );
  } else if (voice.hedging_preference === "direct") {
    sections.push("DIRECTNESS: This voice is direct and declarative. State opinions clearly without hedging.");
  }

  // Humour
  if (voice.humour_types.length > 0 && !voice.humour_types.includes("none")) {
    const humourDescs = voice.humour_types
      .map((t) => HUMOUR_DESCRIPTIONS[t] || t)
      .join("\n- ");
    sections.push(
      `HUMOUR STYLE${voice.humour_mandatory ? " (MANDATORY — content without warmth/humour sounds like someone else wrote it)" : ""}:\n- ${humourDescs}`
    );
  }

  // Signature devices
  const deviceLines: string[] = [];
  if (voice.signature_devices.bracketed_asides) deviceLines.push("Bracketed asides are MANDATORY in every post. E.g. \"(He wasn't wrong to be annoyed.)\"");
  if (voice.signature_devices.question_tags) deviceLines.push("Uses question tags: \"Tough life, isn't it?\"");
  if (voice.signature_devices.british_interjections) deviceLines.push("British interjections: \"Blimey...\", \"Right then...\", \"Fair enough\"");
  if (voice.signature_devices.understatement) deviceLines.push("Masters understatement — expresses strong feelings through restraint");
  if (voice.signature_devices.other.length > 0) {
    deviceLines.push(...voice.signature_devices.other);
  }
  if (deviceLines.length > 0) {
    sections.push(`SIGNATURE DEVICES:\n${deviceLines.map((d) => `- ${d}`).join("\n")}`);
  }

  // Opening rules
  const openingLines: string[] = [];
  if (voice.opening_rules.never_start_with_i) {
    openingLines.push("NEVER open a post with \"I\" as the first word. Start with an observation: \"What I keep seeing...\" not \"I keep seeing...\"");
  }
  if (voice.opening_rules.preferred_openers.length > 0) {
    openingLines.push(`Preferred opener patterns: ${voice.opening_rules.preferred_openers.map((o) => `"${o}"`).join(", ")}`);
  }
  if (openingLines.length > 0) {
    sections.push(`OPENING RULES:\n${openingLines.map((l) => `- ${l}`).join("\n")}`);
  }

  // Peer positioning
  if (voice.peer_positioning === "peer") {
    sections.push(
      `PEER POSITIONING: Write as a peer, not a fan or authority figure. "That's interesting" not "What an incredible achievement". Alongside, not above. Join in, don't comment on.${
        voice.peer_positioning_notes ? ` ${voice.peer_positioning_notes}` : ""
      }`
    );
  } else if (voice.peer_positioning === "expert_above") {
    sections.push("POSITIONING: Write as a knowledgeable expert sharing insights from experience.");
  }

  // Formatting rules
  const fmtLines: string[] = [];
  fmtLines.push(`Spelling: ${voice.formatting_rules.spelling === "uk" ? "UK English (organisation, recognise, colour)" : "US English"}`);
  if (!voice.formatting_rules.em_dashes_allowed) fmtLines.push("NO em-dashes (—) or en-dashes (–) anywhere. Use commas, full stops, or line breaks instead.");
  if (!voice.formatting_rules.exclamation_marks_allowed) fmtLines.push("NO exclamation marks (unless genuinely warranted, which is almost never).");
  if (!voice.formatting_rules.emoji_in_body) fmtLines.push("NO emoji in body copy.");
  if (!voice.formatting_rules.hashtags_in_body) fmtLines.push("NO hashtags in body copy (hashtags go at the end only).");
  if (voice.formatting_rules.oxford_comma) fmtLines.push("Use Oxford comma.");
  if (!voice.formatting_rules.contractions_allowed) fmtLines.push("NO contractions in long-form content. Write \"do not\" not \"don't\", \"cannot\" not \"can't\".");
  if (voice.formatting_rules.paragraph_max_lines > 0) fmtLines.push(`Maximum ${voice.formatting_rules.paragraph_max_lines} lines per paragraph.`);
  if (voice.formatting_rules.numbers_style === "digits_for_stats") fmtLines.push("Numbers: digits for statistics (73%), words for prose (three things).");
  if (voice.formatting_rules.other_rules.length > 0) {
    fmtLines.push(...voice.formatting_rules.other_rules);
  }
  sections.push(`FORMATTING RULES:\n${fmtLines.map((l) => `- ${l}`).join("\n")}`);

  // Banned words
  const allBanned = voice.banned_words.flatMap((cat) =>
    cat.words.length > 0 ? [`${cat.category}: ${cat.words.join(", ")}`] : []
  );
  if (allBanned.length > 0) {
    sections.push(`BANNED WORDS AND PHRASES (NEVER use these):\n${allBanned.map((l) => `- ${l}`).join("\n")}`);
  }

  // Regional texture
  if (voice.regional_texture === "british") {
    sections.push(`REGIONAL TEXTURE: British voice. Use British English, cultural references, and tone.${voice.regional_notes ? ` ${voice.regional_notes}` : ""}`);
  } else if (voice.regional_texture === "american") {
    sections.push("REGIONAL TEXTURE: American voice.");
  }

  // Writing samples (few-shot examples)
  if (voice.writing_samples.length > 0) {
    const sampleTexts = voice.writing_samples
      .map((s) => {
        const label = s.label || s.post_type || "Example";
        return `[${label}]\n${s.text}`;
      })
      .join("\n\n---\n\n");
    sections.push(`WRITING SAMPLES — Match this voice closely:\n\n${sampleTexts}`);
  }

  return sections.join("\n\n");
}

/**
 * Builds a complete voice prompt from either structured or legacy voice data.
 * Falls back gracefully if structured_voice is not populated.
 */
export function buildVoicePrompt(voiceProfile: {
  structured_voice?: StructuredVoice | null;
  voice_description?: string | null;
  banned_vocabulary?: string | null;
  signature_devices?: string | null;
  emotional_register?: string | null;
  writing_samples?: string | null;
} | null): string {
  if (!voiceProfile) return "";

  // Prefer structured voice if available
  if (voiceProfile.structured_voice) {
    return structuredVoiceToPrompt(voiceProfile.structured_voice);
  }

  // Legacy fallback: build from free-text fields
  const parts: string[] = [];
  if (voiceProfile.voice_description) parts.push(`VOICE: ${voiceProfile.voice_description}`);
  if (voiceProfile.banned_vocabulary) parts.push(`BANNED WORDS: ${voiceProfile.banned_vocabulary}`);
  if (voiceProfile.signature_devices) parts.push(`SIGNATURE DEVICES: ${voiceProfile.signature_devices}`);
  if (voiceProfile.emotional_register) parts.push(`EMOTIONAL REGISTER: ${voiceProfile.emotional_register}`);
  if (voiceProfile.writing_samples) parts.push(`WRITING SAMPLES:\n${voiceProfile.writing_samples}`);
  return parts.join("\n\n");
}
