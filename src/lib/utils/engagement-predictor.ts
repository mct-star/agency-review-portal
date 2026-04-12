/**
 * Predicts relative engagement based on post heuristics.
 * Returns a multiplier (e.g. 1.5x = 50% above average) and reasoning.
 */
export function predictEngagement(
  postText: string,
  postType: string,
): { multiplier: number; label: string; reasons: string[] } {
  let score = 1.0;
  const reasons: string[] = [];
  const words = postText.split(/\s+/).length;
  const firstLine = postText.split("\n")[0] || "";
  const firstLineWords = firstLine.split(/\s+/).length;

  // Hook strength
  if (firstLineWords <= 8) { score += 0.3; reasons.push("Punchy hook (under 8 words)"); }
  else if (firstLineWords <= 12) { score += 0.15; reasons.push("Strong hook"); }

  // Question in post (drives comments)
  if (/\?/.test(postText)) { score += 0.2; reasons.push("Contains a question (drives comments)"); }

  // Post type benchmarks
  const typeBonus: Record<string, number> = {
    contrarian: 0.4, insight: 0.2, founder_friday: 0.25, tactical: 0.15,
    launch_story: 0.1, if_i_was: 0.15, scene_provocation: 0.3,
  };
  if (typeBonus[postType]) { score += typeBonus[postType]; reasons.push(`${postType.replace(/_/g, " ")} posts perform well`); }

  // Word count sweet spot (150-250 = optimal for LinkedIn)
  if (words >= 150 && words <= 250) { score += 0.15; reasons.push("Optimal length (150-250 words)"); }
  else if (words > 400) { score -= 0.1; reasons.push("Long posts get fewer reads"); }
  else if (words < 80) { score -= 0.1; reasons.push("Very short — may lack substance"); }

  // Line breaks (readability)
  const paragraphs = postText.split(/\n\n+/).length;
  if (paragraphs >= 4 && paragraphs <= 8) { score += 0.1; reasons.push("Good paragraph spacing"); }

  // Personal story indicators
  if (/\b(I |we |my |our )\b/i.test(firstLine)) { score += 0.1; reasons.push("Personal opening builds connection"); }

  // Clamp between 0.5x and 3.0x
  score = Math.max(0.5, Math.min(3.0, score));

  const label = score >= 2.0 ? "High potential" : score >= 1.3 ? "Above average" : score >= 0.9 ? "Average" : "Below average";

  return { multiplier: Math.round(score * 10) / 10, label, reasons };
}
