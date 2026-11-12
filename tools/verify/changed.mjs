// dashkit · verify --changed [<rev>]: which pages and views must be checked after a change?
// Maps the changed files (git diff against <rev>, default HEAD, plus untracked files) to page → views. null = all views of the page.
// Conservative: a file that is not listed here counts as "everything". Tokens, CSS and shell files always mean everything.
// Sizes and themes are never narrowed. The full run stays mandatory at the end of a stage and in CI.
import { changedFiles } from '../lib/tree.mjs';

const ALL = 'all', NONE = 'none';
const G = (...views) => ({ gallery: views.length ? views : null });
const BOARDS = { board: null, 'board-de': null, 'board-fr': null };
const join = (...s) => Object.assign({}, ...s);

// First match wins.
export const RULES = [
  // nothing to render
  [/^(tests\/(?!snapshots\/)|\.github\/|\.gitignore$|LICENSE$|NOTICE$|VERSION$|CHANGELOG\.md$|README\.md$|AGENTS\.md$|jsconfig\.json$|tools\/(lint|brand|icons|vendor|shoot|serve|tempo-markdown)[./])/, NONE],
  // the gallery's own view files
  [/^gallery\/gallery-inputs\.js$/, G('inputs')],
  [/^gallery\/gallery-forms\.js$/, G('forms')],
  [/^gallery\/gallery2\.js$/, G('themes', 'controls', 'feedback', 'charts', 'shell')],
  [/^gallery\//, G()],
  // the sample board (all languages)
  [/^example\//, BOARDS],
  // components with a known footprint: gallery views and the board views that use them
  [/^js\/charts\//, join(G('charts', 'themes'), { board: ['overview', 'history'], 'board-de': ['overview', 'history'], 'board-fr': ['overview', 'history'] })],
  [/^js\/(table|filterbar|filters-data)\.js$/, join(G('table', 'cards', 'rows', 'states'), { board: ['jobs', 'hosts'], 'board-de': ['jobs', 'hosts'], 'board-fr': ['jobs', 'hosts'] })],
  [/^js\/(inputs|inputs-data|form|actionrun|actions-data)\.js$/, join(G('inputs', 'forms', 'states', 'feedback'), { board: ['jobs', 'deploy'], 'board-de': ['jobs', 'deploy'], 'board-fr': ['jobs', 'deploy'] })],
  [/^js\/markdown\.js$/, join(G('markdown', 'states'), { board: ['jobs'], 'board-de': ['jobs'], 'board-fr': ['jobs'] })],
  // snapshot files: exactly this page and view
  [/^tests\/snapshots\//, 'snapshot'],
  // everything else (tokens, css, shell, router, controls, components, i18n, locales, fonts, icons, tools/verify, …)
];

/** → { all: boolean, none: boolean, views: Map(page → Set|null), files, reasons[] } */
export function changedScope(root, rev) {
  const files = changedFiles(root, rev || 'HEAD');
  if (files === null) return { error: 'git is not available or the revision is unknown' };
  return scopeOf(files);
}

/** Pure part: list of changed files → scope */
export function scopeOf(files) {
  const views = new Map();
  let all = false;
  const add = (pageId, list) => {
    if (list === null) { views.set(pageId, null); return; }
    if (views.get(pageId) === null) return;
    const set = views.get(pageId) || new Set();
    for (const v of list) set.add(v);
    views.set(pageId, set);
  };
  for (const f of files) {
    const rule = RULES.find(([re]) => re.test(f));
    const target = rule ? rule[1] : ALL;
    if (target === NONE) continue;
    if (target === ALL) { all = true; continue; }
    if (target === 'snapshot') {
      const m = /^tests\/snapshots\/([^/]+)\/(.+?)__[^_/]+\.txt$/.exec(f);
      if (m) add(m[1], [m[2].replace(/~/g, '?').split('?')[0]]); else all = true;
      continue;
    }
    for (const [pageId, list] of Object.entries(target)) add(pageId, list);
  }
  return { all, none: !all && !views.size, views, files };
}

/** A viewFilter(pageId, view) plus the page list for the scope (null = no narrowing). */
export function scopeFilters(scope, allPages) {
  if (scope.all) return { pages: allPages, viewFilter: null };
  const pages = allPages.filter((p) => scope.views.has(p.id));
  return {
    pages,
    viewFilter: (pageId, view) => { const v = scope.views.get(pageId); return v === undefined ? false : v === null || v.has(view); },
  };
}

export function describeScope(scope) {
  if (scope.all) return `all pages and views (${scope.files.length} changed files, at least one touches tokens/css/shell or an unmapped file)`;
  if (scope.none) return `no UI-relevant change (${scope.files.length} changed files)`;
  return [...scope.views].map(([p, v]) => `${p}(${v === null ? 'all' : [...v].join(',')})`).join(' ');
}
