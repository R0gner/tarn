// node --test tests/  ·  icons: generated files match icons/*.svg, the parser allows only known shapes
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, parseSvg, LUCIDE_VERSION } from '../tools/icons.mjs';
import { ICON_NAMES } from '../js/icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('js/icons-data.js and icons/SOURCES.md are up to date (node tools/icons.mjs build)', () => {
  for (const [rel, text] of Object.entries(generate())) assert.equal(fs.readFileSync(path.join(ROOT, rel), 'utf8'), text, rel);
});

test('manifest: fixed Lucide version, licence and source list present', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'icons', 'manifest.json'), 'utf8'));
  assert.equal(m.version, LUCIDE_VERSION);
  assert.ok(fs.readFileSync(path.join(ROOT, 'icons', 'LICENSE.txt'), 'utf8').startsWith('ISC License'));
  assert.match(fs.readFileSync(path.join(ROOT, 'icons', 'SOURCES.md'), 'utf8'), new RegExp(`Lucide\\]\\([^)]*\\) \\*\\*${LUCIDE_VERSION.replace(/\./g, '\\.')}\\*\\*`));
  for (const name of ['menu', 'x', 'chevron-right', 'check', 'alert', 'info', 'search', 'download']) assert.ok(ICON_NAMES.includes(name), name);
});

test('parseSvg: allowed shapes, otherwise an error', () => {
  const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h2"/><circle cx="1" cy="2" r="3" /></svg>';
  assert.deepEqual(parseSvg(ok), [['path', { d: 'M1 1h2' }], ['circle', { cx: '1', cy: '2', r: '3' }]]);
  assert.throws(() => parseSvg('<svg><script>alert(1)</script></svg>'), /not supported/);
  assert.throws(() => parseSvg('<svg><path d="M1" onload="x()"/></svg>'), /attribute onload/);
  assert.throws(() => parseSvg('<svg></svg>'), /no shapes/);
});
