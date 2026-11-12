#!/usr/bin/env node
// tarn · vendor: copy a fixed version of the kit into a board (`<board>/vendor/tarn/`), Node ≥ 22, no npm packages.
//
//   node tools/vendor.mjs --to <board>/vendor/tarn                    copy (first time) or update, profile full
//   node tools/vendor.mjs --to <site>/vendor/tarn --profile core      copy only the core (no shell): for plain pages
//   node tools/vendor.mjs --to <board>/vendor/tarn --check            report local changes, the version and the profile, change nothing
//
// Copies only what the browser loads: the css/ and js/ files of the profile, fonts/ (woff2, OFL texts, SOURCES.md), icons/ (svg, LICENSE.txt,
// SOURCES.md), plus VERSION, LICENSE and NOTICE. Not copied: tests, tools, gallery, example. Profiles: `full` = core + ops shell (default),
// `core` = core only; the file lists live in tools/lib/kit-files.mjs (the same lists feed package.json and lint).
// Writes `SHA256SUMS` (sha256sum format, `cd <dir> && sha256sum -c SHA256SUMS` works) as the record of what was copied; its first line
// `# profile: core|full` tells --check and later updates which profile the copy has. An update keeps the profile of the existing copy unless
// --profile is given (then files outside the new profile are removed).
//
// An update is a deliberate step: it refuses when files of the copy were changed locally (compared with SHA256SUMS) or when the
// folder is not a vendored copy; `--force` overwrites anyway. Files that left the kit since the last copy are removed; files that
// are not part of the copy are reported and left alone. The tool never writes into the Tarn repository itself.
//
// Options: --to DIR (required) · --profile core|full · --check · --force · --dry-run (copy mode: report only) · -h/--help
// Exit codes: 0 done / copy intact · 1 local changes, missing or foreign files (check) or update refused · 2 usage or environment error.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { profileFiles, PROFILES, TOP } from './lib/kit-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'SHA256SUMS';
const PROFILE_RE = /^# profile: (core|full)$/m;

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => p.split(path.sep).join('/');

function usage(code, msg) {
  if (msg) console.error(`vendor: ${msg}`);
  const out = code ? console.error : console.log;
  out('usage: node tools/vendor.mjs --to <board>/vendor/tarn [--profile core|full] [--check] [--force] [--dry-run]');
  process.exit(code);
}

function parseArgs(argv) {
  const o = { to: null, profile: null, check: false, force: false, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--to') o.to = argv[++i];
    else if (a.startsWith('--to=')) o.to = a.slice(5);
    else if (a === '--profile') o.profile = argv[++i];
    else if (a.startsWith('--profile=')) o.profile = a.slice(10);
    else if (a === '--check') o.check = true;
    else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dry = true;
    else if (a === '-h' || a === '--help') usage(0);
    else usage(2, `unknown option ${a}`);
  }
  if (!o.to) usage(2, '--to <dir> is required');
  if (o.profile && !PROFILES.includes(o.profile)) usage(2, `unknown profile ${o.profile} (core | full)`);
  return o;
}

/** Runtime files of the source checkout for a profile: Map(relative path → Buffer), plus notes about optional files that are missing. */
export function collectSource(root = ROOT, profile = 'full') {
  const files = new Map(), notes = [];
  for (const f of profileFiles(profile, root)) files.set(f, fs.readFileSync(path.join(root, f)));
  if (!files.has('VERSION')) throw new Error(`VERSION is missing in ${root}`);
  for (const name of TOP) if (!files.has(name)) notes.push(`${name} not present in the kit yet (not copied)`);
  return { files, notes };
}

export function manifestText(files, profile = 'full') {
  return `# profile: ${profile}\n` + [...files].sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, buf]) => `${sha(buf)}  ${p}`).join('\n') + '\n';
}

export function readManifest(dir) {
  const f = path.join(dir, MANIFEST);
  if (!fs.existsSync(f)) return null;
  const m = new Map();
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const x = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (x) m.set(x[2], x[1]);
  }
  return m;
}

/** Profile recorded in the manifest header ('full' for copies made before profiles existed); null without a manifest. */
export function readProfile(dir) {
  const f = path.join(dir, MANIFEST);
  if (!fs.existsSync(f)) return null;
  return PROFILE_RE.exec(fs.readFileSync(f, 'utf8'))?.[1] || 'full';
}

/** Files below dir (except the manifest): Map(relative path → sha256). */
function listDir(dir) {
  const m = new Map();
  (function go(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) go(p);
      else if (e.isFile()) { const r = rel(path.relative(dir, p)); if (r !== MANIFEST) m.set(r, sha(fs.readFileSync(p))); }
    }
  })(dir);
  return m;
}

/** Compare a vendored folder with its manifest: { modified, missing, extra } (sorted path lists). */
export function checkDir(dir) {
  const man = readManifest(dir);
  if (!man) return null;
  const have = listDir(dir), modified = [], missing = [], extra = [];
  for (const [p, h] of man) { if (!have.has(p)) missing.push(p); else if (have.get(p) !== h) modified.push(p); }
  for (const p of have.keys()) if (!man.has(p)) extra.push(p);
  return { modified: modified.sort(), missing: missing.sort(), extra: extra.sort(), count: man.size };
}

const versionOf = (dir) => { try { return fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim(); } catch { return '?'; } };
const brief = (list, n = 4) => list.slice(0, n).join(', ') + (list.length > n ? ` … +${list.length - n}` : '');
const inside = (p, base) => p === base || p.startsWith(base + path.sep);

