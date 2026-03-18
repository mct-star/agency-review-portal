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
 * Generate content with recursive quality validation.
 *
 * Process:
 * 1. Generate initial content via the provider
 * 2. Run programmatic quality tests
 * 3. If critical/high failures: send content + fix instructions back to Claude
 * 4. Claude returns fixed version
 * 5. Re-test → loop until pass or max iterations
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
