// The gallery navigation says which part each view shows: every group heading starts with "Core · " or "Shell · ",
// the first view opens a group and the order is core first, then shell.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../gallery/gallery.js', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('views: ['), src.indexOf('/* The sidebar counter'));
const views = [...block.matchAll(/\{ id: '([\w-]+)'(?:, group: '([^']+)')?/g)].map((m) => ({ id: m[1], group: m[2] || null }));

test('gallery navigation: every group heading names core or shell', () => {
  assert.ok(views.length >= 12, `found ${views.length} views`);
  assert.ok(views[0].group, 'the first view opens a group');
  const groups = views.filter((v) => v.group).map((v) => v.group);
  for (const g of groups) assert.match(g, /^(Core|Shell) · \S/, g);
  const parts = groups.map((g) => g.split(' · ')[0]);
  assert.deepEqual(parts, [...parts].sort((a, b) => (a === b ? 0 : a === 'Core' ? -1 : 1)), 'core groups come before shell groups');
  assert.ok(parts.includes('Core') && parts.includes('Shell'));
});

test('gallery navigation: core views are the ones that need no shell', () => {
  let part = null;
  const byPart = { Core: [], Shell: [] };
  for (const v of views) { if (v.group) part = v.group.split(' · ')[0]; byPart[part].push(v.id); }
  assert.deepEqual(byPart.Core, ['foundations', 'themes', 'buttons', 'controls', 'inputs', 'forms']);
  assert.ok(['cards', 'rows', 'table', 'actions', 'feedback', 'charts', 'markdown', 'states', 'shell'].every((id) => byPart.Shell.includes(id)));
});
