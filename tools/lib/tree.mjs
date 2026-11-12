// tarn · identity of the checked tree: git commit plus a content hash over all tracked and untracked (not ignored) files.
// A verify report carries both, so that `verify --selftest --base-report` can refuse a report that belongs to another state.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const git = (root, args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** → { commit, tree } ; tree = sha256 over "path\0sha256(content)" of all files (sorted), null without git */
export function treeIdentity(root) {
  const head = git(root, ['rev-parse', 'HEAD']);
  if (head.status !== 0) return { commit: null, tree: null };
  const ls = git(root, ['ls-files', '-co', '--exclude-standard', '-z']);
  if (ls.status !== 0) return { commit: head.stdout.trim(), tree: null };
  const h = crypto.createHash('sha256');
  for (const f of ls.stdout.split('\0').filter(Boolean).sort()) {
    let data;
    try { data = fs.readFileSync(path.join(root, f)); } catch { continue; } // listed but deleted in the working tree
    h.update(`${f}\0${crypto.createHash('sha256').update(data).digest('hex')}\n`);
  }
  return { commit: head.stdout.trim(), tree: h.digest('hex') };
}

/** Files that differ from `rev` (default HEAD: staged + unstaged) plus untracked files. → string[] | null without git */
export function changedFiles(root, rev = 'HEAD') {
  const d = git(root, ['diff', '--name-only', '-z', rev, '--']);
  if (d.status !== 0) return null;
  const u = git(root, ['ls-files', '-o', '--exclude-standard', '-z']);
  return [...new Set([...d.stdout.split('\0'), ...u.stdout.split('\0')].filter(Boolean))].sort();
}
