// verify --changed: mapping of changed files to pages/views; tree identity of the report
import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeOf, scopeFilters } from '../tools/verify/changed.mjs';
import { PAGES } from '../tools/verify/targets.mjs';
import { treeIdentity } from '../tools/lib/tree.mjs';

test('tokens, css and shell mean everything', () => {
  for (const f of ['css/tokens.css', 'css/components.css', 'js/shell.js', 'js/i18n.js', 'js/locales/de.js', 'tools/verify/probe-geometry.js', 'something/unknown.txt']) {
    assert.equal(scopeOf([f]).all, true, f);
  }
});

test('docs, tests and workflows mean nothing', () => {
  const s = scopeOf(['README.md', 'tests/format.test.mjs', '.github/workflows/verify.yml', 'CHANGELOG.md', 'tools/lint.mjs']);
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
  assert.deepEqual(f.pages.map((p) => p.id), ['gallery', 'board', 'board-de', 'board-fr']);
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
