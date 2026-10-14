/**
 * Validated Content Generator
 *
 * Wraps the content provider with the atom-process validation loop:
 * Generate → Test → Fix → Re-test → Loop (max 3 iterations)
 *
 * This is the "Copy Magic" engine — it doesn't just generate content,
 * it enforces quality gates programmatically and iterates until
 * the content passes all tests.
 */

import type {
  ContentProvider,
  ContentGenerationInput,
  ContentGenerationOutput,
} from "@/lib/providers";
import { runQualityTests, type ValidationResult } from "./quality-tests";
import { autofixDashes } from "./punctuation-autofix";

const MAX_ITERATIONS = 3;

export interface ValidatedGenerationResult {
  output: ContentGenerationOutput;
  validation: ValidationResult;
  iterations: number;
  fixHistory: {
    iteration: number;
    failureCount: number;
    failures: string[];
  }[];
}

/**
 * Mechanically fixes en and em dashes in the title, body, and first comment
 * before the quality tests ever see them (29 Sept 2026). A model asked to
 * fix an en dash cannot reliably tell one from a hyphen, so an 1,839-word
 * article once burned all three fix rounds on a single dash that was never
 * removed. Runs after the first generation and after every fix round.
 */
function applyDashAutofix(output: ContentGenerationOutput): ContentGenerationOutput {
  const body = autofixDashes(output.markdownBody);
  const title = autofixDashes(output.title);
  const comment = output.firstComment ? autofixDashes(output.firstComment) : null;
  const count = body.count + title.count + (comment ? comment.count : 0);

  if (count === 0) return output;

  const warnings = output.warnings ? [...output.warnings] : [];
  warnings.push(`Automatically fixed ${count} dash character${count === 1 ? "" : "s"} before checking.`);

  return {
    ...output,
    markdownBody: body.text,
    title: title.text,
    firstComment: comment ? comment.text : output.firstComment,
    warnings,
  };
}

/**
 * Generate content with recursive quality validation.
 *
 * Process:
 * 1. Generate initial content via the provider
 * 2. Mechanically autofix dash punctuation
 * 3. Run programmatic quality tests
 * 4. If critical/high failures: send content + fix instructions back to Claude
 * 5. Claude returns fixed version, autofix runs again
 * 6. Re-test → loop until pass or max iterations
 *
 * Returns the final output + validation results + fix history.
 */
export async function generateWithValidation(
  provider: ContentProvider,
  input: ContentGenerationInput,
  fixProvider?: {
    fix: (content: ContentGenerationOutput, fixInstructions: string) => Promise<ContentGenerationOutput>;
  }
): Promise<ValidatedGenerationResult> {
  const fixHistory: ValidatedGenerationResult["fixHistory"] = [];

  // Initial generation
  let output = await provider.generate(input);
  output = applyDashAutofix(output);
  let iteration = 1;

  // Run quality tests
  let validation = runQualityTests(
    output.markdownBody,
    output.title,
    output.firstComment,
    {
      contentType: input.contentType,
      signoffText: input.signoffText,
      ctaUrl: input.ctaUrl,
      wordCountMin: input.wordCountMin,
      wordCountMax: input.wordCountMax,
      postTypeSlug: input.postTypeSlug,
    }
  );

  // Record initial test results
  if (!validation.allPassed) {
    const failures = validation.allResults
      .filter((r) => !r.passed)
      .map((r) => `${r.testName}: ${r.message}`);

    fixHistory.push({
      iteration,
      failureCount: failures.length,
      failures,
    });
  }

  // Recursive fix loop
  while (!validation.allPassed && iteration < MAX_ITERATIONS && fixProvider) {
    iteration++;

    try {
      // Send content back to Claude with specific fix instructions
      output = await fixProvider.fix(output, validation.fixInstructions);
      output = applyDashAutofix(output);

      // Re-test
      validation = runQualityTests(
        output.markdownBody,
        output.title,
        output.firstComment,
        {
          contentType: input.contentType,
          signoffText: input.signoffText,
          ctaUrl: input.ctaUrl,
          wordCountMin: input.wordCountMin,
          wordCountMax: input.wordCountMax,
          postTypeSlug: input.postTypeSlug,
        }
      );

      if (!validation.allPassed) {
        const failures = validation.allResults
          .filter((r) => !r.passed)
          .map((r) => `${r.testName}: ${r.message}`);

        fixHistory.push({
          iteration,
          failureCount: failures.length,
          failures,
        });
      }
    } catch {
      // Fix attempt failed — break the loop and return what we have
      break;
    }
  }

  return {
    output,
    validation,
    iterations: iteration,
    fixHistory,
  };
}
