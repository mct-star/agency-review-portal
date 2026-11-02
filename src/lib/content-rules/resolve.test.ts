import bundles from './approved-bundles.json';
import { describe, expect, it } from 'vitest';
import { resolveRules, sha256, type ApprovedBundle } from './resolve';
import { resolveInputRules } from './input';
import { reviewRules } from './review';
import { runQualityTests } from '@/lib/generation/quality-tests';
import { buildContentPrompt } from '@/lib/providers/content-generation/anthropic';
import { assetRowsFor } from '@/lib/content/save-assets';
import type { ContentGenerationInput } from '@/lib/providers';
const companyId = 'd338c3ca-7f6b-4ea8-9fff-c052ba91bbdd';
const authorId = '4befbb9a-c4d5-4ad9-b5d5-8daf3ed3f7cb';
const input = { companyId, authorId, blueprintContent: 'A company blueprint', voicePrompt: 'Bound author voice', contentType: 'blog_article', spokespersonName: 'Michael', topicTitle: 'Topic', topicDescription: null, pillar: null, audienceTheme: null, weekNumber: 1 } satisfies ContentGenerationInput;
const check = (text: string, rules = resolveInputRules(input).rules!) => runQualityTests(text, 'Title', null, { contentType: rules.scope.contentType, rules });
describe('approved canon runtime contract', () => {
 it('selects the actual scoped bundle and preserves generation hash on persisted review', () => {
  const generated = resolveInputRules(input).rules!;
  expect(buildContentPrompt({ ...input, rules: generated })).toContain(generated.hash);
  expect(generated.bundleVersion).toBe('agency-canon-2026-11-01');
  expect(generated.checks.bracketedAsides).toBe(true);
  const rows = assetRowsFor('piece', [{ assetType: 'content_rules_provenance', textContent: JSON.stringify({ rules: generated }) }]);
  const replay = reviewRules(JSON.parse(JSON.stringify(rows[0].asset_metadata)).rules, companyId);
  expect(replay.rules?.hash).toBe(generated.hash);
  expect(replay.status).toBe('current');
  expect(check('Clinical hospital care (one aside)', replay.rules).allResults).toEqual(check('Clinical hospital care (one aside)', generated).allResults);
 });
 it('does not leak company or author policy to another company, author, channel or pack', () => {
  const other = resolveRules({ companyId: 'B', authorId, channel: 'linkedin', postPack: 'b2b', contentType: 'social_post' });
  expect(other.instructions).not.toContain('Michael');
  expect(other.checks.healthcare).toBe(false);
  const companyOnly = resolveRules({ companyId, authorId: 'different', contentType: 'social_post' });
  expect(companyOnly.checks.bracketedAsides).toBe(false);
  expect(companyOnly.instructions).not.toContain('## Voice DNA');
  const companyChannel = resolveRules({ companyId, authorId, channel: 'linkedin_company', postPack: 'b2b', contentType: 'social_post' });
  expect(companyChannel.instructions).not.toContain('## Structure essentials');
  const venue = resolveRules({ companyId, authorId, channel: 'facebook', postPack: 'hospitality', contentType: 'social_post' });
  expect(venue.checks.bracketedAsides).toBe(false);
  expect(check('I organize software!', other).allResults.some(r => ['C4_healthcare','C4_bracketed_aside','C6_first_word','C6_uk_spelling'].includes(r.testId))).toBe(false);
 });
 it('fails explicitly if an applicable required source is absent', () => {
  const bundle: ApprovedBundle = { companyId: 'A', version: '1', approval: { reviewer: 'Editor', approvedAt: '2026-11-01', reference: 'Decision' }, requiredSourceIds: ['required'], sources: [] };
  expect(() => resolveRules({ companyId: 'A', contentType: 'social_post' }, [bundle])).toThrow('Required approved sources');
  expect(() => resolveInputRules({ ...input, blueprintContent: '' })).toThrow('blueprint');
 });
 it('a source edit changes the manifest hash and the checks, never reuses old policy', () => {
  const make = (word: string): ApprovedBundle => ({ companyId: 'A', version: '1', approval: { reviewer: 'Editor', approvedAt: '2026-11-01', reference: 'Decision' }, requiredSourceIds: ['voice'], sources: [{ id: 'voice', version: '1', owner: 'company', companyId: 'A', text: word, sha256: sha256(word), checks: { bannedVocabulary: [word] } }] });
  const scope = { companyId: 'A', contentType: 'social_post' };
  const before = resolveRules(scope, [make('old')]); const after = resolveRules(scope, [make('new')]);
  expect(before.hash).not.toBe(after.hash);
  expect(check('new', before).allPassed).toBe(true);
  expect(check('new', after).allPassed).toBe(false);
 });
 it('D08 permits two blog-aside marks but none outside asides or in posts', () => {
  expect(check('Clinical hospital care (a surprise! Another surprise!)').allResults.find(r => r.testId === 'C6_formatting')?.passed).toBe(true);
  expect(check('Clinical hospital care! (a surprise!)').allResults.find(r => r.testId === 'C6_formatting')?.passed).toBe(false);
  const post = resolveInputRules({ ...input, contentType: 'social_post' }).rules!;
  expect(check('Clinical hospital care (a surprise!)', post).allResults.find(r => r.testId === 'C6_formatting')?.passed).toBe(false);
 });
 it('records company source edits, company vocabulary and missing legacy provenance', () => {
  const a = resolveInputRules({ ...input, bannedVocabulary: 'customword' }).rules!;
  expect(a.hash).not.toBe(resolveInputRules({ ...input, blueprintContent: 'Changed' }).rules!.hash);
  expect(check('customword', a).allResults.find(r => r.testId === 'C5_banned_vocab')?.passed).toBe(false);
  expect(reviewRules(undefined, companyId).status).toBe('missing');
  expect(() => reviewRules(a, 'B')).toThrow('company');
 });
});

