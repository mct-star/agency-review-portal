/** Binds the authorised caller company to the exact policy consumed by a writer. */
import type { ContentGenerationInput } from '@/lib/providers';
import { resolveRules, verifyRules, sha256 } from './resolve';
export function resolveInputRules(input: ContentGenerationInput): ContentGenerationInput {
  if (!input.companyId) throw new Error('A company is required to resolve writing rules.');
  if (!input.blueprintContent?.trim() || input.blueprintContent === 'No blueprint configured.') throw new Error('Add an active company blueprint before writing content.');
  const scope = { companyId: input.companyId, authorId: input.authorId, channel: input.channel || (input.contentType === 'blog_article' ? 'blog' : 'linkedin'), postPack: input.postPack || 'b2b', contentType: input.contentType };
  let rules = input.rules ? verifyRules(input.rules, input.companyId) : resolveRules(scope);
  if (JSON.stringify(rules.scope) !== JSON.stringify(scope)) throw new Error('Writing rules do not match this author, channel, pack or format.');
  const contextWarnings: string[] = [];
  for (const [key, requirement] of Object.entries(rules.contextPolicy)) {
    if (!input[key as keyof typeof rules.contextPolicy]?.trim()) {
      if (requirement === 'required') throw new Error(`Required company context is absent: ${key}`);
      contextWarnings.push(`Optional company context is absent: ${key}.`);
    }
  }
  if (!input.sourceContext?.trim()) contextWarnings.push('The blueprint supplies company strategy; the approved bundle supplies production policy only. Factual claims still need a supplied source.');
  if (!input.rules) {
    const { hash: _hash, ...value } = rules;
    const sources = [...value.sources, ...[
      ['company-blueprint', input.blueprintContent], ['company-source-context', input.sourceContext],
      ['company-brand-context', input.brandContext], ['company-voice', input.voicePrompt || input.voiceDescription],
      ['company-vocabulary', input.bannedVocabulary],
    ].filter(([, text]) => !!text).map(([id, text]) => ({ id: id!, version: id === 'company-blueprint' ? String(input.blueprintVersion ?? 'unversioned') : 'stored-company-context', sha256: sha256(text!) }))];
    const companyVocabulary = (input.bannedVocabulary || '').split(/[,\n;]/).map(word => word.trim()).filter(Boolean);
    const checks = { ...value.checks, bannedVocabulary: [...value.checks.bannedVocabulary, ...companyVocabulary] };
    const final = { ...value, sources, checks, companyVocabulary, blueprintId: input.blueprintId || null,
      voiceProfileId: input.voiceProfileId || null, strategySource: 'company-blueprint' as const,
      contextWarnings,
      validation: {
      signoffText: input.signoffText, ctaUrl: input.ctaUrl, wordCountMin: input.wordCountMin,
      wordCountMax: input.wordCountMax, postTypeSlug: input.postTypeSlug,
    } };
    rules = { ...final, hash: sha256(JSON.stringify(final)) };
  }
  return { ...input, rules };
}

export function attachRules(output: import('@/lib/providers').ContentGenerationOutput, rules: import('./resolve').ResolvedRules) {
  return { ...output, rules, warnings: [...(output.warnings || []), ...(rules.contextWarnings || []), ...(!rules.bundleVersion ? ['No approved company canon overlay is configured. Shared production method and this company’s supplied blueprint and voice were used.'] : [])], assets: [...(output.assets || []).filter(asset => asset.assetType !== 'content_rules_provenance'),
    { assetType: 'content_rules_provenance', textContent: JSON.stringify({ rules }) }] };
}
