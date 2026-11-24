// tarn · verify stamp: proof that `verify --full --selftest` was green on exactly this tree content.
// Written by tools/verify.mjs after a green full selftest (own Chrome, no --base/--attach, tree unchanged from start to end), read by
// tools/release.mjs so that a release does not rerun a selftest that already ran green on the identical tree (a child's worktree counts:
// the stamp lives in the shared git directory and is keyed on the content hash of tools/lib/tree.mjs, not on the commit or the worktree).
// Local evidence only – never committed, never pushed. CI does not read it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const STAMP_KIND = 'full-selftest';
export const MAX_AGE_DAYS = 14;

/** Directory of the stamps: <git common dir>/tarn-verify/stamps, null without git */
export function stampDir(root) {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? path.join(r.stdout.trim(), 'tarn-verify', 'stamps') : null;
}

/** Pure: is this stamp valid for this identity? → { ok, reason?, line? } */
export function judgeStamp(stamp, id, now = Date.now()) {
  if (!id?.tree) return { ok: false, reason: 'no tree identity (git missing?)' };
  if (!stamp) return { ok: false, reason: 'no stamp for this tree' };
  if (stamp.tree !== id.tree) return { ok: false, reason: 'stamp belongs to another tree' };
  if (stamp.kind !== STAMP_KIND || stamp.exit !== 0) return { ok: false, reason: `stamp is ${stamp.kind} exit ${stamp.exit}, not a green ${STAMP_KIND}` };
  const age = (now - Date.parse(stamp.at)) / 86400000;
  if (!(age >= 0 && age <= MAX_AGE_DAYS)) return { ok: false, reason: `stamp is ${Math.round(age)} days old (max ${MAX_AGE_DAYS})` };
  return { ok: true, line: `${stamp.kind} green at ${stamp.at} (commit ${String(stamp.commit).slice(0, 7)}, ${stamp.jobs} workers, ${stamp.seconds} s, node ${stamp.node || '?'})` };
}

export function readStamp(root, id) {
  const dir = stampDir(root);
  if (!dir || !id?.tree) return judgeStamp(null, id);
  let stamp = null;
  try { stamp = JSON.parse(fs.readFileSync(path.join(dir, `${id.tree}.json`), 'utf8')); } catch { /* no stamp */ }
  return judgeStamp(stamp, id);
}

export function writeStamp(root, stamp) {
  const dir = stampDir(root);
  if (!dir || !stamp.tree) return null;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${stamp.tree}.json`);
  fs.writeFileSync(file, JSON.stringify({ kind: STAMP_KIND, exit: 0, ...stamp }, null, 1));
  return file;
}
