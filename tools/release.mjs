#!/usr/bin/env node
// tarn · release: one command from a green release branch to a pushed tag. Node ≥ 22, no npm packages.
//
//   node tools/release.mjs [--dry-run] [--yes] [--branch NAME] [--remote NAME] [--skip-fetch]
//
// Default is --dry-run: every step is printed, checks that only read run for real, nothing is changed.
// --yes does the release: ff main to the release branch, annotated tag vX.Y.Z, push main and the tag (atomic).
//
// Steps (docs/releasing.md):
//   1. preflight  clean tree · on a release branch (not main) · git fetch origin --tags · origin/main is an ancestor of HEAD ·
//                 VERSION = js/version.js = package.json = top CHANGELOG section · version > newest tag · release notes build
//   2. gates      a green verify stamp for exactly this tree (written by `verify --full --selftest`), otherwise the full selftest
//                 runs now (node tools/verify.mjs --full --selftest --jobs N)
//   3. main       fast-forward main to HEAD (in the worktree that has main checked out, else the ref) – never a merge commit
//   4. tag        annotated tag vX.Y.Z on HEAD, message = version
//   5. push       git push --atomic origin main vX.Y.Z (GitHub then runs verify and creates the release from the CHANGELOG section)
//
// Exit 0 done (or dry run complete) · 1 a check failed (nothing changed) · 2 usage/environment.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseNotes } from './lib/release-notes.mjs';
import { treeIdentity } from './lib/tree.mjs';
import { readStamp } from './lib/stamp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---- pure helpers (tests/release.test.mjs) ---- */
export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  return m ? m.slice(1, 4).map(Number) : null;
}
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
/** All version strings the release must agree on. → { VERSION, 'js/version.js', 'package.json', CHANGELOG } */
export function versionSources(files) {
  const js = /export const VERSION = '([^']+)'/.exec(files.versionJs)?.[1] ?? null;
  let pkg = null;
  try { pkg = JSON.parse(files.packageJson).version ?? null; } catch { /* reported as null */ }
  const top = /^## (\S+)( \(unreleased\))?/m.exec(files.changelog);   // "(unreleased)" on the top section: the round is not finished
  const cl = top ? top[1] + (top[2] || '') : null;
  return { VERSION: files.version.trim(), 'js/version.js': js, 'package.json': pkg, 'CHANGELOG.md (top section)': cl };
}
/** Newest vX.Y.Z of a tag list (other tags ignored). */
export function newestTag(tags) {
  return tags.filter((t) => parseVersion(t) && t.startsWith('v')).sort(compareVersions).at(-1) ?? null;
}

