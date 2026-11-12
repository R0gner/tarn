// node --test tests/  ·  board switcher: data checks (missing fields, duplicate ids, categories, unsafe addresses)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../js/i18n.js';
import { normalizeBoards, normalizeIcon, letterOf, colorOf, OTHER, TILE_COLORS } from '../js/boards-data.js';

const B = (id, extra = {}) => ({ id, name: `Board ${id}`, href: `/${id}/`, ...extra });

test('flat list: order is kept, one grid without a heading', () => {
  const r = normalizeBoards([B('a'), B('b'), B('c')]);
  assert.deepEqual(r.boards.map((b) => b.id), ['a', 'b', 'c']);
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].label, null);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.boards[0], { id: 'a', name: 'Board a', href: '/a/', icon: null, category: null });
});

test('missing fields: entry is dropped, problem is reported', () => {
  const r = normalizeBoards([B('ok'), { name: 'ohne id', href: '/x' }, { id: 'n', href: '/n' }, { id: 'h', name: 'ohne href' }, null, 'text', { id: ' ', name: 'x', href: '/' }]);
  assert.deepEqual(r.boards.map((b) => b.id), ['ok']);
  assert.equal(r.problems.length, 6);
  assert.match(r.problems.join('|'), /id missing/);
  assert.match(r.problems.join('|'), /name missing/);
  assert.match(r.problems.join('|'), /href missing/);
});

test('duplicate ids: the first wins', () => {
  const r = normalizeBoards([B('a', { name: 'Erstes' }), B('a', { name: 'Zweites' }), B('b')]);
  assert.deepEqual(r.boards.map((b) => b.name), ['Erstes', 'Board b']);
  assert.match(r.problems.join('|'), /duplicate id/);
});

test('categories: category order, unknown and missing ones end up in “Other”', () => {
  const cats = [{ id: 'infra', label: 'Infrastruktur' }, { id: 'medien', label: 'Medien' }, { id: 'leer', label: 'Leer' }];
  const r = normalizeBoards([B('m1', { category: 'medien' }), B('i1', { category: 'infra' }), B('x', { category: 'gibtsnicht' }), B('y'), B('i2', { category: 'infra' })], cats);
  assert.deepEqual(r.groups.map((g) => g.id), ['infra', 'medien', OTHER.id]);   // empty category is dropped, Other comes last
  assert.deepEqual(r.groups[0].boards.map((b) => b.id), ['i1', 'i2']);
  assert.deepEqual(r.groups[2].boards.map((b) => b.id), ['x', 'y']);
  assert.equal(r.groups[2].label, 'Other');
  assert.match(r.problems.join('|'), /unknown category "gibtsnicht"/);
});

test('categories in the JSON form { boards, categories }; the parameter wins', () => {
  const json = { boards: [B('a', { category: 'k' })], categories: [{ id: 'k', label: 'Aus JSON' }] };
  assert.equal(normalizeBoards(json).groups[0].label, 'Aus JSON');
  assert.equal(normalizeBoards(json, [{ id: 'k', label: 'Aus Config' }]).groups[0].label, 'Aus Config');
});

test('categories without configuration: the category field is ignored (flat)', () => {
  const r = normalizeBoards([B('a', { category: 'egal' })]);
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].label, null);
  assert.deepEqual(r.problems, []);
});

test('invalid categories: missing fields, duplicate id, reserved “Other”', () => {
  const r = normalizeBoards([B('a', { category: 'k' })], [{ id: 'k' }, { id: 'k', label: 'K' }, { id: 'k', label: 'K2' }, { id: OTHER.id, label: 'x' }]);
  assert.deepEqual(r.groups.map((g) => g.label), ['K']);
  assert.equal(r.problems.length, 3);
});

test('addresses: only http, https and relative', () => {
  const r = normalizeBoards([B('a', { href: 'https://example.com/a' }), B('b', { href: '../b/' }), B('c', { href: 'javascript:alert(1)' }), B('d', { href: '//evil.example/x' }), B('e', { href: 'data:text/html,x' }), B('f', { href: 'mailto:a@b.de' })]);
  assert.deepEqual(r.boards.map((b) => b.id), ['a', 'b']);
  assert.equal(r.problems.length, 4);
});

test('unusable input: empty list, problem', () => {
  for (const bad of [null, undefined, 'x', 3, {}, { boards: 'nein' }]) {
    const r = normalizeBoards(bad);
    assert.deepEqual(r.boards, []);
    assert.match(r.problems.join('|'), /no board list/);
  }
});

test('icons: URL, { icon, color } or letter tile (null)', () => {
  assert.deepEqual(normalizeIcon('favicon.svg'), { url: 'favicon.svg' });
  assert.deepEqual(normalizeIcon('https://example.com/i.svg'), { url: 'https://example.com/i.svg' });
  assert.deepEqual(normalizeIcon({ icon: 'server', color: 'purple' }), { icon: 'server', color: 'purple' });
  assert.deepEqual(normalizeIcon({ icon: 'server' }), { icon: 'server', color: 'accent' });
  for (const bad of [null, undefined, '', 'javascript:alert(1)', '//evil/i.svg', { color: 'red' }, 5, 'mailto:a@b.de']) assert.equal(normalizeIcon(bad), null, String(bad));
  const r = normalizeBoards([B('a', { icon: 'javascript:alert(1)' }), B('b', { icon: { icon: 'box' } })]);
  assert.equal(r.boards[0].icon, null);
  assert.deepEqual(r.boards[1].icon, { icon: 'box', color: 'accent' });
});

test('letter tile: first letter, fixed colour from the name', () => {
  assert.equal(letterOf('wartung'), 'W');
  assert.equal(letterOf('  ärger'), 'Ä');
  assert.equal(letterOf('— 3D-Druck'), '3');
  assert.equal(letterOf(''), '?');
  assert.equal(colorOf('Wartung'), colorOf('Wartung'));
  assert.ok(TILE_COLORS.includes(colorOf('Medien')));
  assert.ok(new Set(['Wartung', 'Medien', 'Netz', 'Backup', 'Fotos', 'Wiki', 'Druck', 'Strom'].map(colorOf)).size > 2); // spreads out
});