it('review retains generation word ranges and sign-off even when current settings differ', () => {
  const rules = resolveInputRules({ ...input, wordCountMin: 10, signoffText: 'Original sign-off' }).rules!;
  const replay = reviewRules(JSON.parse(JSON.stringify(rules)), companyId).rules!;
  const generation = runQualityTests('Short', 'Title', null, { contentType: 'blog_article', rules });
  const review = runQualityTests('Short', 'Title', null, { contentType: 'social_post', rules: replay, signoffText: 'Different', wordCountMin: 1 });
  expect(review).toEqual(generation);
});

it('rejects recomputed-hash policy tampering against the approved manifest', () => {
  const rules = resolveInputRules(input).rules!;
  const changed = JSON.parse(JSON.stringify(rules));
  changed.checks.healthcare = false; changed.checks.bracketedAsides = false;
  const { hash: _hash, ...payload } = changed;
  changed.hash = sha256(JSON.stringify(payload));
  expect(() => reviewRules(changed, companyId)).toThrow('approved manifest');
});
it('declares required and optional company contexts explicitly', () => {
  expect(() => resolveInputRules({ ...input, voicePrompt: undefined })).toThrow('Required company context');
  const rules = resolveInputRules({ ...input, sourceContext: undefined, brandContext: undefined }).rules!;
  expect(rules.contextPolicy.sourceContext).toBe('optional');
  expect(rules.contextWarnings).toContain('Optional company context is absent: sourceContext.');
});

it('requires the actual applicable author source even when other company sources remain', () => {
  const broken = JSON.parse(JSON.stringify(bundles)) as ApprovedBundle[];
  broken[0].sources = broken[0].sources.filter(source => !source.id.startsWith('michael-voice-'));
  expect(() => resolveRules({ companyId, authorId, channel: 'linkedin', postPack: 'b2b', contentType: 'social_post' }, broken)).toThrow('Required approved sources');
});
