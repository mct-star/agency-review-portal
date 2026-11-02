/** Builds a reviewable runtime source bundle from explicit local canon paths. Never writes live configuration. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
for (const name of ['--bible', '--brand', '--rulings', '--out']) if (!args.includes(name) || !option(name)) throw new Error(`Required: ${name}`);
const hash = value => createHash('sha256').update(value).digest('hex');
const bible = readFileSync(option('--bible'), 'utf8');
const brand = readFileSync(option('--brand'), 'utf8');
const rulingText = readFileSync(option('--rulings'), 'utf8');
const rulingData = JSON.parse(rulingText);
const rulingIds = ['D07', 'D08', 'D09', 'D10', 'D24', 'D25', 'D28'];
for (const id of rulingIds) if (!rulingData.decisions_for_michael?.some(rule => rule.id === id && rule.status === 'decided')) throw new Error(`Ruling not decided: ${id}`);
function section(text, heading) {
 const lines = text.split('\n'); const start = lines.findIndex(line => line === heading);
 if (start < 0) throw new Error(`Source heading missing: ${heading}`);
 const level = heading.match(/^#+/)[0].length;
 let end = start + 1;
 while (end < lines.length && !(new RegExp(`^#{1,${level}} `)).test(lines[end])) end++;
 return lines.slice(start, end).join('\n').trim();
}
const currentOverridesDocument = readFileSync(new URL('../src/lib/ops-content/brand-context.ts', import.meta.url), 'utf8');
const currentOverrides = currentOverridesDocument.match(/export const CURRENT_CONTENT_OVERRIDES = `([^`]+)`;/)?.[1];
if (!currentOverrides) throw new Error('Existing current content rulings are missing.');
const companyId = 'd338c3ca-7f6b-4ea8-9fff-c052ba91bbdd';
const refs = [];
function source(id, owner, full, heading, checks, extra = {}) {
 let text = section(full, heading);
 if (id === 'agency-formatting') text = text.split('\n').filter(line => !line.startsWith('- Opening lines:')).join('\n');
 const entry = { id, version: '2026-11-01', owner, ...(owner === 'shared_method' ? {} : { companyId }), text, sha256: hash(text), checks, ...extra,
   origin: { document: full === bible ? 'Content_Bible.md' : 'Brand_Context_Copy.md', documentSha256: hash(full), heading } };
 refs.push(entry); return entry;
}
// Extract exact source sections. The full Bible is never sent to a model.
source('bible-source-authority', 'company', bible, '## Source Authority and Scope', {});
source('bible-ai-tells', 'shared_method', bible, '### AI Tells', { bannedVocabulary: section(bible, '### AI Tells').split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2).toLowerCase()) });
source('agency-formatting', 'company', brand, '## Formatting rules', { noLongDashes: true, ukSpelling: true, titleFormat: true, exclamations: 'blog_asides' });
source('agency-credibility', 'company', brand, '## Stay credible', { healthcare: true });
for (const authorId of ['4befbb9a-c4d5-4ad9-b5d5-8daf3ed3f7cb']) {
 source(`michael-voice-${authorId}`, 'author', brand, '## Voice DNA, how AGENCY and Michael sound', { bracketedAsides: true }, { authorId, postPack: 'b2b' });
 source(`michael-formatting-${authorId}`, 'author', brand, '## Formatting rules', { firstWordNotI: true }, { authorId, postPack: 'b2b' });
 source(`michael-linkedin-${authorId}`, 'channel', brand, '## Structure essentials', {}, { authorId, channel: 'linkedin', postPack: 'b2b' });
}
refs.push({ id: 'current-content-rulings', version: 'existing-runtime-rulings', owner: 'channel', companyId,
 authorId: '4befbb9a-c4d5-4ad9-b5d5-8daf3ed3f7cb', channel: 'linkedin', postPack: 'b2b',
 text: currentOverrides, sha256: hash(currentOverrides), checks: {},
 origin: { document: 'ops-content/brand-context.ts', documentSha256: hash(currentOverridesDocument), heading: 'CURRENT_CONTENT_OVERRIDES' } });
const bundle = [{ companyId, version: 'agency-canon-2026-11-01',
 contextPolicy: { blueprintContent: 'required', sourceContext: 'optional', brandContext: 'optional', voicePrompt: 'optional' },
 defaultAuthor: { name: 'Michael Colling-Tuck', id: '4befbb9a-c4d5-4ad9-b5d5-8daf3ed3f7cb', voiceProfileId: '4800fe91-6b0c-4c0b-a626-545284ef7691' },
 approval: { reviewer: 'Michael delegated adoption coordinator', approvedAt: '2026-11-01', reference: 'content-bible-reconciliation.json; runtime bundle activation by PR review and merge', rulingsSha256: hash(rulingText), rulingIds },
 requiredSourceIds: ['bible-ai-tells', 'bible-source-authority', 'agency-formatting', 'agency-credibility'], scopedRequirements: refs.filter(source => source.authorId).map(({ id, authorId, channel, postPack }) => ({ id, authorId, ...(channel ? { channel } : {}), postPack })), sources: refs }];
const result = JSON.stringify(bundle, null, 2) + '\n';
if (args.includes('--check')) {
 if (readFileSync(option('--out'), 'utf8') !== result) throw new Error('Canon bundle is stale. Regenerate and review its diff.');
 console.log('Canon bundle matches its source sections and document hashes.');
} else {
 writeFileSync(option('--out'), result);
 console.log(`Staged ${refs.length} scoped extracts; ${Buffer.byteLength(result)} bytes. Review and merge before activation.`);
}
