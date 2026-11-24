import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseVersion, compareVersions, versionSources, newestTag } from '../tools/release.mjs';
import os from 'node:os';
import path from 'node:path';
import { judgeStamp, readStamp, writeStamp, stampDir, STAMP_KIND, MAX_AGE_DAYS } from '../tools/lib/stamp.mjs';
import { treeIdentity } from '../tools/lib/tree.mjs';

const root = new URL('../', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, root), 'utf8');

test('release: versions compare numerically, not as text', () => {
  assert.deepEqual(parseVersion('v0.16.0'), [0, 16, 0]);
  assert.equal(parseVersion('0.16'), null);
  assert.ok(compareVersions('0.16.0', '0.9.3') > 0);
  assert.ok(compareVersions('0.10.1', '0.10.0') > 0);
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0);
  assert.equal(newestTag(['v0.9.3', 'v0.16.0', 'v0.10.1', 'pre-x', 'v1.0']), 'v0.16.0');
  assert.equal(newestTag([]), null);
});

test('release: the four version sources of this repo agree (what preflight checks)', () => {
  const s = versionSources({ version: read('VERSION'), versionJs: read('js/version.js'), packageJson: read('package.json'), changelog: read('CHANGELOG.md') });
  assert.equal(new Set(Object.values(s)).size, 1, JSON.stringify(s));
});

test('release: a mismatching source is reported, not guessed', () => {
  const s = versionSources({ version: '0.2.0\n', versionJs: "export const VERSION = '0.2.0';", packageJson: '{"version":"0.1.9"}', changelog: '# C\n\n## 0.2.0\n\nx' });
  assert.equal(s['package.json'], '0.1.9');
  assert.notEqual(new Set(Object.values(s)).size, 1);
  assert.equal(versionSources({ version: '1.0.0', versionJs: '', packageJson: 'not json', changelog: '' })['package.json'], null);
  const open = versionSources({ version: '0.2.0', versionJs: "export const VERSION = '0.2.0';", packageJson: '{"version":"0.2.0"}', changelog: '## 0.2.0 (unreleased)\n\nx\n\n## 0.1.9\n' });
  assert.equal(open['CHANGELOG.md (top section)'], '0.2.0 (unreleased)', 'an unfinished round is not releasable');
});

test('stamp: valid only for the same tree, a green full selftest and within the age limit', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  const id = { commit: 'abc1234', tree: 't1' };
  const stamp = { kind: STAMP_KIND, exit: 0, tree: 't1', commit: 'abc1234', at: '2026-11-24T11:00:00Z', jobs: 4, seconds: 300 };
  assert.equal(judgeStamp(stamp, id, now).ok, true);
  assert.match(judgeStamp(null, id, now).reason, /no stamp/);
  assert.match(judgeStamp({ ...stamp, tree: 't2' }, id, now).reason, /another tree/);
  assert.equal(judgeStamp({ ...stamp, exit: 1 }, id, now).ok, false);
  assert.equal(judgeStamp({ ...stamp, kind: 'partial' }, id, now).ok, false);
  assert.equal(judgeStamp({ ...stamp, at: new Date(now - (MAX_AGE_DAYS + 1) * 86400000).toISOString() }, id, now).ok, false);
  assert.equal(judgeStamp({ ...stamp, at: 'garbage' }, id, now).ok, false);
  assert.equal(judgeStamp(stamp, { commit: 'x', tree: null }, now).ok, false);
});

test('stamp: written into the shared git dir, read back for the same tree, rejected after an edit', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-stamp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd: dir, encoding: 'utf8' });
  if (g('init', '-q').status !== 0) return t.skip('git not available');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one');
  g('add', '.'); g('commit', '-qm', 'one');
  const id = treeIdentity(dir);
  assert.equal(readStamp(dir, id).ok, false);
  const file = writeStamp(dir, { tree: id.tree, commit: id.commit, at: new Date().toISOString(), jobs: 4, seconds: 1 });
  assert.ok(file.startsWith(stampDir(dir)) && stampDir(dir).includes(`${path.sep}.git${path.sep}`), file);
  assert.equal(readStamp(dir, id).ok, true);
  assert.equal(treeIdentity(dir).tree, id.tree, 'the stamp itself does not change the tree');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'two');
  assert.equal(readStamp(dir, treeIdentity(dir)).ok, false);
});

test('release: --help works and an unknown option is refused (exit 2) without touching git', () => {
  const tool = new URL('../tools/release.mjs', import.meta.url).pathname;
  const h = spawnSync(process.execPath, [tool, '--help'], { encoding: 'utf8' });
  assert.equal(h.status, 0);
  assert.match(h.stdout, /--dry-run/);
  const bad = spawnSync(process.execPath, [tool, '--force'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});
