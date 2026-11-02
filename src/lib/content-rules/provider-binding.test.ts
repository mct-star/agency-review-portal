import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productionTestDb } from '@/lib/api-production/fake-db.test-helper';
import type { ContentGenerationInput } from '@/lib/providers';
import { sha256 } from './resolve';
const state = vi.hoisted(() => ({ db: null as any, generate: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: async () => state.db }));
vi.mock('@/lib/providers/text-runtime', () => ({ resolveTextConfig: async () => ({ provider: 'claude', apiKey: 'test', settings: {} }) }));
vi.mock('@/lib/providers/content-generation/anthropic', () => ({ createClaudeContentProvider: () => ({ generate: state.generate }) }));
import { getContentProvider } from '@/lib/providers';
const companyId = 'd338c3ca-7f6b-4ea8-9fff-c052ba91bbdd';
const authorId = '4befbb9a-c4d5-4ad9-b5d5-8daf3ed3f7cb';
const voiceId = '4800fe91-6b0c-4c0b-a626-545284ef7691';
const base: ContentGenerationInput = { blueprintContent: 'Strategy', spokespersonName: 'Michael Colling-Tuck', contentType: 'social_post', topicTitle: 'Topic', topicDescription: null, pillar: null, audienceTheme: null, weekNumber: 1 };
beforeEach(() => {
 state.db = productionTestDb({ company_spokespersons: [{ id: authorId, company_id: companyId, is_active: true, voice_profile_id: voiceId }], company_voice_profiles: [{ id: voiceId, company_id: companyId, is_active: true, voice_description: 'Bound approved voice.' }] }).db;
 state.generate.mockReset(); state.generate.mockResolvedValue({ title: 'Title', markdownBody: 'Body', firstComment: null, wordCount: 1, postType: 'insight', imagePrompt: null, assets: [] });
});
describe('hosted writer author binding', () => {
 it.each(['week', 'blog', 'api-production'])('%s writing binds actual prompt voice to the verified author profile', async path => {
  const { provider } = await getContentProvider(companyId);
  const output = await provider.generate({ ...base, contentType: path === 'blog' ? 'blog_article' : 'social_post', voicePrompt: 'Wrong independently selected latest voice.', voiceDescription: 'Wrong.' });
  const actual = state.generate.mock.calls[0][0] as ContentGenerationInput;
  expect(actual.voiceProfileId).toBe(voiceId);
  expect(actual.voicePrompt).toBe('VOICE: Bound approved voice.');
  expect(actual.voiceDescription).toBe('Bound approved voice.');
  expect(output.rules?.sources.find(source => source.id === 'company-voice')?.sha256).toBe(sha256(actual.voicePrompt!));
  expect(output.rules?.voiceProfileId).toBe(voiceId);
 });
 it('fails before writing when author linkage is inactive or mismatched', async () => {
  state.db = productionTestDb({ company_spokespersons: [{ id: authorId, company_id: companyId, is_active: false, voice_profile_id: voiceId }] }).db;
  const { provider } = await getContentProvider(companyId);
  await expect(provider.generate(base)).rejects.toThrow('approved default author');
  expect(state.generate).not.toHaveBeenCalled();
 });
 it('does not add the personal author to company-channel or venue requests', async () => {
  const { provider } = await getContentProvider(companyId);
  for (const scope of [{ channel: 'linkedin_company', postPack: 'b2b' }, { channel: 'facebook', postPack: 'hospitality' }]) {
   const output = await provider.generate({ ...base, ...scope });
   expect(output.rules?.scope.authorId).toBeUndefined();
   expect(output.rules?.checks.bracketedAsides).toBe(false);
  }
 });
});
