import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { releaseNotes } from '../tools/lib/release-notes.mjs';

const log = `# Changelog

Intro text.

## 0.5.10

### Added
- ten

## 0.5.1 (2026-01-02)

### Fixed
- one
- more

## 0.5.0

### Added
- last section
`;

test('release notes: a section in the middle ends at the next heading', () => {
  assert.equal(releaseNotes(log, '0.5.1'), '### Fixed\n- one\n- more');
});

test('release notes: the last section runs to the end of the file', () => {
  assert.equal(releaseNotes(log, '0.5.0'), '### Added\n- last section');
});

test('release notes: the first section does not take the intro', () => {
  assert.equal(releaseNotes(log, '0.5.10'), '### Added\n- ten');
});

test('release notes: a missing version or an empty section gives null', () => {
  assert.equal(releaseNotes(log, '0.9.9'), null);
  assert.equal(releaseNotes('## 1.0.0\n\n## 0.9.0\n- x\n', '1.0.0'), null);
});

test('release notes: a version is not a prefix match (0.5.1 vs 0.5.10, 0.5 vs 0.5.1)', () => {
  assert.ok(releaseNotes(log, '0.5.1').includes('one'));
  assert.ok(!releaseNotes(log, '0.5.1').includes('ten'));
  assert.equal(releaseNotes(log, '0.5'), null);
  assert.equal(releaseNotes('## 0.5.10\n- x\n', '0.5.1'), null);
});

test('release notes: an "(unreleased)" suffix is allowed, CRLF is handled', () => {
  assert.equal(releaseNotes('## 0.6.0 (unreleased)\r\n- a\r\n\r\n## 0.5.3\r\n- b\r\n', '0.6.0'), '- a');
});

test('release notes tool: the version in VERSION has notes; a missing one exits 1', () => {
  const tool = new URL('../tools/release-notes.mjs', import.meta.url).pathname;
  const version = fs.readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
  assert.ok(execFileSync('node', [tool], { encoding: 'utf8' }).trim().length > 0);
  assert.equal(execFileSync('node', [tool, version], { encoding: 'utf8' }), execFileSync('node', [tool], { encoding: 'utf8' }));
  const r = spawnSync('node', [tool, '99.99.99'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /99\.99\.99/);
});