/* ---- arguments ---- */
function parseArgs(argv) {
  const o = { yes: false, branch: null, remote: 'origin', fetch: true, jobs: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.yes = false;
    else if (a === '--yes') o.yes = true;
    else if (a === '--branch') o.branch = argv[++i];
    else if (a === '--remote') o.remote = argv[++i];
    else if (a === '--skip-fetch') o.fetch = false;
    else if (a === '--jobs') o.jobs = argv[++i];
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
    else { console.log(`release: unknown option ${a} (--help)`); process.exit(2); }
  }
  return o;
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, { cwd: opts.cwd || ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const mode = o.yes ? 'RELEASE' : 'DRY RUN';
  const problems = [];
  const step = (s) => console.log(`${o.yes ? '' : '[dry-run] '}${s}`);
  const check = (ok, okText, badText) => { console.log(`  ${ok ? 'ok ' : 'NO '} ${ok ? okText : badText}`); if (!ok) problems.push(badText); return ok; };
  console.log(`release: ${mode} in ${ROOT}`);

  /* 1. preflight */
  console.log('1. preflight');
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
  check(branch !== 'HEAD' && branch !== 'main' && (!o.branch || branch === o.branch), `on release branch ${branch}`,
    `HEAD is ${branch}${o.branch ? `, expected ${o.branch}` : ''}: release from a branch other than main`);
  const dirty = git(['status', '--porcelain']).out;
  check(!dirty, 'working tree clean', `working tree not clean (${dirty.split('\n').length} entries): commit or stash first`);
  if (o.fetch) {
    const f = git(['fetch', o.remote, '--tags']);   // read-only towards the remote; updates remote-tracking refs and tags
    check(f.ok, `git fetch ${o.remote} --tags`, `git fetch ${o.remote} --tags failed: ${f.err.split('\n')[0]}`);
  } else console.log(`  --  git fetch skipped (--skip-fetch): ${o.remote}/main and tags may be stale`);
  const head = git(['rev-parse', 'HEAD']).out;
  const remoteMain = git(['rev-parse', `${o.remote}/main`]).out;
  check(git(['merge-base', '--is-ancestor', `${o.remote}/main`, 'HEAD']).ok, `${o.remote}/main ${remoteMain.slice(0, 7)} is an ancestor of HEAD ${head.slice(0, 7)}`,
    `${o.remote}/main is not an ancestor of HEAD: rebase onto ${o.remote}/main first`);
  const localMain = git(['rev-parse', 'main']).out;
  check(git(['merge-base', '--is-ancestor', 'main', 'HEAD']).ok, `local main ${localMain.slice(0, 7)} is an ancestor of HEAD (fast-forward possible)`,
    'local main is not an ancestor of HEAD: no fast-forward possible');
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const sources = versionSources({ version: read('VERSION'), versionJs: read('js/version.js'), packageJson: read('package.json'), changelog: read('CHANGELOG.md') });
  const version = sources.VERSION;
  const same = Object.values(sources).every((v) => v === version) && parseVersion(version);
  check(same, `version ${version} in ${Object.keys(sources).join(', ')}`, `versions disagree: ${Object.entries(sources).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  const tag = `v${version}`;
  const newest = newestTag(git(['tag', '--list', 'v*']).out.split('\n').filter(Boolean));
  check(parseVersion(version) && (!newest || compareVersions(version, newest) > 0), `${tag} is newer than the newest tag ${newest ?? '(none)'}`,
    `${tag} is not newer than the newest tag ${newest}`);
  check(!git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`]).ok, `tag ${tag} does not exist yet`, `tag ${tag} exists already`);
  const notes = parseVersion(version) ? releaseNotes(read('CHANGELOG.md'), version) : null;
  check(!!notes, `release notes build (${notes?.split('\n').length ?? 0} lines from CHANGELOG ## ${version})`, `CHANGELOG has no non-empty section ## ${version}`);
  if (problems.length) return finish(problems, o);

  /* 2. gates */
  console.log('2. gates');
  const id = treeIdentity(ROOT);
  const stamp = readStamp(ROOT, id);
  if (stamp.ok) console.log(`  ok  green verify stamp for this tree: ${stamp.line}`);
  else {
    console.log(`  --  no valid stamp (${stamp.reason}): the full selftest must run`);
    const cmd = [process.execPath, 'tools/verify.mjs', '--full', '--selftest', ...(o.jobs ? ['--jobs', String(o.jobs)] : [])];
    if (!o.yes) step(`would run: node ${cmd.slice(1).join(' ')}`);
    else {
      step(`running: node ${cmd.slice(1).join(' ')}`);
      const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, stdio: 'inherit' });
      check(r.status === 0, 'full selftest green', `full selftest not green (exit ${r.status})`);
      if (problems.length) return finish(problems, o);
      const again = readStamp(ROOT, treeIdentity(ROOT));
      check(again.ok, 'stamp written for this tree', `no stamp after a green run (${again.reason})`);
      if (problems.length) return finish(problems, o);
    }
  }

  /* 3. ff main, 4. tag, 5. push */
  const wt = git(['worktree', 'list', '--porcelain']).out.split('\n\n')
    .map((b) => ({ dir: /^worktree (.+)$/m.exec(b)?.[1], branch: /^branch (.+)$/m.exec(b)?.[1] }))
    .find((w) => w.branch === 'refs/heads/main');
  console.log('3. main');
  if (wt) {
    const wd = git(['status', '--porcelain', '--untracked-files=no'], { cwd: wt.dir }).out;
    check(!wd, `main is checked out in ${wt.dir} (clean)`, `main's worktree ${wt.dir} has changes: clean it first`);
    if (problems.length) return finish(problems, o);
    const args = ['-C', wt.dir, 'merge', '--ff-only', head];
    if (!o.yes) step(`would run: git ${args.join(' ')}`);
    else { step(`git ${args.join(' ')}`); const r = git(args); check(r.ok, `main → ${head.slice(0, 7)}`, `ff of main failed: ${r.err.split('\n')[0]}`); }
  } else {
    const args = ['update-ref', '-m', `release ${tag}: fast-forward`, 'refs/heads/main', head, localMain];
    if (!o.yes) step(`would run: git ${args.join(' ')}`);
    else { step(`git ${args.join(' ')}`); const r = git(args); check(r.ok, `main → ${head.slice(0, 7)}`, `ff of main failed: ${r.err.split('\n')[0]}`); }
  }
  if (problems.length) return finish(problems, o);
  console.log('4. tag');
  const tagArgs = ['tag', '-a', tag, '-m', version, head];
  if (!o.yes) step(`would run: git ${tagArgs.join(' ')}`);
  else { step(`git ${tagArgs.join(' ')}`); const r = git(tagArgs); check(r.ok, `tag ${tag}`, `tag failed: ${r.err.split('\n')[0]}`); }
  if (problems.length) return finish(problems, o);
  console.log('5. push');
  const pushArgs = ['push', '--atomic', o.remote, 'refs/heads/main:refs/heads/main', `refs/tags/${tag}:refs/tags/${tag}`];
  if (!o.yes) step(`would run: git ${pushArgs.join(' ')}`);
  else { step(`git ${pushArgs.join(' ')}`); const r = git(pushArgs); check(r.ok, `pushed main and ${tag}`, `push failed: ${r.err.split('\n')[0]}`); }
  return finish(problems, o, tag);
}

function finish(problems, o, tag) {
  if (problems.length) { console.log(`release: STOP – ${problems.length} problem(s); nothing ${o.yes ? 'further ' : ''}changed · exit 1`); return 1; }
  console.log(o.yes ? `release: ${tag} released · GitHub verify and release run on the push · exit 0` : 'release: dry run complete – run again with --yes to release · exit 0');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.log(`release: internal error – ${e.message}`); process.exit(2); });
}
