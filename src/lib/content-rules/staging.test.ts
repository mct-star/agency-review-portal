import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import bundles from './approved-bundles.json';
it('stage --check refuses a changed required canon section until the bundle is rebuilt', () => {
 const dir = mkdtempSync(join(process.cwd(), '.canon-fixture-'));
 try {
  const sources = bundles[0].sources;
  const bible = sources.filter(source => source.origin.document === 'Content_Bible.md').map(source => source.text).join('\n\n');
  const uniqueBrand = new Map<string, string>();
  for (const source of sources.filter(source => source.origin.document === 'Brand_Context_Copy.md')) uniqueBrand.set(source.origin.heading, source.text);
  const brand = [...uniqueBrand.values()].join('\n\n');
  writeFileSync(join(dir, 'bible.txt'), bible);
  writeFileSync(join(dir, 'brand.txt'), brand);
  writeFileSync(join(dir, 'rulings.json'), JSON.stringify({ decisions_for_michael: bundles[0].approval.rulingIds.map(id => ({ id, status: 'decided' })) }));
  const args = ['scripts/stage-content-canon.mjs', '--bible', join(dir, 'bible.txt'), '--brand', join(dir, 'brand.txt'), '--rulings', join(dir, 'rulings.json'), '--out', join(dir, 'bundle.json')];
  expect(spawnSync(process.execPath, args).status).toBe(0);
  expect(spawnSync(process.execPath, [...args, '--check']).status).toBe(0);
  writeFileSync(join(dir, 'bible.txt'), bible.replace('- Delve', '- Changed required canon rule'));
  const changed = spawnSync(process.execPath, [...args, '--check']);
  expect(changed.status).not.toBe(0);
  expect(changed.stderr.toString()).toContain('Canon bundle is stale');
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
