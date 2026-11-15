// tarn · board file: how a board that lives outside the kit describes itself to the check tools (verify --board, lint --board).
// One JSON file in the board's own folder, `tarn-board.json` (the file or the folder can be named on the command line). All paths in it are
// relative to the folder of the file. Everything except `name` and `pages` has a default.
//
//   {
//     "name": "Homelab board",                      shown in the report
//     "pages": [                                    the pages of the board, as the kit's own tools/verify/targets.mjs lists its pages
//       { "id": "main",                             short name (letters, digits, -), used in findings and snapshot paths
//         "path": "/?lang=en",                      URL path and query on the running server (pin the language with ?lang=)
//         "details": ["jobs?open=a1"],              hashes (without #/) checked as additional states with an open detail
//         "views": ["page"],                        only for a page without shell navigation; with a shell the views are read from it
//         "sizes": ["phone", "desktop"],            narrower than the default (phone, desktop, phone-s, tablet-s, desktop-s or WxH[@DPR][t])
//         "themes": ["dark"],                       narrower than the default (dark, light)
//         "density": "compact" }                    compact (default) | comfortable
//     ],
//     "kit": "vendor/tarn",                         the board's vendored copy of the kit (tools/vendor.mjs --to …), default vendor/tarn
//     "kitUrl": "/tarn/js/tarn.js",                 where the server delivers the kit barrel (default /tarn/js/tarn.js)
//     "clock": "2026-11-09T09:00:00Z",              fixed time for the snapshots (relative times stay stable)
//     "snapshots": "verify/snapshots",              folder of the snapshot files (committed with the board)
//     "exceptions": "verify/exceptions.json",       its own exceptions and known faults, same format as the kit's tools/verify/exceptions.json
//     "lint": {
//       "dirs": ["."],                              what lint walks (css, js, mjs, html)
//       "skip": ["vendor", "verify"],               paths (relative) lint does not enter; the kit copy and dot folders are always skipped
//       "allow": "verify/lint-allow.json",          exceptions and known list for lint (format of the kit's tools/lint/allow.json)
//       "messages": ["messages.js"]                 catalogues: the rule `i18n` (visible text via t()) does not apply to these files
//     }
//   }
import fs from 'node:fs';
import path from 'node:path';
import { SIZES, THEMES, parseSize } from '../verify/targets.mjs';

export const BOARD_FILE = 'tarn-board.json';
export const DEFAULT_CLOCK = '2026-11-09T09:00:00Z';
const KEYS = ['name', 'pages', 'kit', 'kitUrl', 'clock', 'snapshots', 'exceptions', 'lint'];
const PAGE_KEYS = ['id', 'path', 'details', 'views', 'sizes', 'themes', 'density'];
const LINT_KEYS = ['dirs', 'skip', 'allow', 'messages'];

