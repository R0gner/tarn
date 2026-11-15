#!/usr/bin/env node
// tarn · prints the CHANGELOG section of a version (the text of its GitHub release).
//   node tools/release-notes.mjs [version]     without an argument: the version in VERSION
// Exit 0 with the section on stdout; exit 1 with a message on stderr when the section is missing or empty.
import fs from 'node:fs';
import { releaseNotes } from './lib/release-notes.mjs';

const root = new URL('../', import.meta.url);
const version = (process.argv[2] ?? fs.readFileSync(new URL('VERSION', root), 'utf8')).trim().replace(/^v/, '');
const text = releaseNotes(fs.readFileSync(new URL('CHANGELOG.md', root), 'utf8'), version);
if (!text) {
  console.error(`release-notes: CHANGELOG.md has no section "## ${version}", or it is empty`);
  process.exit(1);
}
console.log(text);
