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
  // the top entry is the version, or the next one marked "(unreleased)" while a round is under way (then the entry below it is the version)
  const heads = [...fs.readFileSync(new URL('CHANGELOG.md', root), 'utf8').matchAll(/^## (\S+)( \(unreleased\))?/gm)];
  const [top, next] = heads[0]?.[2] ? [heads[1]?.[1], heads[0][1]] : [heads[0]?.[1], null];
  assert.equal(top, file);
  if (next) assert.ok(next.localeCompare(file, undefined, { numeric: true }) > 0, 'an unreleased entry is newer than VERSION');
});
