/**
 * Calculates a heuristic voice match score (0-100) by comparing
 * the generated post against the company's voice profile indicators.
 */
export function calculateVoiceMatch(
  postText: string,
  voiceProfile?: {
    formalityLevel?: number; // 1-5 (1=casual, 5=formal)
    energyLevel?: number; // 1-5 (1=calm, 5=intense)
    toneWords?: string[];
    neverUseWords?: string[];
  }
): { score: number; feedback: string[] } {
  if (!voiceProfile) return { score: 75, feedback: ["Set up your voice profile for a more accurate match."] };

  let score = 70; // Base score
  const feedback: string[] = [];
  const lower = postText.toLowerCase();
  const words = lower.split(/\s+/);
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  const sentenceCount = postText.split(/[.!?]+/).filter(Boolean).length;
  const avgSentenceLength = words.length / Math.max(sentenceCount, 1);

  // Formality check (casual = short sentences, contractions; formal = longer, no contractions)
  if (voiceProfile.formalityLevel) {
    const hasContractions = /\b(don't|won't|can't|isn't|wasn't|I'm|we're|they're|you're|it's|that's|here's|there's)\b/.test(postText);
    if (voiceProfile.formalityLevel <= 2 && hasContractions) { score += 5; feedback.push("Conversational tone matches your style."); }
    if (voiceProfile.formalityLevel >= 4 && !hasContractions) { score += 5; feedback.push("Formal tone matches your style."); }
    if (voiceProfile.formalityLevel <= 2 && avgSentenceLength < 15) { score += 3; }
    if (voiceProfile.formalityLevel >= 4 && avgSentenceLength > 18) { score += 3; }
  }

  // Energy check (intense = exclamation marks, short punchy sentences; calm = measured)
  if (voiceProfile.energyLevel) {
    const exclamations = (postText.match(/!/g) || []).length;
    if (voiceProfile.energyLevel >= 4 && exclamations > 0) { score += 3; }
    if (voiceProfile.energyLevel <= 2 && exclamations === 0) { score += 3; feedback.push("Measured pace matches your energy."); }
  }

  // Tone words present
  if (voiceProfile.toneWords && voiceProfile.toneWords.length > 0) {
    const matched = voiceProfile.toneWords.filter(w => lower.includes(w.toLowerCase()));
    score += Math.min(matched.length * 3, 9);
    if (matched.length > 0) feedback.push(`Uses your vocabulary: ${matched.slice(0, 3).join(", ")}.`);
  }

  // Never-use words violated
  if (voiceProfile.neverUseWords && voiceProfile.neverUseWords.length > 0) {
    const violated = voiceProfile.neverUseWords.filter(w => lower.includes(w.toLowerCase()));
    score -= violated.length * 5;
    if (violated.length > 0) feedback.push(`Contains words you avoid: ${violated.join(", ")}.`);
  }

  // Hook strength (first line under 12 words = bonus)
  const firstLine = postText.split("\n")[0] || "";
  if (firstLine.split(/\s+/).length <= 12) { score += 5; feedback.push("Strong opening hook."); }

  // Clamp
  score = Math.max(40, Math.min(98, score));
  if (feedback.length === 0) feedback.push("Solid voice match overall.");

  return { score, feedback };
}
