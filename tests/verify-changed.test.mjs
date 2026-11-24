// verify --changed: mapping of changed files to pages/views; tree identity of the report
import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeOf, scopeFilters, selectMutants, hiddenMutants } from '../tools/verify/changed.mjs';
import { MUTANTS } from '../tools/verify/mutants.mjs';
import { SCENARIOS } from '../tools/verify/overlay.mjs';
import { PAGES } from '../tools/verify/targets.mjs';
import { treeIdentity } from '../tools/lib/tree.mjs';

test('tokens, css and shell mean everything', () => {
  for (const f of ['css/tokens.css', 'css/components.css', 'js/shell.js', 'js/i18n.js', 'js/locales/de.js', 'tools/verify/probe-geometry.js', 'something/unknown.txt']) {
    assert.equal(scopeOf([f]).all, true, f);
  }
});

test('docs, tests and workflows mean nothing', () => {
  const s = scopeOf(['README.md', 'docs/shell.md', 'docs/README.md', 'AGENTS.md', 'tests/format.test.mjs', '.github/workflows/verify.yml', 'CHANGELOG.md', 'tools/lint.mjs']);
  assert.equal(s.none, true);
  assert.equal(s.all, false);
});

test('a component file maps to the views that use it', () => {
  const s = scopeOf(['js/table.js']);
  assert.equal(s.all, false);
  assert.ok(s.views.get('gallery').has('table'));
  assert.ok(s.views.get('board').has('jobs'));
  assert.ok(!s.views.get('gallery').has('charts'));
  const f = scopeFilters(s, PAGES);
  assert.deepEqual(f.pages.map((p) => p.id), ['gallery', 'board', 'board-de', 'board-fr', 'gallery-comfortable']);   // the comfortable twin comes with the gallery
  assert.equal(f.viewFilter('gallery', 'table'), true);
  assert.equal(f.viewFilter('gallery', 'charts'), false);
});

test('gallery view files and the sample board', () => {
  assert.deepEqual([...scopeOf(['gallery/gallery-inputs.js']).views.get('gallery')], ['inputs']);
  assert.equal(scopeOf(['gallery/gallery.js']).views.get('gallery'), null);
  const b = scopeOf(['example/board.js']);
  assert.equal(b.views.has('gallery'), false);
  assert.equal(b.views.get('board'), null);
  assert.equal(b.views.get('board-de'), null);
});

test('a snapshot file maps to exactly its page and view', () => {
  const s = scopeOf(['tests/snapshots/board/jobs~open=offsite-sync__phone.txt']);
  assert.deepEqual([...s.views.get('board')], ['jobs']);
  assert.equal(s.views.has('gallery'), false);
});

test('two files merge; "all views" wins over a list', () => {
  const s = scopeOf(['js/table.js', 'gallery/gallery.js']);
  assert.equal(s.views.get('gallery'), null);
  assert.ok(s.views.get('board').has('hosts'));
});

test('treeIdentity: stable for an unchanged tree', () => {
  const a = treeIdentity(new URL('..', import.meta.url).pathname);
  const b = treeIdentity(new URL('..', import.meta.url).pathname);
  assert.equal(a.tree, b.tree);
  assert.match(a.tree, /^[0-9a-f]{64}$/);
});

test('the starter page is its own scope; input and form code reach it too', () => {
  const s = scopeOf(['starter/starter.js', 'starter/messages.js']);
  assert.equal(s.all, false);
  assert.deepEqual([...s.views.keys()].sort(), ['starter', 'starter-comfortable', 'starter-de', 'starter-de-comfortable']);
  assert.equal(s.views.get('starter'), null);
  const f = scopeFilters(s, PAGES);
  assert.deepEqual(f.pages.map((p) => p.id), ['starter', 'starter-de', 'starter-comfortable', 'starter-de-comfortable']);
  assert.ok(scopeOf(['js/form.js']).views.has('starter'));
});

// verify --selftest --changed: the selection must never hide a mutant whose patched file changed
const SC = Object.fromEntries(SCENARIOS.map((sc) => [sc.id, sc.page]));
test('selftest --changed: a change of a patched file selects its mutant, whatever the page map says', () => {
  assert.deepEqual(hiddenMutants(MUTANTS, selectMutants, SC), []);
});

test('selftest --changed: hiding a real change on purpose is caught (red)', () => {
  // a map that wrongly calls every change "nothing to render": the hidden change must show up as missed mutants
  const blind = (scope, mutants, sp) => selectMutants({ ...scope, all: false, none: true, views: new Map(), files: [] }, mutants, sp);
  assert.notDeepEqual(hiddenMutants(MUTANTS, blind, SC), [], 'a selection that ignores changed js files must be reported as hiding mutants');
});

test('selftest --changed: tools/ and shared files select everything, docs select nothing, a gallery view only its own', () => {
  const sel = (files) => selectMutants(scopeOf(files), MUTANTS, SC);
  assert.equal(sel(['tools/verify/overlay.mjs']).everything, true);
  assert.equal(sel(['css/tokens.css']).everything, true);
  assert.equal(sel(['docs/checks.md']).ids.length, 0);
  const g = sel(['gallery/gallery-inputs.js']);
  assert.equal(g.everything, false);
  assert.ok(g.ids.length > 0 && g.ids.length < MUTANTS.length);
  for (const id of g.ids) { const m = MUTANTS.find((x) => x.id === id); assert.ok(m.check === 'overlay' ? true : m.page.startsWith('gallery') && m.views.includes('inputs'), id); }
});
