// tarn · verify check "types": TypeScript as a pure type checker over the JSDoc types of js/ (jsconfig.json, checkJs, no emit).
// TypeScript is never part of the kit and never runs in the browser: this check fetches a pinned version with npx on demand
// (the only npm package the tools ever use). Without network (and without a cached copy) the check is skipped with a note.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Pinned TypeScript version for the type check (released 2026-07-08, i.e. well over 7 days before it was pinned). */
export const TS_VERSION = '7.0.2';
const TIMEOUT_MS = 180_000;
const OFFLINE = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|network|offline|fetch failed|getaddrinfo|request to .* failed|ERR_SOCKET|ENOENT.*npx/i;
const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/**
 * Run `tsc -p jsconfig.json --noEmit` in `cwd`.
 * @returns {{ state: 'ok' | 'errors' | 'skipped' | 'broken', errors: Array<{ file: string, line: number, col: number, code: string, text: string }>, note: string }}
 */
export function runTsc(cwd) {
  const r = spawnSync('npx', ['--yes', '--prefer-offline', '-p', `typescript@${TS_VERSION}`, 'tsc', '-p', 'jsconfig.json', '--noEmit', '--pretty', 'false'], {
    cwd, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, npm_config_fetch_retries: '1', npm_config_fetch_retry_mintimeout: '1000', npm_config_fetch_retry_maxtimeout: '3000', npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' },
  });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const errors = out.split('\n').map((l) => ERROR_LINE.exec(l.trim())).filter(Boolean).map((m) => ({ file: m[1], line: Number(m[2]), col: Number(m[3]), code: m[4], text: m[5] }));
  if (r.error?.code === 'ENOENT') return { state: 'skipped', errors: [], note: 'npx not found' };
  if (r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM') return { state: 'skipped', errors: [], note: `no answer within ${TIMEOUT_MS / 1000} s (offline?)` };
  if (errors.length) return { state: 'errors', errors, note: '' };
  if (r.status === 0) return { state: 'ok', errors: [], note: '' };
  if (OFFLINE.test(out)) return { state: 'skipped', errors: [], note: `typescript@${TS_VERSION} could not be fetched (offline?)` };
  return { state: 'broken', errors: [], note: out.trim().split('\n').slice(-3).join(' ').slice(0, 200) || `tsc exit ${r.status}` };
}

/** verify findings and summary of the check. `skipped` carries the reason when the check could not run. */
export function typesFindings(root) {
  const r = runTsc(root);
  if (r.state === 'skipped') return { findings: [], summary: `types skipped (${r.note})`, skipped: r.note };
  if (r.state === 'broken') return { findings: [{ check: 'types', rule: 'tsc-failed', page: '-', view: '-', size: '-', theme: '-', sel: 'jsconfig.json', where: '', text: r.note }], summary: 'types broken', skipped: null };
  const findings = r.errors.map((e) => ({ check: 'types', rule: e.code, page: '-', view: e.file, size: '-', theme: '-', sel: `${e.file}:${e.line}`, where: '', text: e.text.slice(0, 160) }));
  return { findings, summary: r.state === 'ok' ? `types ok (typescript ${TS_VERSION})` : `types ${r.errors.length} errors`, skipped: null };
}

/**
 * Positive control: a copy of js/ with two planted type errors (unknown option, wrong argument type) must be reported.
 * Runs on a temp copy; the repository is not touched.
 */
export function typesMutant(root) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-types-mutant-'));
  try {
    fs.cpSync(path.join(root, 'js'), path.join(tmp, 'js'), { recursive: true });
    fs.copyFileSync(path.join(root, 'jsconfig.json'), path.join(tmp, 'jsconfig.json'));
    fs.appendFileSync(path.join(tmp, 'js', 'primitives.js'), "\nbadge('x', { colour: 'red' });\n");
    fs.appendFileSync(path.join(tmp, 'js', 'format.js'), "\nfmtNum('not a number');\n");
    const r = runTsc(tmp);
    if (r.state === 'skipped') return { ok: true, skipped: true, line: `selftest: types mutants skipped (${r.note})` };
    const codes = new Set(r.errors.map((e) => e.code));
    const a = codes.has('TS2353') || codes.has('TS2561'), b = codes.has('TS2345');
    return { ok: a && b, skipped: false, line: `selftest: types mutants unknown option ${a ? 'detected' : 'MISSED'}, wrong argument type ${b ? 'detected' : 'MISSED'}` };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
