// The documentation in docs/: the index lists every page, links resolve, and none of it ships with the runtime (vendor copy, npm package).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { profileFiles } from '../tools/lib/kit-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const pages = fs.readdirSync(DOCS).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
const read = (p) => fs.readFileSync(p, 'utf8');

test('docs: the index links every page of docs/', () => {
  const index = read(path.join(DOCS, 'README.md'));
  for (const f of pages) assert.ok(index.includes(`(${f})`), `docs/README.md does not link ${f}`);
});

test('docs: relative links in README.md, AGENTS.md and docs/ point to existing files', () => {
  const files = [path.join(ROOT, 'README.md'), path.join(ROOT, 'AGENTS.md'), path.join(DOCS, 'README.md'), ...pages.map((f) => path.join(DOCS, f))];
  for (const f of files) {
    for (const m of read(f).matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = m[1].split('#')[0];
      if (!href || /^[a-z]+:/i.test(href)) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(f), href)), `${path.relative(ROOT, f)} links ${m[1]}, which does not exist`);
    }
  }
});

test('docs: every page starts with a title and says what it covers (no empty or heading-only opening)', () => {
  for (const f of pages) {
    const lines = read(path.join(DOCS, f)).split('\n');
    assert.match(lines[0], /^# \S/, `${f}: first line is the title`);
    assert.equal(lines[1], '', `${f}: blank line after the title`);
    assert.ok(lines[2] && !lines[2].startsWith('#'), `${f}: an introduction follows the title`);
  }
});

test('docs: docs/ is not part of the runtime (vendor copy and package files)', () => {
  for (const profile of ['core', 'full']) {
    for (const f of profileFiles(profile, ROOT)) assert.ok(!f.startsWith('docs/') && f !== 'README.md', `${profile} profile contains ${f}`);
  }
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  for (const f of pkg.files) assert.ok(!f.startsWith('docs/'), `package.json files contains ${f}`);
});
