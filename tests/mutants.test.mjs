// tarn · every source mutant of verify --selftest still applies to the current file (a stale patch only showed up minutes into the full
// selftest, as a follow-on error of the page that lost its file: 0.16.0, media-row-two-lines after mediaRow got `go`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTANTS } from '../tools/verify/mutants.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every mutant patch applies to the current source', () => {
  const stale = [];
  for (const m of MUTANTS) {
    for (const p of m.patch || []) {
      const text = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
      if (!text.includes(p.from)) stale.push(`${m.id}: ${p.file}`);
    }
  }
  assert.deepEqual(stale, [], 'patch.from no longer in the file: adjust the mutant to the changed source');
});

test('mutant ids are unique', () => {
  const ids = MUTANTS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});
