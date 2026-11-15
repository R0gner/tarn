// The content rules of verify (tools/verify/probe-content.js) and the kit agree: the info limit equals INFO_MAX, docs/checks.md names the limits the probe uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const probe = read('tools/verify/probe-content.js');
const limits = Object.fromEntries([...probe.match(/Object\.assign\(\{([^}]*)\}/)[1].matchAll(/(\w+): (\d+)/g)].map((m) => [m[1], Number(m[2])]));

test('content: the info limit of verify is INFO_MAX of the kit', () => {
  const max = Number(read('js/components.js').match(/export const INFO_MAX = (\d+);/)[1]);
  assert.equal(limits.info, max);
});

test('content: docs/checks.md names the limits the probe uses', () => {
  const doc = read('docs/checks.md');
  for (const k of ['card', 'section', 'tile', 'row']) assert.ok(doc.includes(`${k} ${limits[k]}`), `checks.md names “${k} ${limits[k]}”`);
  assert.ok(doc.includes(`from ${limits.words} words on`), `checks.md names the word threshold ${limits.words}`);
  assert.ok(doc.includes(`(${limits.info} characters)`), 'checks.md names the info limit');
});
