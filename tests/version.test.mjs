import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERSION } from '../js/version.js';

const root = new URL('../', import.meta.url);

test('VERSION: the file, the JS export and the top CHANGELOG entry agree', () => {
  const file = fs.readFileSync(new URL('VERSION', root), 'utf8').trim();
  assert.match(file, /^\d+\.\d+\.\d+$/);
  assert.equal(VERSION, file);
  // the entry points need a DOM to load, so the export is checked in the source: core.js exports it, the barrel re-exports core.js
  assert.match(fs.readFileSync(new URL('js/core.js', root), 'utf8'), /export \{ VERSION \} from '\.\/version\.js';/);
  assert.match(fs.readFileSync(new URL('js/tarn.js', root), 'utf8'), /export \* from '\.\/core\.js';/);
  const top = fs.readFileSync(new URL('CHANGELOG.md', root), 'utf8').match(/^## (\S+)/m)?.[1];
  assert.equal(top, file);
});
