/** Replays the rules recorded at generation and reports drift against the current approved manifest. */
import { resolveRules, verifyRules, type ResolvedRules } from './resolve';
export function reviewRules(snapshot: ResolvedRules | undefined, companyId: string) {
  if (!snapshot) return { rules: undefined, status: 'missing' as const, message: 'No rules provenance was recorded. This legacy piece needs an explicit scoped review.' };
  const rules = verifyRules(snapshot, companyId);
  const current = resolveRules(rules.scope);
  const expectedChecks = { ...current.checks, bannedVocabulary: [...current.checks.bannedVocabulary, ...(rules.companyVocabulary || [])] };
  if (rules.bundleVersion === current.bundleVersion &&
      (rules.instructions !== current.instructions || JSON.stringify(rules.checks) !== JSON.stringify(expectedChecks) || JSON.stringify(rules.contextPolicy) !== JSON.stringify(current.contextPolicy))) {
    throw new Error('Recorded rule instructions or checks do not match the approved manifest.');
  }
  const oldCanon = rules.sources.filter(source => !source.id.startsWith('company-'));
  const stale = rules.codeRulesSha256 !== current.codeRulesSha256 || rules.codeRulesVersion !== current.codeRulesVersion || rules.bundleVersion !== current.bundleVersion || JSON.stringify(oldCanon) !== JSON.stringify(current.sources);
  return { rules, status: stale ? 'stale' as const : 'current' as const, message: [(stale ? 'Approved canon changed since generation. Checks replay the recorded version.' : 'Checks replay the recorded rules version.'), ...(rules.contextWarnings || [])].join(' ') };
}
