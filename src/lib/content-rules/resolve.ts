/** Resolves reviewed source bundles once for writing, checking and later review. No filesystem or database reads. */
import { createHash } from 'node:crypto';
import approvedBundles from './approved-bundles.json';
import codeRulesFingerprint from './code-rules-fingerprint.json';

export const CODE_RULES_VERSION = 'scoped-canon-1';
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export interface RuleScope { companyId: string; authorId?: string; channel?: string; postPack?: string; contentType: string }
export interface RuleChecks {
  bannedVocabulary: string[];
  noLongDashes: boolean;
  exclamations: 'unrestricted' | 'none' | 'blog_asides';
  bracketedAsides: boolean;
  firstWordNotI: boolean;
  healthcare: boolean;
  ukSpelling: boolean;
  titleFormat: boolean;
}
export interface ApprovedSource {
  id: string; version: string; sha256: string; text: string;
  owner: 'shared_method' | 'company' | 'author' | 'channel';
  companyId?: string; authorId?: string; channel?: string; postPack?: string;
  checks?: Partial<RuleChecks>;
  origin?: { document: string; documentSha256: string; heading: string };
}
export type ContextPolicy = Record<'blueprintContent' | 'sourceContext' | 'brandContext' | 'voicePrompt', 'required' | 'optional'>;
export const DEFAULT_CONTEXT_POLICY: ContextPolicy = { blueprintContent: 'required', sourceContext: 'optional', brandContext: 'optional', voicePrompt: 'optional' };
export interface ApprovedBundle {
  companyId: string; version: string;
  defaultAuthor?: { name: string; id: string; voiceProfileId: string };
  contextPolicy?: ContextPolicy;
  approval: { reviewer: string; approvedAt: string; reference: string; rulingsSha256?: string; rulingIds?: string[] };
  requiredSourceIds: string[];
  scopedRequirements?: Array<{ id: string; authorId?: string; channel?: string; postPack?: string }>;
  sources: ApprovedSource[];
}
export interface ResolvedRules {
  validation?: { signoffText?: string; ctaUrl?: string; wordCountMin?: number; wordCountMax?: number; postTypeSlug?: string };
  companyVocabulary?: string[];
  contextPolicy: ContextPolicy;
  voiceProfileId?: string | null;
  contextWarnings?: string[];
  strategySource?: "company-blueprint";
  approval?: ApprovedBundle["approval"];
  blueprintId?: string | null;
  codeRulesSha256: string;
  codeRulesVersion: string; scope: RuleScope; bundleVersion: string | null;
  sources: Array<{ id: string; version: string; sha256: string; origin?: ApprovedSource["origin"] }>;
  checks: RuleChecks; instructions: string; missingSources: string[]; hash: string;
}
const DEFAULT_CHECKS: RuleChecks = {
  bannedVocabulary: [], noLongDashes: false, exclamations: 'unrestricted',
  bracketedAsides: false, firstWordNotI: false, healthcare: false, ukSpelling: false, titleFormat: false,
};
export function validateBundle(bundle: ApprovedBundle): void {
  if (!bundle.companyId || !bundle.version || !bundle.approval?.reviewer || !bundle.approval.reference || !Number.isFinite(Date.parse(bundle.approval.approvedAt))) throw new Error('A source bundle requires a recorded review approval.');
  const ids = new Set<string>();
  for (const source of bundle.sources) {
    if (!source.id || !source.version || !source.text?.trim() || source.sha256 !== sha256(source.text) || ids.has(source.id)) throw new Error('Invalid or duplicate source in the approved bundle.');
    ids.add(source.id);
    if (!['shared_method', 'company', 'author', 'channel'].includes(source.owner)) throw new Error('Unknown source owner.');
    if (source.owner !== 'shared_method' && source.companyId !== bundle.companyId) throw new Error('Scoped sources must belong to the bundle company.');
    if (source.owner === 'author' && !source.authorId) throw new Error('Author sources require an author id.');
    if (source.owner === 'channel' && !source.channel) throw new Error('Channel sources require a channel.');
    if (source.checks?.exclamations && !['unrestricted', 'none', 'blog_asides'].includes(source.checks.exclamations)) throw new Error('Unknown exclamation policy.');
  }
}
export function resolveRules(scope: RuleScope, bundles: ApprovedBundle[] = approvedBundles as ApprovedBundle[]): ResolvedRules {
  const matches = bundles.filter(b => b.companyId === scope.companyId);
  if (matches.length > 1) throw new Error('More than one approved source bundle for this company.');
  const bundle = matches[0];
  if (bundle) validateBundle(bundle);
  const shared = (approvedBundles as ApprovedBundle[]).flatMap(b => b.sources).filter(s => s.owner === 'shared_method');
  const candidates = [...new Map([...shared, ...(bundle?.sources || [])].map(source => [source.id, source])).values()];
  const sources = candidates.filter(s =>
    (!s.companyId || s.companyId === scope.companyId) && (!s.authorId || s.authorId === scope.authorId) &&
    (!s.channel || s.channel === scope.channel) && (!s.postPack || s.postPack === scope.postPack));
  const requirements = [...(bundle?.requiredSourceIds || []), ...(bundle?.scopedRequirements || [])
    .filter(rule => (!rule.authorId || rule.authorId === scope.authorId) && (!rule.channel || rule.channel === scope.channel) && (!rule.postPack || rule.postPack === scope.postPack))
    .map(rule => rule.id)];
  const missingSources = requirements.filter(id => !sources.some(s => s.id === id));
  if (missingSources.length) throw new Error(`Required approved sources are absent for this scope: ${missingSources.join(', ')}`);
  // Stable precedence: method, company, author, channel. Never infer an author from a name.
  const order = ['shared_method', 'company', 'author', 'channel'];
  sources.sort((a, b) => order.indexOf(a.owner) - order.indexOf(b.owner) || a.id.localeCompare(b.id));
  const checks = sources.reduce((value, s) => ({ ...value, ...s.checks }), { ...DEFAULT_CHECKS });
  const value = {
    codeRulesVersion: CODE_RULES_VERSION, codeRulesSha256: codeRulesFingerprint.sha256, scope, bundleVersion: bundle?.version || null, ...(bundle ? { approval: bundle.approval } : {}),
    sources: sources.map(({ id, version, sha256, origin }) => ({ id, version, sha256, ...(origin ? { origin } : {}) })), checks,
    contextPolicy: { ...(bundle?.contextPolicy || DEFAULT_CONTEXT_POLICY), ...(scope.authorId && scope.authorId === bundle?.defaultAuthor?.id ? { voicePrompt: 'required' as const } : {}) },
    instructions: sources.map(s => `[${s.id} | ${s.version} | ${s.owner}]\n${s.text}`).join('\n\n'),
    missingSources,
  };
  return { ...value, hash: sha256(JSON.stringify(value)) };
}
export function verifyRules(rules: ResolvedRules, companyId: string): ResolvedRules {
  const { hash, ...value } = rules;
  if (rules.scope.companyId !== companyId || hash !== sha256(JSON.stringify(value))) throw new Error('Rules provenance does not match this company or its recorded hash.');
  return rules;
}
export function rulePrompt(rules: ResolvedRules): string {
  return `APPROVED APPLICABLE RULES | ${rules.hash}\n${rules.instructions || 'No approved canon bundle is configured. Follow only this company’s supplied blueprint and voice; do not import an author or industry policy.'}\nCHECK POLICY: ${JSON.stringify(rules.checks)}\nExclamation policy blog_asides permits at most two marks, only inside parentheses in blog_article; it permits none in other formats.`;
}

export function defaultAuthorFor(companyId: string) {
  return (approvedBundles as ApprovedBundle[]).find(bundle => bundle.companyId === companyId)?.defaultAuthor;
}
