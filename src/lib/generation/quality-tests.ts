/**
 * Programmatic Quality Tests
 *
 * These tests are run AFTER content generation to validate that the output
 * follows the atom rules. Each test returns a pass/fail with a specific
 * failure message that can be sent back to Claude for fixing.
 *
 * Based on the Master Validation Checklist (Atom 15) and individual atom tests.
 */

// ============================================================
// Types
// ============================================================

export interface TestResult {
  testId: string;
  testName: string;
  passed: boolean;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface ValidationResult {
  allPassed: boolean;
  criticalFailures: TestResult[];
  highFailures: TestResult[];
  allResults: TestResult[];
  fixInstructions: string;
}

// ============================================================
// Banned vocabulary (from Source Context C5)
// ============================================================

const BANNED_WORDS = [
  "leverage", "optimise", "optimize", "comprehensive", "robust", "synergy",
  "ecosystem", "best practices", "best-practices", "impactful",
  "game-changer", "game changer", "revolutionary", "exciting",
  "astounding", "fascinating", "remarkable", "incredible", "amazing",
  "crucial", "spot on", "nailed it", "exactly right", "especially important",
  "resonates", "this tracks", "powerful insight",
  "certainly", "pertinent", "considerable", "indeed",
  "we've all been there", "we've all tried", "as we all know",
  "damn it", "awesome", "super excited",
  "i'm curious", "curious to see", "i'd love to know",
  "best of luck", "wishing you all the best", "exciting times",
  "let's connect", "let's chat",
];

const BANNED_PATTERNS = [
  /[—]/g,                    // Em-dash
  /[–]/g,                    // En-dash
  /!\s/g,                    // Exclamation mark (followed by space)
  /!$/gm,                   // Exclamation mark (end of line)
  /!"/g,                    // Exclamation mark before quote
];

// ============================================================
// Individual Tests
// ============================================================

function testBannedVocabulary(text: string): TestResult {
  const found: string[] = [];
  const lower = text.toLowerCase();

  for (const word of BANNED_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      found.push(word);
    }
  }

  return {
    testId: "C5_banned_vocab",
    testName: "Banned Vocabulary (C5)",
    passed: found.length === 0,
    message: found.length === 0
      ? "No banned vocabulary found"
      : `Found ${found.length} banned word(s): ${found.map(w => `"${w}"`).join(", ")}`,
    severity: "critical",
  };
}

function testFormattingMarkers(text: string): TestResult {
  const issues: string[] = [];

  if (/[—]/.test(text)) issues.push("em-dash (—) found");
  if (/[–]/.test(text)) issues.push("en-dash (–) found");

  // Count exclamation marks (allow up to 1 in long-form for aside/self-deprecation)
  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount > 1) issues.push(`${exclamationCount} exclamation marks (max 1 allowed)`);

  return {
    testId: "C6_formatting",
    testName: "Formatting Mandates (C6)",
    passed: issues.length === 0,
    message: issues.length === 0 ? "Formatting clean" : `Issues: ${issues.join("; ")}`,
    severity: "critical",
  };
}

function testSignoff(text: string, expectedSignoff: string | null): TestResult {
  if (!expectedSignoff) {
    return {
      testId: "E3_signoff",
      testName: "Sign-off Present (E3)",
      passed: true,
      message: "No expected sign-off configured",
      severity: "medium",
    };
  }

  const hasSignoff = text.includes(expectedSignoff.trim());

  return {
    testId: "E3_signoff",
    testName: "Sign-off Present (E3)",
    passed: hasSignoff,
    message: hasSignoff
      ? "Exact sign-off found"
      : `Sign-off text not found verbatim. Expected: "${expectedSignoff.substring(0, 60)}..."`,
    severity: "critical",
  };
}

function testFirstWordNotI(text: string): TestResult {
  const firstWord = text.trim().split(/\s/)[0];
  const startsWithI = firstWord === "I" || firstWord === "I'm" || firstWord === "I've" || firstWord === "I'd";

  return {
    testId: "C6_first_word",
    testName: "Does Not Open With 'I'",
    passed: !startsWithI,
    message: startsWithI
      ? `Post opens with "${firstWord}". Must start with observation, scene, or fact.`
      : "Opening word is not 'I'",
    severity: "high",
  };
}

