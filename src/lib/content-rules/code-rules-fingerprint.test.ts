import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import fingerprint from './code-rules-fingerprint.json';
import { CODE_RULES_VERSION, sha256 } from './resolve';
it('requires a reviewed code-rule fingerprint when prompts, checks or resolution change', () => {
  expect(fingerprint.version).toBe(CODE_RULES_VERSION);
  expect(sha256(fingerprint.paths.map(path => path + '\n' + readFileSync(path, 'utf8')).join('\n'))).toBe(fingerprint.sha256);
});