/** Resolve through existing parents so that symlinks cannot point the target into the repository. */
function resolveTarget(p) {
  let cur = path.resolve(p); const tail = [];
  while (!fs.existsSync(cur)) { tail.unshift(path.basename(cur)); const up = path.dirname(cur); if (up === cur) break; cur = up; }
  return path.join(fs.realpathSync(cur), ...tail);
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const dest = resolveTarget(o.to);
  if (inside(dest, fs.realpathSync(ROOT))) { console.error('vendor: the target is inside the Tarn repository; the tool never writes there'); process.exit(2); }

  const existing = fs.existsSync(dest) ? readProfile(dest) : null;   // profile of an existing vendored copy, else null
  if (o.check) {
    if (!fs.existsSync(dest)) { console.error(`vendor: ${o.to} does not exist`); process.exit(2); }
    if (!existing) { console.error(`vendor: ${o.to} has no ${MANIFEST}; not a vendored tarn copy`); process.exit(2); }
  }
  const profile = o.check ? existing : o.profile || existing || 'full';
  let src;
  try { src = collectSource(ROOT, profile); } catch (e) { console.error(`vendor: ${e.message}`); process.exit(2); }
  const srcVersion = src.files.get('VERSION').toString().trim();

  if (o.check) {
    const c = checkDir(dest);
    const v = versionOf(dest);
    const lines = [`vendor: tarn ${v} (profile ${profile}) in ${o.to} · ${c.count} files · kit source ${srcVersion}`];
    let bad = c.modified.length + c.missing.length + c.extra.length;
    if (o.profile && o.profile !== profile) { bad++; lines.push(`PROFILE is ${profile}, not ${o.profile} (switch with: vendor.mjs --to ${o.to} --profile ${o.profile})`); }
    if (c.modified.length) lines.push(`CHANGED locally (${c.modified.length}): ${brief(c.modified)}`);
    if (c.missing.length) lines.push(`MISSING (${c.missing.length}): ${brief(c.missing)}`);
    if (c.extra.length) lines.push(`FOREIGN files (${c.extra.length}): ${brief(c.extra)}`);
    const man = readManifest(dest);
    const differs = [...src.files].filter(([p, buf]) => man.get(p) !== sha(buf)).length + [...man.keys()].filter((p) => !src.files.has(p)).length;
    lines.push(differs ? `update available: the kit source differs in ${differs} files (${v === srcVersion ? 'same version number, other content' : `${v} → ${srcVersion}`}); run without --check to update` : 'up to date with the kit source');
    lines.push(bad ? `local changes · exit 1` : 'copy intact · exit 0');
    console.log(lines.join('\n'));
    process.exit(bad ? 1 : 0);
  }

  // copy / update
  let old = null;
  if (fs.existsSync(dest)) {
    if (!fs.statSync(dest).isDirectory()) { console.error(`vendor: ${o.to} is not a folder`); process.exit(2); }
    const entries = fs.readdirSync(dest);
    old = checkDir(dest);
    if (!old && entries.length && !o.force) { console.error(`vendor: ${o.to} is not empty and not a vendored tarn copy (no ${MANIFEST}); use an empty folder or --force`); process.exit(2); }
    if (old && (old.modified.length || old.missing.length) && !o.force) {
      console.log([`vendor: update refused, the copy in ${o.to} was changed locally (compare with --check):`,
        old.modified.length ? `CHANGED (${old.modified.length}): ${brief(old.modified)}` : null, old.missing.length ? `MISSING (${old.missing.length}): ${brief(old.missing)}` : null,
        'keep the changes elsewhere or use --force to overwrite · exit 1'].filter(Boolean).join('\n'));
      process.exit(1);
    }
  }
  const oldMan = old ? readManifest(dest) : new Map();
  const added = [], changed = [], removed = [];
  for (const [p, buf] of src.files) { const f = path.join(dest, p); if (!fs.existsSync(f)) added.push(p); else if (sha(buf) !== sha(fs.readFileSync(f))) changed.push(p); }
  for (const p of oldMan.keys()) if (!src.files.has(p) && fs.existsSync(path.join(dest, p))) removed.push(p);
  const from = old ? versionOf(dest) : null;
  const summary = `${from ? `${from} → ` : ''}${srcVersion} · profile ${profile}${existing && existing !== profile ? ` (was ${existing})` : ''} · ${src.files.size} files (${added.length} new, ${changed.length} changed, ${removed.length} removed)`;
  if (o.dry) { console.log(`vendor: dry run, nothing written: ${summary}`); process.exit(0); }

  for (const [p, buf] of src.files) { const f = path.join(dest, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); }
  for (const p of removed) fs.rmSync(path.join(dest, p), { force: true });
  for (const p of removed) { // drop folders that became empty
    for (let d = path.dirname(path.join(dest, p)); inside(d, dest) && d !== dest; d = path.dirname(d)) { if (!fs.existsSync(d)) continue; if (fs.readdirSync(d).length) break; fs.rmdirSync(d); }
  }
  fs.writeFileSync(path.join(dest, MANIFEST), manifestText(src.files, profile));
  const foreign = checkDir(dest).extra;
  console.log([`vendor: ${summary}`, `to ${o.to}`, ...src.notes.map((n) => `note: ${n}`), foreign.length ? `note: ${foreign.length} foreign files left alone: ${brief(foreign)}` : null,
    'next: run the board\'s own checks (verify) before committing the update'].filter(Boolean).join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
