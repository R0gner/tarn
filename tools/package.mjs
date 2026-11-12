#!/usr/bin/env node
// tarn · package: keep package.json `files` equal to the full runtime profile of tools/lib/kit-files.mjs (the same list vendor.mjs copies).
//
//   node tools/package.mjs           rewrite `files` (and `version` from VERSION) in package.json
//   node tools/package.mjs --check   report a mismatch, change nothing (exit 1); tests/package.test.mjs does the same
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { profileFiles } from './lib/kit-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'package.json');

const pkg = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const want = { version: fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(), files: profileFiles('full', ROOT) };
const same = pkg.version === want.version && JSON.stringify(pkg.files) === JSON.stringify(want.files);
if (process.argv.includes('--check')) {
  console.log(same ? 'package.json: files and version match the kit lists · exit 0' : 'package.json: files or version differ from tools/lib/kit-files.mjs and VERSION; run node tools/package.mjs · exit 1');
  process.exit(same ? 0 : 1);
}
Object.assign(pkg, want);
fs.writeFileSync(FILE, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`package.json: version ${want.version}, ${want.files.length} files${same ? ' (unchanged)' : ' written'}`);