/** Throws Error('…') with a message that names the file and the field; callers turn it into exit code 2. */
export function loadBoard(arg) {
  let file = path.resolve(arg || '.');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, BOARD_FILE);
  if (!fs.existsSync(file)) throw new Error(`board file not found: ${file} (a board describes itself in ${BOARD_FILE}, see docs/checks.md “A board outside the kit”)`);
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} is not valid JSON (${e.message})`); }
  const dir = path.dirname(file);
  const bad = (m) => { throw new Error(`${path.basename(file)}: ${m}`); };
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const strList = (v, what) => { if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x)) bad(`${what} must be a list of non-empty strings`); return v; };
  if (!isObj(j)) bad('the top level must be an object');
  for (const k of Object.keys(j)) if (!KEYS.includes(k) && !k.startsWith('_')) bad(`unknown field “${k}” (${KEYS.join(', ')})`);
  if (typeof j.name !== 'string' || !j.name.trim()) bad('name is required (a non-empty string)');
  if (!Array.isArray(j.pages) || !j.pages.length) bad('pages is required (a non-empty list)');
  const ids = new Set();
  const pages = j.pages.map((p, i) => {
    const at = `pages[${i}]`;
    if (!isObj(p)) bad(`${at} must be an object`);
    for (const k of Object.keys(p)) if (!PAGE_KEYS.includes(k) && !k.startsWith('_')) bad(`${at}: unknown field “${k}” (${PAGE_KEYS.join(', ')})`);
    if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(p.id)) bad(`${at}.id is required (letters, digits, -)`);
    if (ids.has(p.id)) bad(`${at}.id “${p.id}” is used twice`);
    ids.add(p.id);
    if (typeof p.path !== 'string' || !p.path.startsWith('/')) bad(`${at}.path is required and starts with / (e.g. "/?lang=en")`);
    const out = { id: p.id, path: p.path };
    if (p.details !== undefined) out.details = strList(p.details, `${at}.details`).map((d) => d.replace(/^#?\/?/, ''));
    if (p.views !== undefined) out.views = strList(p.views, `${at}.views`);
    if (p.sizes !== undefined) { out.sizes = strList(p.sizes, `${at}.sizes`); for (const s of out.sizes) if (!parseSize(s)) bad(`${at}.sizes: unknown size “${s}” (${Object.keys(SIZES).join(', ')} or WxH[@DPR][t])`); }
    if (p.themes !== undefined) { out.themes = strList(p.themes, `${at}.themes`); for (const t of out.themes) if (!THEMES.includes(t)) bad(`${at}.themes: “${t}” is not dark or light`); }
    if (p.density !== undefined) { if (!['compact', 'comfortable'].includes(p.density)) bad(`${at}.density must be compact or comfortable`); out.density = p.density; }
    return out;
  });
  const str = (k, d) => { if (j[k] === undefined) return d; if (typeof j[k] !== 'string' || !j[k]) bad(`${k} must be a non-empty string`); return j[k]; };
  const clock = str('clock', DEFAULT_CLOCK);
  const clockMs = Date.parse(clock);
  if (Number.isNaN(clockMs)) bad(`clock “${clock}” is not an ISO date (e.g. 2026-11-09T09:00:00Z)`);
  const kitUrl = str('kitUrl', '/tarn/js/tarn.js');
  if (!kitUrl.startsWith('/')) bad('kitUrl starts with / (e.g. /tarn/js/tarn.js)');
  const lint = j.lint === undefined ? {} : j.lint;
  if (!isObj(lint)) bad('lint must be an object');
  for (const k of Object.keys(lint)) if (!LINT_KEYS.includes(k) && !k.startsWith('_')) bad(`lint: unknown field “${k}” (${LINT_KEYS.join(', ')})`);
  const at = (k, d) => path.resolve(dir, str(k, d));
  const inside = (p, what) => { if (p !== dir && !p.startsWith(dir + path.sep)) bad(`${what} must stay inside the board folder`); return p; };
  const lintAllow = lint.allow === undefined ? path.join(dir, 'verify', 'lint-allow.json') : path.resolve(dir, String(lint.allow));
  return {
    file, dir, name: j.name.trim(), pages, clock, clockMs, kitUrl,
    kit: inside(at('kit', 'vendor/tarn'), 'kit'),
    snapshots: inside(at('snapshots', 'verify/snapshots'), 'snapshots'),
    exceptions: at('exceptions', 'verify/exceptions.json'),
    exceptionsGiven: j.exceptions !== undefined,
    lint: {
      dirs: strList(lint.dirs ?? ['.'], 'lint.dirs').map((d) => inside(path.resolve(dir, d), 'lint.dirs')),
      skip: strList(lint.skip ?? ['vendor', 'verify'], 'lint.skip').map((d) => path.resolve(dir, d)),
      allow: lintAllow, allowGiven: lint.allow !== undefined,
      messages: strList(lint.messages ?? ['messages.js'], 'lint.messages').map((d) => path.resolve(dir, d)),
    },
  };
}
