// @ts-check
// tarn · Board switcher: data validation (pure, no DOM, testable in Node).
//
// boards: [{ id, name, href, icon?, category? }] or { boards, categories }; categories: [{ id, label }] (order).
//   icon: URL (relative/http/https) or { icon, color } like favicon(); if missing, the switcher shows a letter tile.
// Rules: entries without id, name or href, with a duplicate id or an unsafe href (only http, https and relative) are dropped;
// each case is listed in problems. If categories are configured, entries without or with an unknown category end up in
// “Other” (at the very bottom). Without categories there is a flat grid.
import { safeUrl } from './markdown.js';
import { getLocale, t } from './i18n.js';

/** @typedef {string | { url?: string, icon?: string, color?: string } | null | undefined} IconSpec URL (relative, http, https) or { icon, color } like favicon(). */
/** @typedef {{ id: string, name: string, href: string, icon?: IconSpec, category?: string | null }} BoardEntry One board of the switcher. */
/** @typedef {{ id: string, label: string }} BoardCategory */
/** @typedef {BoardEntry[] | { boards: BoardEntry[], categories?: BoardCategory[] }} BoardList */
/** @typedef {{ url: string } | { icon: string, color: string } | null} NormalizedIcon */
/** @typedef {{ id: string, name: string, href: string, icon: NormalizedIcon, category: string | null }} NormalizedBoard */
/** @typedef {{ id: string | null, label: string | null, boards: NormalizedBoard[] }} BoardGroup */
/** @typedef {{ boards: NormalizedBoard[], groups: BoardGroup[], problems: string[] }} NormalizedBoards */

/** The catch-all category. */
export const OTHER = { id: '_other', get label() { return t('common.other'); } };
export const TILE_COLORS = ['blue', 'purple', 'pink', 'orange', 'green', 'graphite'];

/**
 * @param {unknown} v
 */
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Display letter of a tile (first letter or digit of the name, uppercase).
 * @param {unknown} name
 * @returns {string}
 */
export function letterOf(name) {
  const m = /[\p{L}\p{N}]/u.exec(String(name ?? ''));
  return m ? m[0].toLocaleUpperCase(getLocale()) : '?';
}
/**
 * Fixed tile color derived from the name (always the same for the same name).
 * @param {unknown} name
 * @returns {string}
 */
export function colorOf(name) {
  let x = 0;
  for (const ch of String(name ?? '')) x = (x * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return TILE_COLORS[x % TILE_COLORS.length];
}

/**
 * Validate an icon spec → { url } | { icon, color } | null (null = letter tile).
 * @param {any} spec
 * @returns {NormalizedIcon}
 */
export function normalizeIcon(spec) {
  if (spec && typeof spec === 'object' && typeof spec.url === 'string') return normalizeIcon(spec.url); // already normalized
  if (typeof spec === 'string') { const u = safeUrl(spec); return u && !/^mailto:/i.test(u.href) ? { url: u.href } : null; }
  if (spec && typeof spec === 'object' && typeof spec.icon === 'string' && spec.icon) return { icon: spec.icon, color: typeof spec.color === 'string' && spec.color ? spec.color : 'accent' };
  return null;
}

/**
 * normalizeBoards(input, categories?) → { boards, groups, problems }
 *   boards  validated entries { id, name, href, icon, category } in input order
 *   groups  [{ id, label, boards }]: without categories one entry { id: null, label: null }, otherwise by category
 *           (non-empty ones only, “Other” last)
 *   problems  discarded or re-sorted entries as text
 * @param {any} input a BoardList; anything else is reported in problems
 * @param {BoardCategory[]} [categoriesIn]
 * @returns {NormalizedBoards}
 */
export function normalizeBoards(input, categoriesIn) {
  /** @type {string[]} */
  const problems = [];
  const list = Array.isArray(input) ? input : Array.isArray(input?.boards) ? input.boards : [];
  if (!Array.isArray(input) && !Array.isArray(input?.boards)) problems.push('no board list (expected an array or { boards, categories })');
  const rawCats = Array.isArray(categoriesIn) ? categoriesIn : Array.isArray(input?.categories) ? input.categories : [];

  /** @type {BoardCategory[]} */
  const cats = [];
  for (const [i, c] of rawCats.entries()) {
    const id = str(c?.id), label = str(c?.label);
    if (!id || !label) { problems.push(`category ${i + 1}: id or label missing`); continue; }
    if (cats.some((x) => x.id === id) || id === OTHER.id) { problems.push(`category "${id}": duplicate id`); continue; }
    cats.push({ id, label });
  }

  /** @type {NormalizedBoard[]} */
  const boards = [];
  const seen = new Set();
  for (const [i, b] of list.entries()) {
    const id = str(b?.id), name = str(b?.name), href = str(b?.href);
    const who = id || name || `entry ${i + 1}`;
    if (!id) { problems.push(`${who}: id missing`); continue; }
    if (!name) { problems.push(`${who}: name missing`); continue; }
    if (!href) { problems.push(`${who}: href missing`); continue; }
    if (seen.has(id)) { problems.push(`${who}: duplicate id`); continue; }
    const url = safeUrl(href);
    if (!url || /^mailto:/i.test(url.href)) { problems.push(`${who}: href not allowed (only http, https, relative)`); continue; }
    seen.add(id);
    let category = str(b.category) || null;
    if (cats.length && (!category || !cats.some((c) => c.id === category))) {
      if (category) problems.push(`${who}: unknown category "${category}" → Other`);
      category = OTHER.id;
    }
    boards.push({ id, name, href: url.href, icon: normalizeIcon(b.icon), category: cats.length ? category : null });
  }

  /** @type {BoardGroup[]} */
let groups;
  if (!cats.length) groups = [{ id: null, label: null, boards }];
  else groups = [...cats, { id: OTHER.id, label: OTHER.label }].map((c) => ({ ...c, boards: boards.filter((b) => b.category === c.id) })).filter((g) => g.boards.length);
  return { boards, groups, problems };
}
