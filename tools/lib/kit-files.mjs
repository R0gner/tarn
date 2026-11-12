// tarn · kit files: the one place that says which runtime file belongs to the core and which to the ops shell.
// Feeds tools/vendor.mjs (profiles core | full), package.json (`files`, checked by tests/package.test.mjs) and tools/lint.mjs
// (rules `classified` and `layers`). Add a new css/ or js/ file here, otherwise lint is red.
//
//   core  = tokens, fonts, base CSS, icons, format/i18n/dom helpers, primitives (button, badge, statusDot, segmented, tabs, tooltip,
//           progress), inputs and the form with its validation. Usable on any page without the shell.
//   shell = everything that only makes sense in boards: components (card, table, …), charts, sheet, data source, router, createApp.
// Rule: core files never import shell files (lint rule `layers`).
import fs from 'node:fs';
import path from 'node:path';

/** Classified files of css/ and js/ (exact paths, repo-relative). */
export const CORE = {
  css: ['css/tokens.css', 'css/fonts.css', 'css/base.css', 'css/core.css'],
  js: [
    'js/core.js', 'js/version.js', 'js/theme-init.js', 'js/density.js', 'js/dom.js', 'js/press.js', 'js/overlay.js', 'js/format.js',
    'js/i18n.js', 'js/locales/en.js', 'js/locales/de.js', 'js/locales/es.js', 'js/locales/fr.js',
    'js/icons.js', 'js/icons-data.js', 'js/favicon.js',
    'js/primitives.js', 'js/controls.js', 'js/inputs.js', 'js/inputs-data.js', 'js/form.js',
  ],
};
export const SHELL = {
  css: ['css/components.css', 'css/charts.css'],
  js: [
    'js/tarn.js', 'js/components.js', 'js/widgets.js', 'js/table.js', 'js/filterbar.js', 'js/filters-data.js',
    'js/confirm.js', 'js/actionrun.js', 'js/actions-data.js', 'js/sheet.js', 'js/datacard.js', 'js/markdown.js',
    'js/data.js', 'js/boards.js', 'js/boards-data.js', 'js/router.js', 'js/shell.js',
    'js/charts/index.js', 'js/charts/base.js', 'js/charts/scale.js', 'js/charts/line.js', 'js/charts/bar.js', 'js/charts/small.js', 'js/charts/timeline.js',
  ],
};
/** Assets of both profiles: [folder, pattern]. */
export const ASSETS = [
  ['fonts', /\.woff2$|^OFL-.*\.txt$|^SOURCES\.md$/],
  ['icons', /\.svg$|^LICENSE\.txt$|^SOURCES\.md$/],
];
/** Files at the repo root that every copy and package carries. */
export const TOP = ['VERSION', 'LICENSE', 'NOTICE'];
export const PROFILES = ['core', 'full'];

const rel = (p) => p.split(path.sep).join('/');
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p);
  }
  return out;
}

/** Runtime files of a profile (repo-relative, sorted); files that do not exist are left out. */
export function profileFiles(profile, root) {
  if (!PROFILES.includes(profile)) throw new Error(`unknown profile ${profile} (core | full)`);
  const list = [...CORE.css, ...CORE.js, ...(profile === 'full' ? [...SHELL.css, ...SHELL.js] : [])];
  for (const [dir, re] of ASSETS) for (const f of walk(path.join(root, dir))) if (path.dirname(f) === path.join(root, dir) && re.test(path.basename(f))) list.push(rel(path.relative(root, f)));
  list.push(...TOP);
  return [...new Set(list)].filter((f) => fs.existsSync(path.join(root, f))).sort();
}

/** Every css/ and js/ file must be listed exactly once; every listed file must exist. → { unclassified, missing, twice } */
export function classification(root) {
  const listed = [...CORE.css, ...CORE.js, ...SHELL.css, ...SHELL.js];
  const have = [...walk(path.join(root, 'css')), ...walk(path.join(root, 'js'))].map((f) => rel(path.relative(root, f))).filter((f) => /\.(css|js)$/.test(f));
  const seen = new Set(), twice = [];
  for (const f of listed) { if (seen.has(f)) twice.push(f); seen.add(f); }
  return {
    unclassified: have.filter((f) => !seen.has(f)).sort(),
    missing: listed.filter((f) => !fs.existsSync(path.join(root, f))).sort(),
    twice,
  };
}

/** 'core' | 'shell' | null for a repo-relative path. */
export function layerOf(file) {
  if (CORE.css.includes(file) || CORE.js.includes(file)) return 'core';
  if (SHELL.css.includes(file) || SHELL.js.includes(file)) return 'shell';
  return null;
}