function testBracketedAside(text: string, contentType: string): TestResult {
  const asidePattern = /\([^)]{10,}\)/g;
  const matches = text.match(asidePattern) || [];
  const minRequired = contentType === "blog_article" ? 3 : 1;

  return {
    testId: "C4_bracketed_aside",
    testName: "Bracketed Asides (C4)",
    passed: matches.length >= minRequired,
    message: matches.length >= minRequired
      ? `${matches.length} bracketed aside(s) found (min ${minRequired})`
      : `Only ${matches.length} bracketed aside(s) found. Need at least ${minRequired}. Add human aside like "(Took us a while to figure that out.)"`,
    severity: "high",
  };
}

function testWordCount(text: string, min: number | null, max: number | null): TestResult {
  if (!min && !max) {
    return {
      testId: "word_count",
      testName: "Word Count",
      passed: true,
      message: "No word count range specified",
      severity: "low",
    };
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const passed = (!min || wordCount >= min) && (!max || wordCount <= max);

  return {
    testId: "word_count",
    testName: "Word Count",
    passed,
    message: passed
      ? `${wordCount} words (target: ${min}-${max})`
      : `${wordCount} words is ${wordCount < (min || 0) ? "under" : "over"} target (${min}-${max})`,
    severity: "high",
  };
}

function testHealthcareSpecificity(text: string): TestResult {
  const healthcareTerms = [
    "clinical", "clinician", "surgeon", "hospital", "NHS", "health system",
    "procurement", "medical device", "med device", "medtech", "biotech",
    "diagnostics", "digital health", "health tech", "pharmaceutical",
    "HCP", "healthcare", "patient", "clinical champion", "regulatory",
    "reimbursement", "formulary", "clinical evidence", "NICE",
    "product launch", "launch", "sales rep", "field sales",
  ];

  const lower = text.toLowerCase();
  const found = healthcareTerms.filter((term) => lower.includes(term.toLowerCase()));

  return {
    testId: "C4_healthcare",
    testName: "Healthcare Specificity (C4)",
    passed: found.length >= 2,
    message: found.length >= 2
      ? `${found.length} healthcare terms found: ${found.slice(0, 5).join(", ")}`
      : `Only ${found.length} healthcare term(s). Content could be about any industry. Add healthcare job titles, scenarios, or terminology.`,
    severity: "high",
  };
}

function testTitleFormat(title: string): TestResult {
  const issues: string[] = [];
  if (title.includes(":")) issues.push("contains colon");
  if (title.includes(" - ") || title.startsWith("-")) issues.push("contains hyphen");
  if (/[—–]/.test(title)) issues.push("contains dash");

  return {
    testId: "title_format",
    testName: "Title Format",
    passed: issues.length === 0,
    message: issues.length === 0
      ? "Title format clean"
      : `Title ${issues.join(" and ")}. Remove colons and hyphens from titles.`,
    severity: "high",
  };
}

function testUKSpelling(text: string): TestResult {
  const usSpellings: Record<string, string> = {
    "organize": "organise",
    "optimize": "optimise",
    "recognize": "recognise",
    "color ": "colour ",
    "behavior": "behaviour",
    "center ": "centre ",
    "program ": "programme ",
    "traveled": "travelled",
    "canceled": "cancelled",
    "analyzed": "analysed",
    "utilizing": "utilising",
    "maximize": "maximise",
  };

  const found: string[] = [];
  const lower = text.toLowerCase();

  for (const [us, uk] of Object.entries(usSpellings)) {
    if (lower.includes(us) && !lower.includes(uk)) {
      found.push(`"${us}" should be "${uk}"`);
    }
  }

  return {
    testId: "C6_uk_spelling",
    testName: "UK Spelling (C6)",
    passed: found.length === 0,
    message: found.length === 0
      ? "UK spelling appears correct"
      : `US spellings found: ${found.join("; ")}`,
    severity: "high",
  };
}

function testCTANotInBody(text: string, ctaUrl: string | null): TestResult {
  if (!ctaUrl) {
    return {
      testId: "E3_cta_location",
      testName: "CTA Not In Body",
      passed: true,
      message: "No CTA URL to check",
      severity: "low",
    };
  }

  const hasUrlInBody = text.includes(ctaUrl);

  return {
    testId: "E3_cta_location",
    testName: "CTA Not In Body (E3)",
    passed: !hasUrlInBody,
    message: hasUrlInBody
      ? `CTA URL "${ctaUrl}" found in post body. It should ONLY be in the first comment.`
      : "CTA URL correctly absent from post body",
    severity: "critical",
  };
}

function testAntiContraction(text: string, contentType: string): TestResult {
  if (contentType !== "blog_article" && contentType !== "linkedin_article") {
    return {
      testId: "long_form_contraction",
      testName: "Anti-Contraction",
      passed: true,
      message: "Not applicable to social posts",
      severity: "low",
    };
  }

  const contractions = ["don't", "can't", "won't", "isn't", "aren't", "doesn't", "didn't", "haven't", "hasn't", "shouldn't", "wouldn't", "couldn't", "it's"];
  const found = contractions.filter((c) => text.toLowerCase().includes(c));

  return {
    testId: "long_form_contraction",
    testName: "Anti-Contraction (Long-form)",
    passed: found.length === 0,
    message: found.length === 0
      ? "No contractions found"
      : `Contractions found: ${found.join(", ")}. Long-form uses "do not" not "don't".`,
    severity: "high",
  };
}

// ============================================================
// Main Validation Runner
// ============================================================

export function runQualityTests(
  markdownBody: string,
  title: string,
  firstComment: string | null,
  options: {
    contentType: string;
    signoffText?: string | null;
    ctaUrl?: string | null;
    wordCountMin?: number | null;
    wordCountMax?: number | null;
    postTypeSlug?: string | null;
  }
): ValidationResult {
  const results: TestResult[] = [];

  // Run all tests
  results.push(testBannedVocabulary(markdownBody));
  results.push(testFormattingMarkers(markdownBody));
  results.push(testSignoff(markdownBody, options.signoffText || null));
  results.push(testFirstWordNotI(markdownBody));
  results.push(testBracketedAside(markdownBody, options.contentType));
  results.push(testWordCount(markdownBody, options.wordCountMin || null, options.wordCountMax || null));
  results.push(testHealthcareSpecificity(markdownBody));
  results.push(testTitleFormat(title));
  results.push(testUKSpelling(markdownBody));
  results.push(testCTANotInBody(markdownBody, options.ctaUrl || null));
  results.push(testAntiContraction(markdownBody, options.contentType));

  // Also check first comment for banned words
  if (firstComment) {
    const fcBanned = testBannedVocabulary(firstComment);
    fcBanned.testId = "C5_first_comment_banned";
    fcBanned.testName = "First Comment Banned Vocab";
    results.push(fcBanned);
  }

  // Classify failures
  const criticalFailures = results.filter((r) => !r.passed && r.severity === "critical");
  const highFailures = results.filter((r) => !r.passed && r.severity === "high");
  const allPassed = criticalFailures.length === 0 && highFailures.length === 0;

  // Build fix instructions for Claude
  const fixInstructions = allPassed
    ? ""
    : buildFixInstructions(results.filter((r) => !r.passed));

  return {
    allPassed,
    criticalFailures,
    highFailures,
    allResults: results,
    fixInstructions,
  };
}

function buildFixInstructions(failures: TestResult[]): string {
  const lines = [
    "The following quality tests FAILED. Fix each issue while preserving the content's meaning and voice.",
    "",
  ];

  for (const f of failures) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.testName}: ${f.message}`);
  }

  lines.push("");
  lines.push("Return the FIXED content in the same JSON format. Only fix the specific issues listed above.");
  lines.push("Do NOT rewrite the content. Make minimal, targeted fixes.");

  return lines.join("\n");
}
